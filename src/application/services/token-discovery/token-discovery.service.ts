import {
  MintInformation,
  ShieldWarning,
  ShieldResponse,
  PriceV3Data,
  PriceV3Response,
  TokenCategory,
  TokenInterval,
  TokenTag,
  TokenDiscoveryPort,
  ShieldPort,
  PriceV3Port,
} from '../../ports/token-discovery.port';
import { LoggerService } from '../../../core/logger/logger.service';

export interface TokenDetails {
  token: MintInformation;
  warnings: ShieldWarning[];
  price: PriceV3Data | null;
}

export interface TokenSearchResult {
  tokens: MintInformation[];
  total: number;
}

export class TokenDiscoveryService {
  constructor(
    private tokensApi: TokenDiscoveryPort,
    private shieldApi: ShieldPort,
    private priceApi: PriceV3Port
  ) {}

  async searchTokens(query: string): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug(`Searching tokens: "${query}"`);
      return await this.tokensApi.searchTokens(query);
    } catch (error) {
      LoggerService.getInstance().error('Token search failed', error as Error);
      throw error;
    }
  }

  async getTokenDetails(mint: string): Promise<TokenDetails> {
    try {
      LoggerService.getInstance().debug(`Getting token details: ${mint}`);

      const [searchResults, shieldResponse, priceResponse] = await Promise.all([
        this.tokensApi.searchTokens(mint),
        this.getShieldSafe([mint]),
        this.getPriceSafe([mint]),
      ]);

      const token = searchResults.find((t) => t.id === mint) ?? searchResults[0];

      if (!token) {
        throw new Error(`Token not found: ${mint}`);
      }

      const warnings = shieldResponse.warnings[mint] ?? [];
      const price = priceResponse.data[mint] ?? null;

      return { token, warnings, price };
    } catch (error) {
      LoggerService.getInstance().error('Failed to get token details', error as Error);
      throw error;
    }
  }

  async getTrendingTokens(
    interval: TokenInterval = '24h',
    limit?: number
  ): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting trending tokens', { interval, limit });
      return await this.tokensApi.getTokensByCategory('toptrending', interval, limit);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get trending tokens', error as Error);
      throw error;
    }
  }

  async getTopTradedTokens(
    interval: TokenInterval = '24h',
    limit?: number
  ): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting top traded tokens', { interval, limit });
      return await this.tokensApi.getTokensByCategory('toptraded', interval, limit);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get top traded tokens', error as Error);
      throw error;
    }
  }

  async getTopOrganicTokens(
    interval: TokenInterval = '24h',
    limit?: number
  ): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting top organic tokens', { interval, limit });
      return await this.tokensApi.getTokensByCategory('toporganicscore', interval, limit);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get top organic tokens', error as Error);
      throw error;
    }
  }

  async getRecentTokens(): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting recent tokens');
      return await this.tokensApi.getRecentTokens();
    } catch (error) {
      LoggerService.getInstance().error('Failed to get recent tokens', error as Error);
      throw error;
    }
  }

  async getTokensByTag(tag: TokenTag): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting tokens by tag', { tag });
      return await this.tokensApi.getTokensByTag(tag);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get tokens by tag', error as Error);
      throw error;
    }
  }

  async getShieldWarnings(mints: string[]): Promise<ShieldResponse> {
    try {
      LoggerService.getInstance().debug('Getting shield warnings', { mints });
      return await this.shieldApi.getShieldWarnings(mints);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get shield warnings', error as Error);
      throw error;
    }
  }

  async getPricesDetailed(mints: string[]): Promise<PriceV3Response> {
    try {
      LoggerService.getInstance().debug('Getting detailed prices', { mints });
      return await this.priceApi.getPricesV3(mints);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get detailed prices', error as Error);
      throw error;
    }
  }

  async getTokensByCategory(
    category: TokenCategory,
    interval: TokenInterval,
    limit?: number
  ): Promise<MintInformation[]> {
    try {
      return await this.tokensApi.getTokensByCategory(category, interval, limit);
    } catch (error) {
      LoggerService.getInstance().error('Failed to get tokens by category', error as Error);
      throw error;
    }
  }

  private async getShieldSafe(mints: string[]): Promise<ShieldResponse> {
    try {
      return await this.shieldApi.getShieldWarnings(mints);
    } catch (error) {
      LoggerService.getInstance().warn(
        `Shield API failed for ${mints.join(',')}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { warnings: {} };
    }
  }

  private async getPriceSafe(mints: string[]): Promise<PriceV3Response> {
    try {
      return await this.priceApi.getPricesV3(mints);
    } catch (error) {
      LoggerService.getInstance().warn(
        `Price V3 API failed for ${mints.join(',')}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { data: {}, timeTaken: 0 };
    }
  }
}
