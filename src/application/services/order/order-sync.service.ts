import { TriggerApiService } from '../../../infrastructure/jupiter-api/trigger/trigger-api.service';
import { TriggerOrder } from '../../../infrastructure/jupiter-api/trigger/trigger.types';
import { TradeService } from '../trade/trade.service';
import { PriceProvider } from '../wallet/wallet-sync.service';
import { TokenInfoProvider } from '../token-info.service';
import { LoggerService } from '../../../core/logger/logger.service';

export interface ActiveOrderWithPrice {
  orderId: string;
  inputMint: string;
  outputMint: string;
  inputSymbol?: string;
  outputSymbol?: string;
  inputAmount: string;
  outputAmount: string;
  targetPrice: number;
  currentPrice: number;
  diffPercent: number;
  direction: 'up' | 'down';
  createdAt: Date;
}

export class OrderSyncService {
  constructor(
    private triggerApi: TriggerApiService,
    private tradeService: TradeService,
    private priceProvider: PriceProvider,
    private tokenInfoProvider: TokenInfoProvider
  ) {}

  async syncFilledOrders(walletId: string, walletAddress: string): Promise<number> {
    try {
      const response = await this.triggerApi.getOrders(walletAddress, 'history');
      let newTradesCount = 0;

      for (const order of response.orders) {
        if (order.status !== 'filled' || !order.signature) {
          continue;
        }

        const alreadyRecorded = await this.tradeService.isTradeRecorded(order.signature);
        if (alreadyRecorded) {
          continue;
        }

        await this.tradeService.recordLimitOrderFill({
          walletId,
          inputMint: order.inputMint,
          outputMint: order.outputMint,
          inputAmount: order.makingAmount,
          outputAmount: order.takingAmount,
          signature: order.signature,
        });

        newTradesCount++;
      }

      return newTradesCount;
    } catch (error) {
      LoggerService.getInstance().warn(
        `Failed to sync filled orders: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return 0;
    }
  }

  async getActiveOrdersWithPrices(walletAddress: string): Promise<ActiveOrderWithPrice[]> {
    const response = await this.triggerApi.getOrders(walletAddress, 'active');
    const orders = response.orders;

    if (orders.length === 0) {
      return [];
    }

    const mints = new Set<string>();
    orders.forEach((order) => {
      mints.add(order.inputMint);
      mints.add(order.outputMint);
    });

    const mintList = Array.from(mints);
    let prices = new Map<string, number>();
    try {
      const priceResults = await this.priceProvider.getPrice(mintList);
      prices = new Map(priceResults.map((p) => [p.mint, p.price]));
    } catch {
      // Prices unavailable
    }

    const tokenInfoMap = await this.tokenInfoProvider.getTokenInfoBatch(mintList);

    const results: ActiveOrderWithPrice[] = [];

    for (const order of orders) {
      const result = await this.processOrder(order, prices, tokenInfoMap);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  private async processOrder(
    order: TriggerOrder,
    prices: Map<string, number>,
    tokenInfoMap: Map<string, { symbol?: string; decimals: number }>
  ): Promise<ActiveOrderWithPrice | null> {
    const inputInfo = tokenInfoMap.get(order.inputMint);
    const outputInfo = tokenInfoMap.get(order.outputMint);

    const inputDecimals = inputInfo?.decimals ?? 9;
    const outputDecimals = outputInfo?.decimals ?? 6;

    const inputAmount = parseFloat(order.makingAmount) / Math.pow(10, inputDecimals);
    const outputAmount = parseFloat(order.takingAmount) / Math.pow(10, outputDecimals);

    const targetPrice = outputAmount / inputAmount;

    const currentPrice = prices.get(order.outputMint)
      ? (prices.get(order.inputMint) ?? 0) / (prices.get(order.outputMint) ?? 1)
      : 0;

    let diffPercent = 0;
    if (currentPrice > 0) {
      diffPercent = ((targetPrice - currentPrice) / currentPrice) * 100;
    }

    const direction: 'up' | 'down' = diffPercent >= 0 ? 'up' : 'down';

    return {
      orderId: order.id,
      inputMint: order.inputMint,
      outputMint: order.outputMint,
      inputSymbol: inputInfo?.symbol,
      outputSymbol: outputInfo?.symbol,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      targetPrice,
      currentPrice,
      diffPercent,
      direction,
      createdAt: new Date(order.createdAt),
    };
  }
}
