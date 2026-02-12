import { JupiterClient, jupiterClient } from '../shared/jupiter-client';
import {
  PriceResult,
  TokenInfo,
  PriceApiResponse,
  PriceDataEntry,
} from '../../../application/ports/jupiter-api.port';
import { LoggerService } from '../../../core/logger/logger.service';

export interface UltraOrderResponse {
  transaction: string;
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  swapType?: string;
  routePlan?: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

export interface UltraExecuteResponse {
  status: string;
  signature: string;
  slot?: number;
  result?: {
    inputAccount?: string;
    outputAccount?: string;
    inAmount?: string;
    outAmount?: string;
  };
}

export class UltraApiService {
  private client: JupiterClient;
  private baseUrl = '/ultra/v1';

  constructor(client: JupiterClient = jupiterClient) {
    this.client = client;
  }

  async getOrder(
    inputMint: string,
    outputMint: string,
    amount: string,
    taker: string,
    slippageBps?: number
  ): Promise<UltraOrderResponse> {
    try {
      const params: Record<string, string | number> = {
        inputMint,
        outputMint,
        amount,
        taker,
      };

      if (slippageBps) {
        params.slippageBps = slippageBps;
      }

      LoggerService.getInstance().debug('Getting Ultra order', {
        inputMint,
        outputMint,
        amount,
        taker,
        slippageBps,
      });

      const response = await this.client.get<UltraOrderResponse>(`${this.baseUrl}/order`, params);

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to get Ultra order', error as Error);
      throw error;
    }
  }

  async executeOrder(signedTransaction: string, requestId: string): Promise<UltraExecuteResponse> {
    try {
      LoggerService.getInstance().debug('Executing Ultra order', { requestId });

      const response = await this.client.post<UltraExecuteResponse>(`${this.baseUrl}/execute`, {
        signedTransaction,
        requestId,
      });

      return response;
    } catch (error) {
      LoggerService.getInstance().error('Failed to execute Ultra order', error as Error);
      throw error;
    }
  }

  async getPrice(mints: string[]): Promise<PriceResult[]> {
    try {
      if (!mints || mints.length === 0) {
        LoggerService.getInstance().debug('No mints provided, skipping price fetch');
        return [];
      }

      const mintList = Array.isArray(mints) ? mints.join(',') : mints;

      LoggerService.getInstance().debug('Getting prices', { mints });

      const response = await this.client.get<PriceApiResponse>('/price/v3', { ids: mintList });

      LoggerService.getInstance().debug('Price API response', {
        response: JSON.stringify(response).substring(0, 500),
      });

      const priceData = response.data || response;

      if (!priceData || Object.keys(priceData).length === 0) {
        LoggerService.getInstance().warn('No price data returned from API');
        return [];
      }

      return Object.entries(priceData || {}).map(([mint, data]: [string, unknown]) => {
        let price = 0;
        if (typeof data === 'number') {
          price = data;
        } else if (typeof data === 'object' && data !== null) {
          const entry = data as PriceDataEntry;
          price = entry.usdPrice ?? entry.price ?? entry.usd ?? 0;
        }
        return {
          mint,
          price,
          timestamp: new Date(),
        };
      });
    } catch (error) {
      LoggerService.getInstance().error('Failed to get prices', error as Error);
      throw error;
    }
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    try {
      LoggerService.getInstance().debug('Searching tokens', { query });

      const response = await this.client.get<TokenInfo[]>(`${this.baseUrl}/search`, { query });

      return response.map((token: TokenInfo) => ({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
        tags: token.tags,
        verified: token.verified,
      }));
    } catch (error) {
      LoggerService.getInstance().error('Failed to search tokens', error as Error);
      throw error;
    }
  }

  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    try {
      LoggerService.getInstance().debug('Getting token info', { mint });

      const response = await this.client.get<TokenInfo>(`${this.baseUrl}/shield`, { mint });

      if (!response) return null;

      return {
        address: response.address,
        name: response.name,
        symbol: response.symbol,
        decimals: response.decimals,
        logoURI: response.logoURI,
        tags: response.tags,
        verified: response.verified,
      };
    } catch (error) {
      LoggerService.getInstance().error('Failed to get token info', error as Error);
      return null;
    }
  }
}

export const ultraApiService = new UltraApiService();
