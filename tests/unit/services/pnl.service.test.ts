import Big from 'big.js';
import { Trade } from '../../../src/domain/entities/trade.entity';
import { PnLService, TokenCost } from '../../../src/application/services/pnl/pnl.service';
import { TradeRepository } from '../../../src/domain/repositories/trade.repository';
import { SolanaRpcPort } from '../../../src/application/ports/blockchain.port';
import { PriceProvider } from '../../../src/application/services/wallet/wallet-sync.service';

describe('PnLService', () => {
  const createTrade = (overrides: Partial<Trade> = {}): Trade => {
    return new Trade(
      overrides.id ?? 'trade-1',
      overrides.walletId ?? 'wallet-1',
      overrides.inputMint ?? 'INPUT-MINT',
      overrides.outputMint ?? 'OUTPUT-MINT',
      overrides.inputAmount ?? '1',
      overrides.outputAmount ?? '100',
      overrides.type ?? 'swap',
      overrides.signature ?? 'sig-1',
      overrides.executedAt ?? new Date('2025-02-13T10:00:00Z'),
      overrides.inputSymbol,
      overrides.outputSymbol,
      overrides.inputUsdPrice,
      overrides.outputUsdPrice,
      overrides.inputUsdValue,
      overrides.outputUsdValue
    );
  };

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

  describe('calculateCostByMint', () => {
    let service: PnLService;

    beforeEach(() => {
      service = new PnLService({} as TradeRepository, {} as SolanaRpcPort, {} as PriceProvider);
    });

    describe('single token — acquisitions only', () => {
      it('should calculate cost for a single buy', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '1',
            inputUsdValue: '100',
            outputUsdValue: '100',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        expect(costs.has(SOL_MINT)).toBe(true);
        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('1');
        expect(solCost.totalDisposed.toString()).toBe('0');
        expect(solCost.remainingCost.toString()).toBe('100');
      });

      it('should calculate cost for multiple buys at different prices', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '1',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '200',
            outputAmount: '1',
            inputUsdValue: '200',
            outputUsdValue: '200',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('2');
        expect(solCost.remainingCost.toString()).toBe('300');
      });

      it('should compute correct average cost after multiple buys', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '1000',
            outputAmount: '10',
            inputUsdValue: '1000',
            outputUsdValue: '1000',
          }),
          createTrade({
            id: 't2',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '1000',
            outputAmount: '5',
            inputUsdValue: '1000',
            outputUsdValue: '1000',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('15');
        expect(solCost.remainingCost.toString()).toBe('2000');
      });

      it('should handle very small amounts (dust)', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '0.0001',
            outputAmount: '0.000001',
            inputUsdValue: '0.0001',
            outputUsdValue: '0.0001',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('0.000001');
        expect(solCost.remainingCost.toString()).toBe('0.0001');
      });

      it('should handle very large amounts', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '1000000000',
            outputAmount: '5000000000',
            inputUsdValue: '1000000000',
            outputUsdValue: '1000000000',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('5000000000');
      });

      it('should handle trade with zero amount (no-op)', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '0',
            outputAmount: '0',
            inputUsdValue: '0',
            outputUsdValue: '0',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('0');
        expect(solCost.remainingCost.toString()).toBe('0');
      });
    });

    describe('single token — acquisitions and disposals', () => {
      it('should reduce cost proportionally on partial sell', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '5',
            outputAmount: '60',
            inputUsdValue: '60',
            outputUsdValue: '60',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('10');
        expect(solCost.totalDisposed.toString()).toBe('5');
        expect(solCost.remainingCost.toString()).toBe('50');
        expect(solCost.realizedPnl.toString()).toBe('10');
      });

      it('should reduce cost to zero on full sell', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '120',
            inputUsdValue: '120',
            outputUsdValue: '120',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('10');
        expect(solCost.totalDisposed.toString()).toBe('10');
        expect(solCost.remainingCost.toString()).toBe('0');
        expect(solCost.realizedPnl.toString()).toBe('20');
      });

      it('should calculate correct realized PnL on profitable sell', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '150',
            inputUsdValue: '150',
            outputUsdValue: '150',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.realizedPnl.toString()).toBe('50');
      });

      it('should calculate correct realized PnL on losing sell', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '70',
            inputUsdValue: '70',
            outputUsdValue: '70',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.realizedPnl.toString()).toBe('-30');
      });

      it('should calculate zero realized PnL on break-even sell', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '100',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.realizedPnl.toString()).toBe('0');
      });

      it('should handle sell after multiple buys (cost average)', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '1000',
            outputAmount: '10',
            inputUsdValue: '1000',
            outputUsdValue: '1000',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '1000',
            outputAmount: '5',
            inputUsdValue: '1000',
            outputUsdValue: '1000',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't3',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '1500',
            inputUsdValue: '1500',
            outputUsdValue: '1500',
            executedAt: new Date('2025-02-03T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('15');
        expect(solCost.totalDisposed.toString()).toBe('10');
        expect(solCost.remainingCost.toFixed(2)).toBe('666.67');
        expect(parseFloat(solCost.realizedPnl.toFixed(2))).toBeCloseTo(166.67, 1);
      });

      it('should handle multiple partial sells', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '3',
            outputAmount: '40',
            inputUsdValue: '40',
            outputUsdValue: '40',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't3',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '3',
            outputAmount: '50',
            inputUsdValue: '50',
            outputUsdValue: '50',
            executedAt: new Date('2025-02-03T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalDisposed.toString()).toBe('6');
        expect(solCost.totalAcquired.toString()).toBe('10');
        expect(parseFloat(solCost.realizedPnl.toFixed(2))).toBeCloseTo(30, 0);
      });

      it('should handle buy → sell → buy → sell cycle', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '5',
            outputAmount: '60',
            inputUsdValue: '60',
            outputUsdValue: '60',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't3',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '80',
            outputAmount: '4',
            inputUsdValue: '80',
            outputUsdValue: '80',
            executedAt: new Date('2025-02-03T10:00:00Z'),
          }),
          createTrade({
            id: 't4',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '9',
            outputAmount: '100',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-04T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('14');
        expect(solCost.totalDisposed.toString()).toBe('14');
        expect(parseFloat(solCost.realizedPnl.toFixed(2))).toBeCloseTo(-20, 0);
      });

      it('should handle selling entire position then buying again', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '120',
            inputUsdValue: '120',
            outputUsdValue: '120',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't3',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '150',
            outputAmount: '10',
            inputUsdValue: '150',
            outputUsdValue: '150',
            executedAt: new Date('2025-02-03T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalDisposed.toString()).toBe('10');
        expect(solCost.totalAcquired.toString()).toBe('20');
        expect(solCost.remainingCost.toString()).toBe('150');
        expect(solCost.realizedPnl.toString()).toBe('20');
      });
    });

    describe('single token — edge cases', () => {
      it('should handle sell when no prior acquisition (cost = 0, full realized loss)', () => {
        const trades = [
          createTrade({
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '10',
            outputAmount: '80',
            inputUsdValue: '80',
            outputUsdValue: '80',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalDisposed.toString()).toBe('10');
        expect(solCost.remainingCost.toString()).toBe('0');
        expect(solCost.realizedPnl.toString()).toBe('80');
      });

      it('should handle trades with null USD values (skip in cost calc)', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: undefined,
            outputUsdValue: undefined,
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        expect(costs.size).toBe(0);
      });

      it('should maintain precision with Big.js (no floating point errors)', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '3',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '1',
            outputAmount: '40',
            inputUsdValue: '40',
            outputUsdValue: '40',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toNumber()).toBe(3);
        expect(parseFloat(solCost.remainingCost.toFixed(2))).toBeCloseTo(66.67, 1);
      });
    });

    describe('multiple tokens', () => {
      it('should track cost independently per mint', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
          }),
          createTrade({
            id: 't2',
            inputMint: USDC_MINT,
            outputMint: BONK_MINT,
            inputAmount: '50',
            outputAmount: '1000000',
            inputUsdValue: '50',
            outputUsdValue: '50',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        expect(costs.get(SOL_MINT)!.remainingCost.toString()).toBe('100');
        expect(costs.get(BONK_MINT)!.remainingCost.toString()).toBe('50');
      });

      it('should handle swap between two non-stablecoin tokens (SOL→BONK)', () => {
        const trades = [
          createTrade({
            inputMint: SOL_MINT,
            outputMint: BONK_MINT,
            inputAmount: '1',
            outputAmount: '5000000',
            inputUsdValue: '180',
            outputUsdValue: '180',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        const bonkCost = costs.get(BONK_MINT)!;

        expect(solCost.totalDisposed.toString()).toBe('1');
        expect(bonkCost.totalAcquired.toString()).toBe('5000000');
        expect(bonkCost.remainingCost.toString()).toBe('180');
      });

      it('should correctly update both input and output sides of a swap', () => {
        const trades = [
          createTrade({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '180',
            outputAmount: '1',
            inputUsdValue: '180',
            outputUsdValue: '180',
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const usdcCost = costs.get(USDC_MINT)!;
        const solCost = costs.get(SOL_MINT)!;

        expect(usdcCost.totalDisposed.toString()).toBe('180');
        expect(usdcCost.realizedPnl.toString()).toBe('180');
        expect(solCost.totalAcquired.toString()).toBe('1');
        expect(solCost.remainingCost.toString()).toBe('180');
      });

      it('should handle complex chain: USDC→SOL→BONK→USDC', () => {
        const trades = [
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '1',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: BONK_MINT,
            inputAmount: '1',
            outputAmount: '5000000',
            inputUsdValue: '120',
            outputUsdValue: '120',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't3',
            inputMint: BONK_MINT,
            outputMint: USDC_MINT,
            inputAmount: '5000000',
            outputAmount: '90',
            inputUsdValue: '90',
            outputUsdValue: '90',
            executedAt: new Date('2025-02-03T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        const bonkCost = costs.get(BONK_MINT)!;

        expect(solCost.totalDisposed.toString()).toBe('1');
        expect(solCost.realizedPnl.toString()).toBe('20');
        expect(bonkCost.totalDisposed.toString()).toBe('5000000');
        expect(bonkCost.realizedPnl.toString()).toBe('-30');
      });
    });

    describe('order of operations', () => {
      it('should process trades in chronological order (executedAt ASC)', () => {
        const trades = [
          createTrade({
            id: 't2',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            inputAmount: '5',
            outputAmount: '60',
            inputUsdValue: '60',
            outputUsdValue: '60',
            executedAt: new Date('2025-02-02T10:00:00Z'),
          }),
          createTrade({
            id: 't1',
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            inputAmount: '100',
            outputAmount: '10',
            inputUsdValue: '100',
            outputUsdValue: '100',
            executedAt: new Date('2025-02-01T10:00:00Z'),
          }),
        ];

        const costs = service.calculateCostByMint(trades);

        const solCost = costs.get(SOL_MINT)!;
        expect(solCost.totalAcquired.toString()).toBe('10');
        expect(solCost.totalDisposed.toString()).toBe('5');
      });
    });
  });

  describe('computePnL', () => {
    let service: PnLService;

    beforeEach(() => {
      service = new PnLService({} as TradeRepository, {} as SolanaRpcPort, {} as PriceProvider);
    });

    const createCosts = (entries: [string, TokenCost][]): Map<string, TokenCost> => {
      return new Map(entries);
    };

    it('should return zero PnL for empty portfolio', () => {
      const costs = createCosts([]);
      const balances = new Map<string, number>();
      const prices = new Map<string, number>();

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalValue).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.totalUnrealizedPnl).toBe(0);
    });

    it('should return zero PnL for portfolio at break-even', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('100'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 10]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalUnrealizedPnl).toBe(0);
    });

    it('should calculate positive unrealized PnL (price went up)', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('100'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 15]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalUnrealizedPnl).toBe(50);
    });

    it('should calculate negative unrealized PnL (price went down)', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('100'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 8]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalUnrealizedPnl).toBe(-20);
    });

    it('should include realized PnL from past sales', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('5'),
            remainingCost: new Big('50'),
            realizedPnl: new Big('25'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 5]]);
      const prices = new Map([[SOL_MINT, 10]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalRealizedPnl).toBe(25);
    });

    it('should mark tokens with balance but no trades as "untracked"', () => {
      const costs = createCosts([]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 100]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.untrackedTokens).toContain(SOL_MINT);
      const token = result.tokens.find((t) => t.mint === SOL_MINT);
      expect(token?.tracked).toBe(false);
    });

    it('should include untracked tokens in totalValue but not in PnL', () => {
      const costs = createCosts([]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 100]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalValue).toBe(1000);
      expect(result.totalUnrealizedPnl).toBe(0);
    });

    it('should still show realized PnL for tokens fully sold', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('10'),
            remainingCost: new Big('0'),
            realizedPnl: new Big('50'),
          },
        ],
      ]);
      const balances = new Map<string, number>();
      const prices = new Map<string, number>();

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalRealizedPnl).toBe(50);
    });

    it('should sum totalValue across all tokens', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('100'),
            realizedPnl: new Big('0'),
          },
        ],
        [
          USDC_MINT,
          {
            totalAcquired: new Big('500'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('500'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([
        [SOL_MINT, 10],
        [USDC_MINT, 500],
      ]);
      const prices = new Map([
        [SOL_MINT, 15],
        [USDC_MINT, 1],
      ]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalValue).toBe(650);
    });

    it('should calculate correct totalUnrealizedPnlPercent', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('100'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 12]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalUnrealizedPnl).toBe(20);
      expect(result.totalUnrealizedPnlPercent).toBe(20);
    });

    it('should handle division by zero (cost = 0, pnlPercent = 0)', () => {
      const costs = createCosts([
        [
          SOL_MINT,
          {
            totalAcquired: new Big('10'),
            totalDisposed: new Big('0'),
            remainingCost: new Big('0'),
            realizedPnl: new Big('0'),
          },
        ],
      ]);
      const balances = new Map([[SOL_MINT, 10]]);
      const prices = new Map([[SOL_MINT, 100]]);

      const result = service.computePnL(costs, balances, prices);

      expect(result.totalUnrealizedPnl).toBe(1000);
      expect(result.totalUnrealizedPnlPercent).toBe(0);
    });
  });
});
