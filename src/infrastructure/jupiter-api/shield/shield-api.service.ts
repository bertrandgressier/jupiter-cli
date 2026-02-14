import { JupiterClient, jupiterClient } from '../shared/jupiter-client';
import { ShieldResponse, ShieldPort } from '../../../application/ports/token-discovery.port';
import { LoggerService } from '../../../core/logger/logger.service';

export class ShieldApiService implements ShieldPort {
  private client: JupiterClient;
  private baseUrl = '/ultra/v1';

  constructor(client: JupiterClient = jupiterClient) {
    this.client = client;
  }

  async getShieldWarnings(mints: string[]): Promise<ShieldResponse> {
    try {
      if (!mints || mints.length === 0) {
        return { warnings: {} };
      }

      const mintList = mints.join(',');

      LoggerService.getInstance().debug('Getting shield warnings', {
        mints: mintList,
      });

      const response = await this.client.get<ShieldResponse>(`${this.baseUrl}/shield`, {
        mints: mintList,
      });

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get shield warnings', error as Error);
      throw error;
    }
  }
}

export const shieldApiService = new ShieldApiService();
