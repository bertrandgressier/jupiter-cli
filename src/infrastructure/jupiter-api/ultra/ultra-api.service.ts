import { JupiterClient, jupiterClient } from '../shared/jupiter-client';
import {
  PriceResult,
  TokenInfo,
  PriceApiResponse,
  PriceDataEntry,
} from '../../../application/ports/jupiter-api.port';
import { LoggerService } from '../../../core/logger/logger.service';
import { JupiterApiError } from '../../../core/errors/api.errors';

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
  signature?: string;
  slot?: number;
  error?: string;
  code?: string;
  details?: {
    reason?: string;
    message?: string;
    [key: string]: unknown;
  };
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

      if (!response.transaction || response.transaction.length === 0) {
        LoggerService.getInstance().error('Empty transaction in order response', undefined, {
          response: JSON.stringify(response).substring(0, 500),
        });
        throw new JupiterApiError(
          'No transaction returned from Jupiter. This usually means insufficient balance or the swap cannot be routed.',
          400,
          { response }
        );
      }

      return response;
    } catch (error) {
      if (error instanceof JupiterApiError) {
        throw error;
      }
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

      LoggerService.getInstance().debug('Ultra execute response', {
        status: response.status,
        error: response.error,
        code: response.code,
        details: response.details,
      });

      if (response.status === 'Failed' || response.error) {
        const errorMessage =
          response.details?.reason ||
          response.details?.message ||
          response.error ||
          `Swap failed with status: ${response.status}`;
        LoggerService.getInstance().error('Ultra order execution failed', undefined, {
          status: response.status,
          error: response.error,
          code: response.code,
          details: response.details,
        });
        throw new JupiterApiError(errorMessage, 400, {
          status: response.status,
          error: response.error,
          code: response.code,
          details: response.details,
          signature: response.signature,
        });
      }

      return response;
    } catch (error) {
      if (error instanceof JupiterApiError) {
        throw error;
      }
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

      interface RawSearchResult {
        id: string;
        name: string;
        symbol: string;
        decimals: number;
        icon?: string;
        logoURI?: string;
        tags?: string[];
        isVerified?: boolean;
        verified?: boolean;
      }

      const response = await this.client.get<RawSearchResult[]>(`${this.baseUrl}/search`, {
        query,
      });

      return response.map((token: RawSearchResult) => ({
        address: token.id,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.icon ?? token.logoURI,
        tags: token.tags,
        verified: token.isVerified ?? token.verified ?? false,
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
