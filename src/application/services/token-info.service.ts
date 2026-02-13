import { TokenInfo } from '../../domain/entities/token-info.entity';
import { TokenInfoRepository } from '../../domain/repositories/token-info.repository';
import { UltraApiService } from '../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { LoggerService } from '../../core/logger/logger.service';
import { TokenNotFoundError } from '../../core/errors/token.errors';

export interface ResolvedToken {
  mint: string;
  symbol: string;
  decimals: number;
  name?: string;
}

export interface TokenInfoProvider {
  getTokenInfo(mint: string): Promise<TokenInfo | null>;
  getTokenInfoBatch(mints: string[]): Promise<Map<string, TokenInfo>>;
  resolveToken(identifier: string): Promise<ResolvedToken>;
}

interface KnownToken {
  symbol: string;
  name: string;
  decimals: number;
  verified: boolean;
}

export class TokenInfoService implements TokenInfoProvider {
  private static MINT_MIN_LENGTH = 32;
  private static MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

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

  async resolveToken(identifier: string): Promise<ResolvedToken> {
    if (this.isMintAddress(identifier)) {
      const tokenInfo = await this.getTokenInfo(identifier);
      if (tokenInfo) {
        return {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          name: tokenInfo.name,
        };
      }
      throw new TokenNotFoundError(identifier);
    }

    const upperSymbol = identifier.toUpperCase();

    for (const [mint, known] of TokenInfoService.KNOWN_TOKENS) {
      if (known.symbol.toUpperCase() === upperSymbol) {
        await this.getTokenInfo(mint);
        return {
          mint,
          symbol: known.symbol,
          decimals: known.decimals,
          name: known.name,
        };
      }
    }

    const searchResult = await this.searchAndCache(identifier);
    if (searchResult) {
      return {
        mint: searchResult.mint,
        symbol: searchResult.symbol,
        decimals: searchResult.decimals,
        name: searchResult.name,
      };
    }

    throw new TokenNotFoundError(identifier);
  }

  private isMintAddress(value: string): boolean {
    return (
      value.length >= TokenInfoService.MINT_MIN_LENGTH && TokenInfoService.MINT_REGEX.test(value)
    );
  }

  private async searchAndCache(query: string): Promise<TokenInfo | null> {
    try {
      LoggerService.getInstance().debug(`Searching token via API for "${query}"`);

      const results = await this.ultraApi.searchTokens(query);
      if (results.length === 0) {
        return null;
      }

      const exactMatch = results.find((t) => t.symbol.toUpperCase() === query.toUpperCase());
      const token = exactMatch ?? results[0];

      if (!token) {
        return null;
      }

      const tokenInfo = new TokenInfo(token.address, token.symbol, token.decimals, {
        name: token.name,
        logoURI: token.logoURI,
        verified: token.verified ?? false,
      });

      await this.tokenInfoRepo.upsert(tokenInfo);
      return tokenInfo;
    } catch (error) {
      LoggerService.getInstance().warn(
        `Failed to search token "${query}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }
}
