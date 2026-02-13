import { TriggerApiService } from '../../../src/infrastructure/jupiter-api/trigger/trigger-api.service';
import { JupiterClient } from '../../../src/infrastructure/jupiter-api/shared/jupiter-client';

jest.mock('../../../src/infrastructure/jupiter-api/shared/jupiter-client');

describe('TriggerApiService', () => {
  let service: TriggerApiService;
  let mockClient: {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    };
    (JupiterClient as jest.Mock).mockImplementation(() => mockClient);
    service = new TriggerApiService(new JupiterClient());
  });

  describe('createOrder', () => {
    it('should POST to /trigger/v1/createOrder with correct body', async () => {
      mockClient.post.mockResolvedValue({
        orderId: 'order-123',
        transaction: 'base64tx',
        requestId: 'req-123',
      });

      const result = await service.createOrder({
        maker: 'wallet-address',
        makingAmount: '1000000000',
        takingAmount: '200000000',
        inputMint: 'SOL-MINT',
        outputMint: 'USDC-MINT',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/trigger/v1/createOrder', {
        maker: 'wallet-address',
        makingAmount: '1000000000',
        takingAmount: '200000000',
        inputMint: 'SOL-MINT',
        outputMint: 'USDC-MINT',
        expiredAt: undefined,
      });
      expect(result.orderId).toBe('order-123');
    });

    it('should return order ID, transaction, and requestId', async () => {
      mockClient.post.mockResolvedValue({
        orderId: 'order-456',
        transaction: 'signed-tx',
        requestId: 'req-456',
      });

      const result = await service.createOrder({
        maker: 'wallet-address',
        makingAmount: '1000000000',
        takingAmount: '200000000',
        inputMint: 'SOL-MINT',
        outputMint: 'USDC-MINT',
      });

      expect(result).toEqual({
        orderId: 'order-456',
        transaction: 'signed-tx',
        requestId: 'req-456',
      });
    });

    it('should pass optional expiredAt parameter', async () => {
      mockClient.post.mockResolvedValue({
        orderId: 'order-789',
        transaction: 'tx',
        requestId: 'req-789',
      });

      await service.createOrder({
        maker: 'wallet-address',
        makingAmount: '1000000000',
        takingAmount: '200000000',
        inputMint: 'SOL-MINT',
        outputMint: 'USDC-MINT',
        expiredAt: 1735689600,
      });

      expect(mockClient.post).toHaveBeenCalledWith('/trigger/v1/createOrder', {
        maker: 'wallet-address',
        makingAmount: '1000000000',
        takingAmount: '200000000',
        inputMint: 'SOL-MINT',
        outputMint: 'USDC-MINT',
        expiredAt: 1735689600,
      });
    });
  });

  describe('getOrders', () => {
    it('should GET /trigger/v1/getTriggerOrders with orderStatus=active', async () => {
      mockClient.get.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      await service.getOrders('wallet-address', 'active');

      expect(mockClient.get).toHaveBeenCalledWith('/trigger/v1/getTriggerOrders', {
        user: 'wallet-address',
        orderStatus: 'active',
        page: 1,
      });
    });

    it('should GET /trigger/v1/getTriggerOrders with orderStatus=history', async () => {
      mockClient.get.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      await service.getOrders('wallet-address', 'history');

      expect(mockClient.get).toHaveBeenCalledWith('/trigger/v1/getTriggerOrders', {
        user: 'wallet-address',
        orderStatus: 'history',
        page: 1,
      });
    });

    it('should pass page parameter', async () => {
      mockClient.get.mockResolvedValue({
        orders: [],
        hasMoreData: true,
      });

      await service.getOrders('wallet-address', 'history', 2);

      expect(mockClient.get).toHaveBeenCalledWith('/trigger/v1/getTriggerOrders', {
        user: 'wallet-address',
        orderStatus: 'history',
        page: 2,
      });
    });

    it('should return hasMoreData flag for pagination', async () => {
      mockClient.get.mockResolvedValue({
        orders: [],
        hasMoreData: true,
      });

      const result = await service.getOrders('wallet-address', 'active');

      expect(result.hasMoreData).toBe(true);
    });

    it('should return empty array if no orders', async () => {
      mockClient.get.mockResolvedValue({
        orders: [],
        hasMoreData: false,
      });

      const result = await service.getOrders('wallet-address', 'active');

      expect(result.orders).toEqual([]);
    });
  });

  describe('cancelOrder', () => {
    it('should POST to /trigger/v1/cancelOrder with maker and order', async () => {
      mockClient.post.mockResolvedValue({
        transaction: 'cancel-tx',
        requestId: 'cancel-req-123',
      });

      const result = await service.cancelOrder('wallet-address', 'order-123');

      expect(mockClient.post).toHaveBeenCalledWith('/trigger/v1/cancelOrder', {
        maker: 'wallet-address',
        order: 'order-123',
      });
      expect(result.transaction).toBe('cancel-tx');
    });

    it('should return transaction to sign', async () => {
      mockClient.post.mockResolvedValue({
        transaction: 'cancel-tx-base64',
        requestId: 'cancel-req-456',
      });

      const result = await service.cancelOrder('wallet-address', 'order-456');

      expect(result.transaction).toBe('cancel-tx-base64');
      expect(result.requestId).toBe('cancel-req-456');
    });
  });

  describe('cancelOrders', () => {
    it('should POST to /trigger/v1/cancelOrders with array of order IDs', async () => {
      mockClient.post.mockResolvedValue({
        transactions: ['tx1', 'tx2'],
        requestId: 'cancel-all-req',
      });

      const result = await service.cancelOrders('wallet-address', ['order-1', 'order-2']);

      expect(mockClient.post).toHaveBeenCalledWith('/trigger/v1/cancelOrders', {
        maker: 'wallet-address',
        orders: ['order-1', 'order-2'],
      });
      expect(result.transactions).toEqual(['tx1', 'tx2']);
    });

    it('should return array of transactions', async () => {
      mockClient.post.mockResolvedValue({
        transactions: ['cancel-tx-1', 'cancel-tx-2', 'cancel-tx-3'],
        requestId: 'cancel-all',
      });

      const result = await service.cancelOrders('wallet-address', [
        'order-1',
        'order-2',
        'order-3',
      ]);

      expect(result.transactions).toHaveLength(3);
    });
  });

  describe('execute', () => {
    it('should POST to /trigger/v1/execute with signed transaction', async () => {
      mockClient.post.mockResolvedValue({
        signature: 'exec-sig-123',
        status: 'confirmed',
      });

      const result = await service.execute('signed-tx-base64', 'req-123');

      expect(mockClient.post).toHaveBeenCalledWith('/trigger/v1/execute', {
        signedTransaction: 'signed-tx-base64',
        requestId: 'req-123',
      });
      expect(result.signature).toBe('exec-sig-123');
    });

    it('should return signature and status', async () => {
      mockClient.post.mockResolvedValue({
        signature: 'exec-sig-456',
        status: 'confirmed',
      });

      const result = await service.execute('signed-tx', 'req-456');

      expect(result.signature).toBe('exec-sig-456');
      expect(result.status).toBe('confirmed');
    });
  });
});
