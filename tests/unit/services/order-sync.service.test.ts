import { OrderSyncService } from '../../../src/application/services/order/order-sync.service';
import { TriggerApiService } from '../../../src/infrastructure/jupiter-api/trigger/trigger-api.service';
import { TradeService } from '../../../src/application/services/trade/trade.service';
import { PriceProvider } from '../../../src/application/services/wallet/wallet-sync.service';
import { TokenInfoProvider } from '../../../src/application/services/token-info.service';
import { Trade } from '../../../src/domain/entities/trade.entity';

describe('OrderSyncService', () => {
  let service: OrderSyncService;
  let mockTriggerApi: jest.Mocked<TriggerApiService>;
  let mockTradeService: jest.Mocked<TradeService>;
  let mockPriceProvider: jest.Mocked<PriceProvider>;
  let mockTokenInfoProvider: jest.Mocked<TokenInfoProvider>;

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  beforeEach(() => {
    mockTriggerApi = {
      createOrder: jest.fn(),
      getOrders: jest.fn(),
      cancelOrder: jest.fn(),
      cancelOrders: jest.fn(),
      execute: jest.fn(),
    } as unknown as jest.Mocked<TriggerApiService>;
    mockTradeService = {
      recordSwap: jest.fn(),
      recordLimitOrderFill: jest.fn(),
      getRecentTrades: jest.fn(),
      getTradeHistory: jest.fn(),
      isTradeRecorded: jest.fn(),
    } as unknown as jest.Mocked<TradeService>;
    mockPriceProvider = {
      getPrice: jest.fn(),
    };
    mockTokenInfoProvider = {
      getTokenInfo: jest.fn(),
      getTokenInfoBatch: jest.fn(),
      resolveToken: jest.fn(),
    } as unknown as jest.Mocked<TokenInfoProvider>;

    service = new OrderSyncService(
      mockTriggerApi,
      mockTradeService,
      mockPriceProvider,
      mockTokenInfoProvider
    );
  });

  describe('syncFilledOrders', () => {
    it('should fetch order history from Trigger API', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(mockTriggerApi.getOrders).toHaveBeenCalledWith('wallet-address', 'history');
    });

    it('should create Trade entries for filled orders not yet recorded', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'filled',
            signature: 'sig-123',
          },
        ],
        hasMoreData: false,
      });
      mockTradeService.isTradeRecorded.mockResolvedValue(false);
      mockTradeService.recordLimitOrderFill.mockResolvedValue({} as unknown as Trade);

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(mockTradeService.recordLimitOrderFill).toHaveBeenCalled();
      expect(count).toBe(1);
    });

    it('should skip orders already recorded (by signature match)', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'filled',
            signature: 'sig-123',
          },
        ],
        hasMoreData: false,
      });
      mockTradeService.isTradeRecorded.mockResolvedValue(true);

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(mockTradeService.recordLimitOrderFill).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('should return count of newly synced trades', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'filled',
            signature: 'sig-1',
          },
          {
            id: 'order-2',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '500000000',
            takingAmount: '100000000',
            expiredAt: null,
            createdAt: '2025-02-13T11:00:00Z',
            status: 'filled',
            signature: 'sig-2',
          },
        ],
        hasMoreData: false,
      });
      mockTradeService.isTradeRecorded.mockResolvedValue(false);
      mockTradeService.recordLimitOrderFill.mockResolvedValue({} as unknown as Trade);

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(count).toBe(2);
    });

    it('should handle empty order history', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(count).toBe(0);
    });

    it('should handle API error gracefully (return 0, log warning)', async () => {
      mockTriggerApi.getOrders.mockRejectedValue(new Error('API error'));

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(count).toBe(0);
    });

    it('should skip non-filled orders', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'cancelled',
          },
          {
            id: 'order-2',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T11:00:00Z',
            status: 'active',
          },
        ],
        hasMoreData: false,
      });

      const count = await service.syncFilledOrders('wallet-1', 'wallet-address');

      expect(mockTradeService.recordLimitOrderFill).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });
  });

  describe('getActiveOrdersWithPrices', () => {
    it('should fetch active orders from Trigger API', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      await service.getActiveOrdersWithPrices('wallet-address');

      expect(mockTriggerApi.getOrders).toHaveBeenCalledWith('wallet-address', 'active');
    });

    it('should fetch current prices for all involved tokens', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'active',
          },
        ],
        hasMoreData: false,
      });
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTokenInfoProvider.getTokenInfoBatch.mockResolvedValue(
        new Map([
          [SOL_MINT, { symbol: 'SOL', decimals: 9, mint: SOL_MINT }],
          [USDC_MINT, { symbol: 'USDC', decimals: 6, mint: USDC_MINT }],
        ]) as unknown as ReturnType<TokenInfoProvider['getTokenInfoBatch']>
      );

      await service.getActiveOrdersWithPrices('wallet-address');

      expect(mockPriceProvider.getPrice).toHaveBeenCalledWith([SOL_MINT, USDC_MINT]);
    });

    it('should return empty array if no active orders', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      const result = await service.getActiveOrdersWithPrices('wallet-address');

      expect(result).toEqual([]);
    });

    it('should resolve token symbols for display', async () => {
      mockTriggerApi.getOrders.mockResolvedValue({
        orders: [
          {
            id: 'order-1',
            maker: 'wallet-address',
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: '1000000000',
            takingAmount: '200000000',
            expiredAt: null,
            createdAt: '2025-02-13T10:00:00Z',
            status: 'active',
          },
        ],
        hasMoreData: false,
      });
      mockPriceProvider.getPrice.mockResolvedValue([
        { mint: SOL_MINT, price: 180, timestamp: new Date() },
        { mint: USDC_MINT, price: 1, timestamp: new Date() },
      ]);
      mockTokenInfoProvider.getTokenInfoBatch.mockResolvedValue(
        new Map([
          [SOL_MINT, { symbol: 'SOL', decimals: 9, mint: SOL_MINT }],
          [USDC_MINT, { symbol: 'USDC', decimals: 6, mint: USDC_MINT }],
        ]) as unknown as ReturnType<TokenInfoProvider['getTokenInfoBatch']>
      );

      const result = await service.getActiveOrdersWithPrices('wallet-address');

      expect(result[0]?.inputSymbol).toBe('SOL');
      expect(result[0]?.outputSymbol).toBe('USDC');
    });
  });
});
