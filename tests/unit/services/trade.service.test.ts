import { Trade } from '../../../src/domain/entities/trade.entity';
import { TradeService } from '../../../src/application/services/trade/trade.service';
import { TradeRepository } from '../../../src/domain/repositories/trade.repository';
import { PriceProvider } from '../../../src/application/services/wallet/wallet-sync.service';

describe('TradeService', () => {
  let service: TradeService;
  let mockTradeRepo: jest.Mocked<TradeRepository>;
  let mockPriceProvider: jest.Mocked<PriceProvider>;

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  beforeEach(() => {
    mockTradeRepo = {
      create: jest.fn(),
      findByWallet: jest.fn(),
      countByWallet: jest.fn(),
      findBySignature: jest.fn(),
      findByWalletAndMint: jest.fn(),
    };
    mockPriceProvider = {
      getPrice: jest.fn(),
    };
    service = new TradeService(mockTradeRepo, mockPriceProvider);
  });

  describe('recordSwap', () => {
    it('should create a trade with type "swap"', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '180',
        inputSymbol: 'SOL',
        outputSymbol: 'USDC',
        signature: 'sig-123',
      });

      expect(result.type).toBe('swap');
    });

    it('should fetch USD prices from price provider', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '180',
        signature: 'sig-123',
      });

      expect(mockPriceProvider.getPrice).toHaveBeenCalledWith([SOL_MINT, USDC_MINT]);
    });

    it('should calculate inputUsdValue = inputAmount × inputUsdPrice', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1.5',
        outputAmount: '270',
        signature: 'sig-123',
      });

      expect(result.inputUsdPrice).toBe('180');
      expect(result.inputUsdValue).toBe('270');
    });

    it('should calculate outputUsdValue = outputAmount × outputUsdPrice', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '180',
        signature: 'sig-123',
      });

      expect(result.outputUsdPrice).toBe('1');
      expect(result.outputUsdValue).toBe('180');
    });

    it('should store null USD values if price API returns no data', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: 'UNKNOWN-MINT',
        outputMint: 'ANOTHER-UNKNOWN',
        inputAmount: '1',
        outputAmount: '180',
        signature: 'sig-123',
      });

      expect(result.inputUsdPrice).toBeUndefined();
      expect(result.outputUsdPrice).toBeUndefined();
      expect(result.inputUsdValue).toBeUndefined();
      expect(result.outputUsdValue).toBeUndefined();
    });

    it('should not throw if price fetch fails (trade still recorded)', async () => {
      mockPriceProvider.getPrice.mockRejectedValue(new Error('API error'));
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '180',
        signature: 'sig-123',
      });

      expect(result).toBeDefined();
      expect(result.inputUsdValue).toBeUndefined();
    });

    it('should use stablecoin price ($1.00) as fallback for USDC', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordSwap({
        walletId: 'wallet-1',
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        inputAmount: '180',
        outputAmount: '1',
        signature: 'sig-123',
      });

      expect(result.inputUsdPrice).toBe('1');
      expect(result.inputUsdValue).toBe('180');
    });
  });

  describe('recordLimitOrderFill', () => {
    it('should create a trade with type "limit_order"', async () => {
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordLimitOrderFill({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '200',
        inputSymbol: 'SOL',
        outputSymbol: 'USDC',
        signature: 'sig-456',
      });

      expect(result.type).toBe('limit_order');
    });

    it('should calculate implicit price from makingAmount/takingAmount', async () => {
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTradeRepo.create.mockImplementation(async (trade) => trade);

      const result = await service.recordLimitOrderFill({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '200',
        signature: 'sig-456',
      });

      expect(result.inputUsdValue).toBe('180');
      expect(result.outputUsdValue).toBe('200');
    });

    it('should not create duplicate trade if signature already exists', async () => {
      mockTradeRepo.findBySignature.mockResolvedValue(
        new Trade(
          'existing-trade',
          'wallet-1',
          SOL_MINT,
          USDC_MINT,
          '1',
          '200',
          'limit_order',
          'sig-456',
          new Date()
        )
      );

      const result = await service.recordLimitOrderFill({
        walletId: 'wallet-1',
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputAmount: '1',
        outputAmount: '200',
        signature: 'sig-456',
      });

      expect(mockTradeRepo.create).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-trade');
    });
  });

  describe('getRecentTrades', () => {
    it('should return trades ordered by executedAt DESC', async () => {
      const trade1 = new Trade(
        't1',
        'wallet-1',
        SOL_MINT,
        USDC_MINT,
        '1',
        '180',
        'swap',
        'sig1',
        new Date('2025-02-13T14:00:00Z')
      );
      const trade2 = new Trade(
        't2',
        'wallet-1',
        USDC_MINT,
        SOL_MINT,
        '180',
        '1',
        'swap',
        'sig2',
        new Date('2025-02-13T15:00:00Z')
      );
      mockTradeRepo.findByWallet.mockResolvedValue([trade2, trade1]);

      const result = await service.getRecentTrades('wallet-1');

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]?.id).toBe('t2');
      expect(result[1]?.id).toBe('t1');
    });

    it('should respect limit parameter', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);

      await service.getRecentTrades('wallet-1', 10);

      expect(mockTradeRepo.findByWallet).toHaveBeenCalledWith('wallet-1', { limit: 10 });
    });

    it('should default to 5 trades', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);

      await service.getRecentTrades('wallet-1');

      expect(mockTradeRepo.findByWallet).toHaveBeenCalledWith('wallet-1', { limit: 5 });
    });

    it('should return empty array if no trades', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);

      const result = await service.getRecentTrades('wallet-1');

      expect(result).toEqual([]);
    });
  });

  describe('getTradeHistory', () => {
    it('should return trades with total count', async () => {
      const trades = [
        new Trade('t1', 'wallet-1', SOL_MINT, USDC_MINT, '1', '180', 'swap', 'sig1', new Date()),
      ];
      mockTradeRepo.findByWallet.mockResolvedValue(trades);
      mockTradeRepo.countByWallet.mockResolvedValue(42);

      const result = await service.getTradeHistory('wallet-1');

      expect(result.trades).toEqual(trades);
      expect(result.total).toBe(42);
    });

    it('should support pagination (limit + offset)', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);
      mockTradeRepo.countByWallet.mockResolvedValue(100);

      await service.getTradeHistory('wallet-1', { limit: 20, offset: 40 });

      expect(mockTradeRepo.findByWallet).toHaveBeenCalledWith('wallet-1', {
        limit: 20,
        offset: 40,
      });
    });

    it('should filter by mint (input OR output matches)', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);
      mockTradeRepo.countByWallet.mockResolvedValue(0);

      await service.getTradeHistory('wallet-1', { mint: SOL_MINT });

      expect(mockTradeRepo.findByWallet).toHaveBeenCalledWith('wallet-1', {
        mint: SOL_MINT,
      });
    });

    it('should filter by type', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);
      mockTradeRepo.countByWallet.mockResolvedValue(0);

      await service.getTradeHistory('wallet-1', { type: 'limit_order' });

      expect(mockTradeRepo.findByWallet).toHaveBeenCalledWith('wallet-1', {
        type: 'limit_order',
      });
    });

    it('should return empty result for wallet with no trades', async () => {
      mockTradeRepo.findByWallet.mockResolvedValue([]);
      mockTradeRepo.countByWallet.mockResolvedValue(0);

      const result = await service.getTradeHistory('empty-wallet');

      expect(result.trades).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('isTradeRecorded', () => {
    it('should return true if signature exists in DB', async () => {
      mockTradeRepo.findBySignature.mockResolvedValue(
        new Trade('t1', 'wallet-1', SOL_MINT, USDC_MINT, '1', '180', 'swap', 'sig-123', new Date())
      );

      const result = await service.isTradeRecorded('sig-123');

      expect(result).toBe(true);
    });

    it('should return false if signature not found', async () => {
      mockTradeRepo.findBySignature.mockResolvedValue(null);

      const result = await service.isTradeRecorded('nonexistent');

      expect(result).toBe(false);
    });
  });
});
