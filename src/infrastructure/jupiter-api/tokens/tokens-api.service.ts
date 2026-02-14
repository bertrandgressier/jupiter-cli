import { JupiterClient, jupiterClient } from '../shared/jupiter-client';
import {
  MintInformation,
  TokenCategory,
  TokenInterval,
  TokenTag,
  TokenDiscoveryPort,
} from '../../../application/ports/token-discovery.port';
import { LoggerService } from '../../../core/logger/logger.service';

export class TokensApiService implements TokenDiscoveryPort {
  private client: JupiterClient;
  private baseUrl = '/tokens/v2';

  constructor(client: JupiterClient = jupiterClient) {
    this.client = client;
  }

  async searchTokens(query: string): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Searching tokens via Tokens V2 API', { query });

      const response = await this.client.get<MintInformation[]>(`${this.baseUrl}/search`, {
        query,
      });

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to search tokens', error as Error);
      throw error;
    }
  }

  async getTokensByTag(tag: TokenTag): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting tokens by tag', { tag });

      const response = await this.client.get<MintInformation[]>(`${this.baseUrl}/tag`, {
        query: tag,
      });

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get tokens by tag', error as Error);
      throw error;
    }
  }

  async getTokensByCategory(
    category: TokenCategory,
    interval: TokenInterval,
    limit?: number
  ): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting tokens by category', {
        category,
        interval,
        limit,
      });

      const params: Record<string, string | number> = {};
      if (limit) {
        params.limit = limit;
      }

      const response = await this.client.get<MintInformation[]>(
        `${this.baseUrl}/${category}/${interval}`,
        Object.keys(params).length > 0 ? params : undefined
      );

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get tokens by category', error as Error);
      throw error;
    }
  }

  async getRecentTokens(): Promise<MintInformation[]> {
    try {
      LoggerService.getInstance().debug('Getting recent tokens');

      const response = await this.client.get<MintInformation[]>(`${this.baseUrl}/recent`);

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get recent tokens', error as Error);
      throw error;
    }
  }
}

export const tokensApiService = new TokensApiService();
