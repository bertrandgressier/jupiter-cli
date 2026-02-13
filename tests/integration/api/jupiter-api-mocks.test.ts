import nock from 'nock';
import { UltraApiService } from '../../../src/infrastructure/jupiter-api/ultra/ultra-api.service';
import { JupiterClient } from '../../../src/infrastructure/jupiter-api/shared/jupiter-client';

describe('Jupiter API Mocks', () => {
  const baseURL = 'https://api.jup.ag';
  let ultraApi: UltraApiService;
  let client: JupiterClient;

  beforeEach(() => {
    client = new JupiterClient();
    ultraApi = new UltraApiService(client);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Price API', () => {
    it('should get token prices successfully', async () => {
      const mockResponse = {
        So11111111111111111111111111111111111111112: {
          usdPrice: 150.5,
          createdAt: '2024-01-01T00:00:00Z',
          liquidity: 1000000,
          decimals: 9,
        },
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
          usdPrice: 1.0,
          createdAt: '2024-01-01T00:00:00Z',
          liquidity: 5000000,
          decimals: 6,
        },
      };

      nock(baseURL).get('/price/v3').query(true).reply(200, mockResponse);

      const prices = await ultraApi.getPrice([
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ]);

      expect(prices).toHaveLength(2);
      expect(prices[0]).toBeDefined();
      expect(prices[1]).toBeDefined();
      expect(prices[0]?.mint).toBe('So11111111111111111111111111111111111111112');
      expect(prices[0]?.price).toBe(150.5);
      expect(prices[1]?.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(prices[1]?.price).toBe(1.0);
    });

    it('should handle API errors gracefully', async () => {
      nock(baseURL).get('/price/v3').query(true).reply(401, { error: 'Unauthorized' });

      await expect(ultraApi.getPrice(['SOL'])).rejects.toThrow('Unauthorized');
    });

    it('should handle rate limiting', async () => {
      nock(baseURL).get('/price/v3').query(true).reply(429, {}, { 'retry-after': '60' });

      await expect(ultraApi.getPrice(['SOL'])).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Order API', () => {
    it('should get swap order successfully', async () => {
      const mockOrder = {
        transaction: 'base64encodedtransaction',
        requestId: 'test-request-id',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '150000000',
        otherAmountThreshold: '148500000',
        slippageBps: 100,
        priceImpactPct: '0.5',
        routePlan: [
          {
            swapInfo: {
              ammKey: 'test-amm',
              label: 'Test AMM',
              inputMint: 'So11111111111111111111111111111111111111112',
              outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              inAmount: '1000000000',
              outAmount: '150000000',
              feeAmount: '1000000',
              feeMint: 'So11111111111111111111111111111111111111112',
            },
            percent: 100,
          },
        ],
      };

      nock(baseURL).get('/ultra/v1/order').query(true).reply(200, mockOrder);

      const order = await ultraApi.getOrder(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000000',
        'test-wallet-address'
      );

      expect(order.inputMint).toBe('So11111111111111111111111111111111111111112');
      expect(order.outputMint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(order.inAmount).toBe('1000000000');
      expect(order.outAmount).toBe('150000000');
      expect(order.transaction).toBe('base64encodedtransaction');
      expect(order.requestId).toBe('test-request-id');
    });

    it('should handle insufficient liquidity', async () => {
      nock(baseURL)
        .get('/ultra/v1/order')
        .query(true)
        .reply(400, { error: 'Insufficient liquidity' });

      await expect(
        ultraApi.getOrder('SOL', 'USDC', '1000000000000000', 'test-wallet')
      ).rejects.toThrow();
    });
  });

  describe('Token Search API', () => {
    it('should search tokens successfully', async () => {
      const mockTokens = [
        {
          address: 'So11111111111111111111111111111111111111112',
          name: 'Wrapped SOL',
          symbol: 'SOL',
          decimals: 9,
          logoURI: 'https://example.com/sol.png',
          tags: ['verified', 'community'],
          verified: true,
        },
        {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          logoURI: 'https://example.com/usdc.png',
          tags: ['verified', 'stablecoin'],
          verified: true,
        },
      ];

      nock(baseURL).get('/ultra/v1/search').query({ query: 'sol' }).reply(200, mockTokens);

      const tokens = await ultraApi.searchTokens('sol');

      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toBeDefined();
      expect(tokens[1]).toBeDefined();
      expect(tokens[0]?.symbol).toBe('SOL');
      expect(tokens[1]?.symbol).toBe('USDC');
    });

    it('should return empty array for no results', async () => {
      nock(baseURL).get('/ultra/v1/search').query({ query: 'xyznonexistent' }).reply(200, []);

      const tokens = await ultraApi.searchTokens('xyznonexistent');

      expect(tokens).toHaveLength(0);
    });
  });
});
