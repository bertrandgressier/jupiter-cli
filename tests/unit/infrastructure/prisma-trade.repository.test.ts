import { Trade } from '../../../src/domain/entities/trade.entity';
import { PrismaTradeRepository } from '../../../src/infrastructure/repositories/prisma-trade.repository';
import { PrismaClient, Trade as PrismaTrade } from '@prisma/client';

describe('PrismaTradeRepository', () => {
  let repository: PrismaTradeRepository;
  let mockPrisma: {
    trade: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const createTestTrade = (overrides: Partial<Trade> = {}): Trade => {
    return new Trade(
      overrides.id ?? 'trade-1',
      overrides.walletId ?? 'wallet-1',
      overrides.inputMint ?? 'So11111111111111111111111111111111111111112',
      overrides.outputMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      overrides.inputAmount ?? '1.5',
      overrides.outputAmount ?? '270.0',
      overrides.type ?? 'swap',
      overrides.signature ?? 'sig-123',
      overrides.executedAt ?? new Date('2025-02-13T14:30:00Z'),
      overrides.inputSymbol ?? 'SOL',
      overrides.outputSymbol ?? 'USDC',
      overrides.inputUsdPrice ?? '180.00',
      overrides.outputUsdPrice ?? '1.00',
      overrides.inputUsdValue ?? '270.00',
      overrides.outputUsdValue ?? '270.00'
    );
  };

  const createPrismaTrade = (overrides: Partial<PrismaTrade> = {}): PrismaTrade => {
    return {
      id: overrides.id ?? 'trade-1',
      walletId: overrides.walletId ?? 'wallet-1',
      inputMint: overrides.inputMint ?? 'So11111111111111111111111111111111111111112',
      outputMint: overrides.outputMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inputAmount: overrides.inputAmount ?? '1.5',
      outputAmount: overrides.outputAmount ?? '270.0',
      type: overrides.type ?? 'swap',
      signature: overrides.signature ?? 'sig-123',
      executedAt: overrides.executedAt ?? new Date('2025-02-13T14:30:00Z'),
      inputSymbol: overrides.inputSymbol ?? 'SOL',
      outputSymbol: overrides.outputSymbol ?? 'USDC',
      inputUsdPrice: overrides.inputUsdPrice ?? '180.00',
      outputUsdPrice: overrides.outputUsdPrice ?? '1.00',
      inputUsdValue: overrides.inputUsdValue ?? '270.00',
      outputUsdValue: overrides.outputUsdValue ?? '270.00',
    } as PrismaTrade;
  };

  beforeEach(() => {
    mockPrisma = {
      trade: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    repository = new PrismaTradeRepository(mockPrisma as unknown as PrismaClient);
  });

  describe('create', () => {
    it('should insert a trade record', async () => {
      const trade = createTestTrade();
      mockPrisma.trade.create.mockResolvedValue(createPrismaTrade());

      const result = await repository.create(trade);

      expect(mockPrisma.trade.create).toHaveBeenCalledWith({
        data: {
          id: trade.id,
          walletId: trade.walletId,
          inputMint: trade.inputMint,
          outputMint: trade.outputMint,
          inputAmount: trade.inputAmount,
          outputAmount: trade.outputAmount,
          type: trade.type,
          signature: trade.signature,
          executedAt: trade.executedAt,
          inputSymbol: trade.inputSymbol,
          outputSymbol: trade.outputSymbol,
          inputUsdPrice: trade.inputUsdPrice,
          outputUsdPrice: trade.outputUsdPrice,
          inputUsdValue: trade.inputUsdValue,
          outputUsdValue: trade.outputUsdValue,
        },
      });
      expect(result).toBeInstanceOf(Trade);
    });

    it('should return the created trade as entity', async () => {
      const trade = createTestTrade();
      mockPrisma.trade.create.mockResolvedValue(createPrismaTrade());

      const result = await repository.create(trade);

      expect(result.id).toBe('trade-1');
      expect(result.walletId).toBe('wallet-1');
      expect(result.type).toBe('swap');
    });

    it('should handle null optional fields', async () => {
      const trade = createTestTrade({
        inputSymbol: undefined,
        outputSymbol: undefined,
        inputUsdPrice: undefined,
        outputUsdPrice: undefined,
        inputUsdValue: undefined,
        outputUsdValue: undefined,
      });
      mockPrisma.trade.create.mockResolvedValue({
        id: 'trade-1',
        walletId: 'wallet-1',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inputAmount: '1.5',
        outputAmount: '270.0',
        type: 'swap',
        signature: 'sig-123',
        executedAt: new Date('2025-02-13T14:30:00Z'),
        inputSymbol: null,
        outputSymbol: null,
        inputUsdPrice: null,
        outputUsdPrice: null,
        inputUsdValue: null,
        outputUsdValue: null,
      } as PrismaTrade);

      const result = await repository.create(trade);

      expect(result.inputSymbol).toBeUndefined();
      expect(result.outputSymbol).toBeUndefined();
    });
  });

  describe('findByWallet', () => {
    it('should return all trades for a wallet, ordered by executedAt DESC', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([
        createPrismaTrade({ id: 'trade-2', executedAt: new Date('2025-02-13T15:00:00Z') }),
        createPrismaTrade({ id: 'trade-1', executedAt: new Date('2025-02-13T14:00:00Z') }),
      ]);

      const result = await repository.findByWallet('wallet-1');

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith({
        where: { walletId: 'wallet-1' },
        orderBy: { executedAt: 'desc' },
        skip: undefined,
        take: undefined,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Trade);
    });

    it('should filter by mint (match inputMint OR outputMint)', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([createPrismaTrade()]);

      await repository.findByWallet('wallet-1', { mint: 'SOL-MINT' });

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith({
        where: {
          walletId: 'wallet-1',
          OR: [{ inputMint: 'SOL-MINT' }, { outputMint: 'SOL-MINT' }],
        },
        orderBy: { executedAt: 'desc' },
        skip: undefined,
        take: undefined,
      });
    });

    it('should filter by type', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([createPrismaTrade({ type: 'limit_order' })]);

      await repository.findByWallet('wallet-1', { type: 'limit_order' });

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith({
        where: { walletId: 'wallet-1', type: 'limit_order' },
        orderBy: { executedAt: 'desc' },
        skip: undefined,
        take: undefined,
      });
    });

    it('should respect limit', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([]);

      await repository.findByWallet('wallet-1', { limit: 10 });

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('should respect offset', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([]);

      await repository.findByWallet('wallet-1', { offset: 20 });

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20 }));
    });

    it('should return empty array if no trades', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([]);

      const result = await repository.findByWallet('wallet-1');

      expect(result).toEqual([]);
    });
  });

  describe('countByWallet', () => {
    it('should return total count of trades for wallet', async () => {
      mockPrisma.trade.count.mockResolvedValue(42);

      const result = await repository.countByWallet('wallet-1');

      expect(mockPrisma.trade.count).toHaveBeenCalledWith({
        where: { walletId: 'wallet-1' },
      });
      expect(result).toBe(42);
    });

    it('should respect filters (mint, type)', async () => {
      mockPrisma.trade.count.mockResolvedValue(5);

      await repository.countByWallet('wallet-1', { mint: 'SOL-MINT', type: 'swap' });

      expect(mockPrisma.trade.count).toHaveBeenCalledWith({
        where: {
          walletId: 'wallet-1',
          type: 'swap',
          OR: [{ inputMint: 'SOL-MINT' }, { outputMint: 'SOL-MINT' }],
        },
      });
    });

    it('should return 0 for empty wallet', async () => {
      mockPrisma.trade.count.mockResolvedValue(0);

      const result = await repository.countByWallet('empty-wallet');

      expect(result).toBe(0);
    });
  });

  describe('findBySignature', () => {
    it('should return trade matching signature', async () => {
      mockPrisma.trade.findFirst.mockResolvedValue(createPrismaTrade({ signature: 'sig-abc' }));

      const result = await repository.findBySignature('sig-abc');

      expect(mockPrisma.trade.findFirst).toHaveBeenCalledWith({
        where: { signature: 'sig-abc' },
      });
      expect(result).toBeInstanceOf(Trade);
      expect(result?.signature).toBe('sig-abc');
    });

    it('should return null if not found', async () => {
      mockPrisma.trade.findFirst.mockResolvedValue(null);

      const result = await repository.findBySignature('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByWalletAndMint', () => {
    it('should return trades where mint appears as input OR output', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([
        createPrismaTrade({ inputMint: 'SOL-MINT' }),
        createPrismaTrade({ outputMint: 'SOL-MINT' }),
      ]);

      const result = await repository.findByWalletAndMint('wallet-1', 'SOL-MINT');

      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith({
        where: {
          walletId: 'wallet-1',
          OR: [{ inputMint: 'SOL-MINT' }, { outputMint: 'SOL-MINT' }],
        },
        orderBy: { executedAt: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no matches', async () => {
      mockPrisma.trade.findMany.mockResolvedValue([]);

      const result = await repository.findByWalletAndMint('wallet-1', 'UNKNOWN-MINT');

      expect(result).toEqual([]);
    });
  });
});
