import { randomUUID } from 'crypto';
import { Trade, TradeType } from '../../../domain/entities/trade.entity';
import { TradeRepository } from '../../../domain/repositories/trade.repository';
import { PriceProvider } from '../wallet/wallet-sync.service';

const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '2WMgWtgG5vY7bZcPtbZznvEJWSh4rk1SSpHoegLtha7X', // PYUSD
]);

export interface RecordSwapParams {
  walletId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  signature: string;
  inputSymbol?: string;
  outputSymbol?: string;
}

export interface RecordLimitFillParams {
  walletId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  signature: string;
  inputSymbol?: string;
  outputSymbol?: string;
}

export interface TradeHistoryOptions {
  mint?: string;
  type?: TradeType;
  limit?: number;
  offset?: number;
}

export class TradeService {
  constructor(
    private tradeRepo: TradeRepository,
    private priceProvider: PriceProvider
  ) {}

  async recordSwap(params: RecordSwapParams): Promise<Trade> {
    const { inputMint, outputMint, inputAmount, outputAmount } = params;

    let inputUsdPrice: string | undefined;
    let outputUsdPrice: string | undefined;
    let inputUsdValue: string | undefined;
    let outputUsdValue: string | undefined;

    try {
      const prices = await this.priceProvider.getPrice([inputMint, outputMint]);
      const priceMap = new Map(prices.map((p) => [p.mint, p.price]));

      const inputPrice = priceMap.get(inputMint) ?? this.getStablecoinPrice(inputMint);
      const outputPrice = priceMap.get(outputMint) ?? this.getStablecoinPrice(outputMint);

      if (inputPrice !== undefined) {
        inputUsdPrice = inputPrice.toString();
        inputUsdValue = (parseFloat(inputAmount) * inputPrice).toString();
      }

      if (outputPrice !== undefined) {
        outputUsdPrice = outputPrice.toString();
        outputUsdValue = (parseFloat(outputAmount) * outputPrice).toString();
      }
    } catch {
      // Price fetch failed, store null values
    }

    const trade = new Trade(
      randomUUID(),
      params.walletId,
      inputMint,
      outputMint,
      inputAmount,
      outputAmount,
      'swap',
      params.signature,
      new Date(),
      params.inputSymbol,
      params.outputSymbol,
      inputUsdPrice,
      outputUsdPrice,
      inputUsdValue,
      outputUsdValue
    );

    return this.tradeRepo.create(trade);
  }

  async recordLimitOrderFill(params: RecordLimitFillParams): Promise<Trade> {
    const existing = await this.tradeRepo.findBySignature(params.signature);
    if (existing) {
      return existing;
    }

    // Fetch current prices for USD value calculation
    let inputUsdPrice: string | undefined;
    let outputUsdPrice: string | undefined;
    let inputUsdValue: string | undefined;
    let outputUsdValue: string | undefined;

    try {
      const prices = await this.priceProvider.getPrice([params.inputMint, params.outputMint]);
      const priceMap = new Map(prices.map((p) => [p.mint, p.price]));

      const inputPrice =
        priceMap.get(params.inputMint) ?? this.getStablecoinPrice(params.inputMint);
      const outputPrice =
        priceMap.get(params.outputMint) ?? this.getStablecoinPrice(params.outputMint);

      if (inputPrice !== undefined) {
        inputUsdPrice = inputPrice.toString();
        inputUsdValue = (parseFloat(params.inputAmount) * inputPrice).toString();
      }

      if (outputPrice !== undefined) {
        outputUsdPrice = outputPrice.toString();
        outputUsdValue = (parseFloat(params.outputAmount) * outputPrice).toString();
      }
    } catch {
      // Price fetch failed, store undefined values
    }

    const trade = new Trade(
      randomUUID(),
      params.walletId,
      params.inputMint,
      params.outputMint,
      params.inputAmount,
      params.outputAmount,
      'limit_order',
      params.signature,
      new Date(),
      params.inputSymbol,
      params.outputSymbol,
      inputUsdPrice,
      outputUsdPrice,
      inputUsdValue,
      outputUsdValue
    );

    return this.tradeRepo.create(trade);
  }

  async getRecentTrades(walletId: string, limit: number = 5): Promise<Trade[]> {
    return this.tradeRepo.findByWallet(walletId, { limit });
  }

  async getTradeHistory(
    walletId: string,
    options?: TradeHistoryOptions
  ): Promise<{ trades: Trade[]; total: number }> {
    const [trades, total] = await Promise.all([
      this.tradeRepo.findByWallet(walletId, options),
      this.tradeRepo.countByWallet(walletId, options),
    ]);

    return { trades, total };
  }

  async isTradeRecorded(signature: string): Promise<boolean> {
    const trade = await this.tradeRepo.findBySignature(signature);
    return trade !== null;
  }

  private getStablecoinPrice(mint: string): number | undefined {
    if (STABLECOIN_MINTS.has(mint)) {
      return 1;
    }
    return undefined;
  }
}
