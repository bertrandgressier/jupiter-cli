import { TokenInfo } from '../../domain/entities/token-info.entity';
import { TokenInfoRepository } from '../../domain/repositories/token-info.repository';
import { UltraApiService } from '../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { LoggerService } from '../../core/logger/logger.service';

export interface TokenInfoProvider {
  getTokenInfo(mint: string): Promise<TokenInfo | null>;
  getTokenInfoBatch(mints: string[]): Promise<Map<string, TokenInfo>>;
}

interface KnownToken {
  symbol: string;
  name: string;
  decimals: number;
  verified: boolean;
}

export class TokenInfoService implements TokenInfoProvider {
  private static KNOWN_TOKENS: Map<string, KnownToken> = new Map([
    [
      'So11111111111111111111111111111111111111112',
      { symbol: 'SOL', name: 'Solana', decimals: 9, verified: true },
    ],
    [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      { symbol: 'USDC', name: 'USD Coin', decimals: 6, verified: true },
    ],
    [
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      { symbol: 'USDT', name: 'Tether USD', decimals: 6, verified: true },
    ],
    [
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      { symbol: 'BONK', name: 'Bonk', decimals: 5, verified: true },
    ],
    [
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      { symbol: 'JUP', name: 'Jupiter', decimals: 6, verified: true },
    ],
  ]);

  private tokenInfoRepo: TokenInfoRepository;
  private ultraApi: UltraApiService;

  constructor(tokenInfoRepo: TokenInfoRepository, ultraApi?: UltraApiService) {
    this.tokenInfoRepo = tokenInfoRepo;
    this.ultraApi = ultraApi ?? new UltraApiService();
  }

  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    const cached = await this.tokenInfoRepo.findByMint(mint);
    if (cached) {
      return cached;
    }

    const known = TokenInfoService.KNOWN_TOKENS.get(mint);
    if (known) {
      const tokenInfo = new TokenInfo(mint, known.symbol, known.decimals, {
        name: known.name,
        verified: known.verified,
      });
      await this.tokenInfoRepo.upsert(tokenInfo);
      return tokenInfo;
    }

    const fetched = await this.fetchFromApi(mint);
    if (fetched) {
      await this.tokenInfoRepo.upsert(fetched);
      return fetched;
    }

    return null;
  }

  async getTokenInfoBatch(mints: string[]): Promise<Map<string, TokenInfo>> {
    const result = new Map<string, TokenInfo>();

    if (mints.length === 0) {
      return result;
    }

    const cached = await this.tokenInfoRepo.findByMints(mints);
    for (const token of cached) {
      result.set(token.mint, token);
    }

    const missing = mints.filter((m) => !result.has(m));

    for (const mint of missing) {
      const known = TokenInfoService.KNOWN_TOKENS.get(mint);
      if (known) {
        const tokenInfo = new TokenInfo(mint, known.symbol, known.decimals, {
          name: known.name,
          verified: known.verified,
        });
        await this.tokenInfoRepo.upsert(tokenInfo);
        result.set(mint, tokenInfo);
        continue;
      }

      const fetched = await this.fetchFromApi(mint);
      if (fetched) {
        await this.tokenInfoRepo.upsert(fetched);
        result.set(mint, fetched);
      }
    }

    return result;
  }

  private async fetchFromApi(mint: string): Promise<TokenInfo | null> {
    try {
      LoggerService.getInstance().debug(`Fetching token info from API for ${mint}`);

      const apiResult = await this.ultraApi.getTokenInfo(mint);
      if (!apiResult) {
        return null;
      }

      return new TokenInfo(apiResult.address, apiResult.symbol, apiResult.decimals, {
        name: apiResult.name,
        logoURI: apiResult.logoURI,
        verified: apiResult.verified ?? false,
      });
    } catch (error) {
      LoggerService.getInstance().warn(
        `Failed to fetch token info for ${mint}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }
}
