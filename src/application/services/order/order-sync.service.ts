import { TriggerApiService } from '../../../infrastructure/jupiter-api/trigger/trigger-api.service';
import { TriggerOrder } from '../../../infrastructure/jupiter-api/trigger/trigger.types';
import { PriceProvider } from '../wallet/wallet-sync.service';
import { TokenInfoProvider } from '../token-info.service';

export interface ActiveOrderWithPrice {
  orderId: string;
  inputMint: string;
  outputMint: string;
  inputSymbol?: string;
  outputSymbol?: string;
  inputAmount: string;
  outputAmount: string;
  inputUsdValue: number;
  targetPrice: number;
  currentPrice: number;
  diffPercent: number;
  direction: 'up' | 'down';
  createdAt: Date;
}

export class OrderSyncService {
  constructor(
    private triggerApi: TriggerApiService,
    private priceProvider: PriceProvider,
    private tokenInfoProvider: TokenInfoProvider
  ) {}

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

    // Calculate USD value of input tokens
    const inputPrice = prices.get(order.inputMint) ?? 0;
    const inputUsdValue = inputAmount * inputPrice;

    return {
      orderId: order.orderKey || order.id || order.orderId || '',
      inputMint: order.inputMint,
      outputMint: order.outputMint,
      inputSymbol: inputInfo?.symbol,
      outputSymbol: outputInfo?.symbol,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      inputUsdValue,
      targetPrice,
      currentPrice,
      diffPercent,
      direction,
      createdAt: new Date(order.createdAt),
    };
  }
}
