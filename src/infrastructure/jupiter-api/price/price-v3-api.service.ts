import { JupiterClient, jupiterClient } from '../shared/jupiter-client';
import { PriceV3Response, PriceV3Port } from '../../../application/ports/token-discovery.port';
import { LoggerService } from '../../../core/logger/logger.service';

export class PriceV3ApiService implements PriceV3Port {
  private client: JupiterClient;

  constructor(client: JupiterClient = jupiterClient) {
    this.client = client;
  }

  async getPricesV3(mints: string[]): Promise<PriceV3Response> {
    try {
      if (!mints || mints.length === 0) {
        return { data: {}, timeTaken: 0 };
      }

      const mintList = mints.join(',');

      LoggerService.getInstance().debug('Getting prices via Price V3 API', {
        mints: mintList,
      });

      const response = await this.client.get<PriceV3Response>('/price/v3', {
        ids: mintList,
      });

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get prices from Price V3 API', error as Error);
      throw error;
    }
  }
}

export const priceV3ApiService = new PriceV3ApiService();
