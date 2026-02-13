import Big from 'big.js';
import { Trade } from '../../../domain/entities/trade.entity';
import { TradeRepository } from '../../../domain/repositories/trade.repository';
import { SolanaRpcPort } from '../../ports/blockchain.port';
import { PriceProvider } from '../wallet/wallet-sync.service';

export interface TokenCost {
  totalAcquired: Big;
  totalDisposed: Big;
  remainingCost: Big;
  realizedPnl: Big;
}

export interface TokenPnL {
  mint: string;
  symbol?: string;
  balance: number;
  currentPrice: number;
  currentValue: number;
  avgCost: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  tracked: boolean;
}

export interface PnLResult {
  tokens: TokenPnL[];
  totalValue: number;
  totalCost: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  totalRealizedPnl: number;
  untrackedTokens: string[];
}

export class PnLService {
  constructor(
    private tradeRepo: TradeRepository,
    private rpcService: SolanaRpcPort,
    private priceProvider: PriceProvider
  ) {}

  async calculatePnL(walletId: string, walletAddress: string, mint?: string): Promise<PnLResult> {
    const trades = mint
      ? await this.tradeRepo.findByWalletAndMint(walletId, mint)
      : await this.tradeRepo.findByWallet(walletId);

    const costs = this.calculateCostByMint(trades);

    const walletTokens = await this.rpcService.getTokenAccounts(walletAddress);

    const balances = new Map<string, number>();
    if (walletTokens.solBalance > 0) {
      balances.set('So11111111111111111111111111111111111111112', walletTokens.solBalance);
    }
    for (const token of walletTokens.tokens) {
      balances.set(token.mint, token.uiAmount);
    }

    const mints = Array.from(balances.keys());
    let prices = new Map<string, number>();
    try {
      const priceResults = await this.priceProvider.getPrice(mints);
      prices = new Map(priceResults.map((p) => [p.mint, p.price]));
    } catch {
      // Prices unavailable, use 0
    }

    return this.computePnL(costs, balances, prices);
  }

  calculateCostByMint(trades: Trade[]): Map<string, TokenCost> {
    const costs = new Map<string, TokenCost>();

    const sortedTrades = [...trades].sort(
      (a, b) => a.executedAt.getTime() - b.executedAt.getTime()
    );

    for (const trade of sortedTrades) {
      if (!trade.inputUsdValue || !trade.outputUsdValue) {
        continue;
      }

      const inputUsdValue = new Big(trade.inputUsdValue);
      const outputUsdValue = new Big(trade.outputUsdValue);
      const inputAmount = new Big(trade.inputAmount);
      const outputAmount = new Big(trade.outputAmount);

      if (!costs.has(trade.outputMint)) {
        costs.set(trade.outputMint, {
          totalAcquired: new Big(0),
          totalDisposed: new Big(0),
          remainingCost: new Big(0),
          realizedPnl: new Big(0),
        });
      }

      const outputCost = costs.get(trade.outputMint);
      if (outputCost) {
        outputCost.totalAcquired = outputCost.totalAcquired.plus(outputAmount);
        outputCost.remainingCost = outputCost.remainingCost.plus(outputUsdValue);
      }

      if (!costs.has(trade.inputMint)) {
        costs.set(trade.inputMint, {
          totalAcquired: new Big(0),
          totalDisposed: new Big(0),
          remainingCost: new Big(0),
          realizedPnl: new Big(0),
        });
      }

      const inputCost = costs.get(trade.inputMint);
      if (!inputCost) {
        continue;
      }

      if (inputCost.totalAcquired.gt(0) && inputAmount.gt(0)) {
        const remainingUnits = inputCost.totalAcquired.minus(inputCost.totalDisposed);
        const ratio = inputAmount.div(remainingUnits);
        const costRemoved = inputCost.remainingCost.times(ratio);
        const pnl = inputUsdValue.minus(costRemoved);

        inputCost.realizedPnl = inputCost.realizedPnl.plus(pnl);
        inputCost.totalDisposed = inputCost.totalDisposed.plus(inputAmount);
        inputCost.remainingCost = inputCost.remainingCost.minus(costRemoved);
      } else {
        inputCost.totalDisposed = inputCost.totalDisposed.plus(inputAmount);
        inputCost.realizedPnl = inputCost.realizedPnl.plus(inputUsdValue);
      }
    }

    return costs;
  }

  computePnL(
    costs: Map<string, TokenCost>,
    balances: Map<string, number>,
    prices: Map<string, number>
  ): PnLResult {
    const tokens: TokenPnL[] = [];
    const untrackedTokens: string[] = [];
    let totalValue = 0;
    let totalCost = 0;
    let totalUnrealizedPnl = 0;
    let totalRealizedPnl = 0;

    for (const [mint, balance] of balances) {
      const currentPrice = prices.get(mint) || 0;
      const currentValue = balance * currentPrice;
      totalValue += currentValue;

      const costData = costs.get(mint);

      if (!costData) {
        untrackedTokens.push(mint);
        tokens.push({
          mint,
          balance,
          currentPrice,
          currentValue,
          avgCost: 0,
          totalCost: 0,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          realizedPnl: 0,
          tracked: false,
        });
        continue;
      }

      const remainingUnits = costData.totalAcquired.minus(costData.totalDisposed);
      const totalCostValue = costData.remainingCost.toNumber();
      const avgCost = remainingUnits.gt(0)
        ? costData.remainingCost.div(remainingUnits).toNumber()
        : 0;

      const unrealizedPnl = currentValue - totalCostValue;
      const unrealizedPnlPercent = totalCostValue > 0 ? (unrealizedPnl / totalCostValue) * 100 : 0;

      totalCost += totalCostValue;
      totalUnrealizedPnl += unrealizedPnl;
      totalRealizedPnl += costData.realizedPnl.toNumber();

      tokens.push({
        mint,
        balance,
        currentPrice,
        currentValue,
        avgCost,
        totalCost: totalCostValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        realizedPnl: costData.realizedPnl.toNumber(),
        tracked: true,
      });
    }

    for (const [mint, costData] of costs) {
      if (!balances.has(mint) && costData.realizedPnl.gt(0)) {
        totalRealizedPnl += costData.realizedPnl.toNumber();
      }
    }

    const totalUnrealizedPnlPercent = totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0;

    return {
      tokens,
      totalValue,
      totalCost,
      totalUnrealizedPnl,
      totalUnrealizedPnlPercent,
      totalRealizedPnl,
      untrackedTokens,
    };
  }
}
