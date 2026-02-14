import nock from 'nock';
import { TokensApiService } from '../../../src/infrastructure/jupiter-api/tokens/tokens-api.service';
import { ShieldApiService } from '../../../src/infrastructure/jupiter-api/shield/shield-api.service';
import { PriceV3ApiService } from '../../../src/infrastructure/jupiter-api/price/price-v3-api.service';
import { JupiterClient } from '../../../src/infrastructure/jupiter-api/shared/jupiter-client';

describe('Token Discovery API Mocks', () => {
  const baseURL = 'https://api.jup.ag';
  let client: JupiterClient;

  beforeEach(() => {
    client = new JupiterClient();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('TokensApiService', () => {
    let tokensApi: TokensApiService;

    beforeEach(() => {
      tokensApi = new TokensApiService(client);
    });

    describe('searchTokens', () => {
      it('should search tokens successfully', async () => {
        const mockTokens = [
          {
            id: 'So11111111111111111111111111111111111111112',
            name: 'Wrapped SOL',
            symbol: 'SOL',
            icon: null,
            decimals: 9,
            tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            holderCount: 1000000,
            fdv: 50000000000,
            mcap: 50000000000,
            usdPrice: 150.5,
            liquidity: 100000000,
            organicScore: 95,
            organicScoreLabel: 'high',
            isVerified: true,
            tags: ['verified'],
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ];

        nock(baseURL).get('/tokens/v2/search').query({ query: 'SOL' }).reply(200, mockTokens);

        const result = await tokensApi.searchTokens('SOL');

        expect(result).toHaveLength(1);
        expect(result[0]?.symbol).toBe('SOL');
        expect(result[0]?.usdPrice).toBe(150.5);
        expect(result[0]?.organicScore).toBe(95);
      });

      it('should return empty array for no results', async () => {
        nock(baseURL).get('/tokens/v2/search').query({ query: 'nonexistent' }).reply(200, []);

        const result = await tokensApi.searchTokens('nonexistent');

        expect(result).toHaveLength(0);
      });

      it('should handle API errors', async () => {
        nock(baseURL)
          .get('/tokens/v2/search')
          .query({ query: 'SOL' })
          .reply(500, { error: 'Internal Server Error' });

        await expect(tokensApi.searchTokens('SOL')).rejects.toThrow();
      });
    });

    describe('getTokensByTag', () => {
      it('should get verified tokens', async () => {
        const mockTokens = [
          {
            id: 'So11111111111111111111111111111111111111112',
            name: 'Wrapped SOL',
            symbol: 'SOL',
            decimals: 9,
            tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            organicScore: 95,
            organicScoreLabel: 'high',
            isVerified: true,
            tags: ['verified'],
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ];

        nock(baseURL).get('/tokens/v2/tag').query({ query: 'verified' }).reply(200, mockTokens);

        const result = await tokensApi.getTokensByTag('verified');

        expect(result).toHaveLength(1);
        expect(result[0]?.isVerified).toBe(true);
      });

      it('should get LST tokens', async () => {
        nock(baseURL).get('/tokens/v2/tag').query({ query: 'lst' }).reply(200, []);

        const result = await tokensApi.getTokensByTag('lst');

        expect(result).toHaveLength(0);
      });
    });

    describe('getTokensByCategory', () => {
      it('should get trending tokens for 24h interval', async () => {
        const mockTokens = [
          {
            id: 'TrendingToken11111111111111111111111111111',
            name: 'Trending Token',
            symbol: 'TREND',
            decimals: 9,
            tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            usdPrice: 0.5,
            organicScore: 70,
            organicScoreLabel: 'medium',
            stats24h: {
              priceChange: 25.0,
              buyVolume: 1000000,
              sellVolume: 800000,
              numBuys: 5000,
              numSells: 4000,
              numTraders: 2000,
            },
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ];

        nock(baseURL).get('/tokens/v2/toptrending/24h').reply(200, mockTokens);

        const result = await tokensApi.getTokensByCategory('toptrending', '24h');

        expect(result).toHaveLength(1);
        expect(result[0]?.symbol).toBe('TREND');
        expect(result[0]?.stats24h?.priceChange).toBe(25.0);
      });

      it('should pass limit parameter', async () => {
        nock(baseURL).get('/tokens/v2/toptraded/1h').query({ limit: '10' }).reply(200, []);

        const result = await tokensApi.getTokensByCategory('toptraded', '1h', 10);

        expect(result).toHaveLength(0);
      });

      it('should get top organic score tokens', async () => {
        nock(baseURL).get('/tokens/v2/toporganicscore/5m').reply(200, []);

        const result = await tokensApi.getTokensByCategory('toporganicscore', '5m');

        expect(result).toHaveLength(0);
      });
    });

    describe('getRecentTokens', () => {
      it('should get recently listed tokens', async () => {
        const mockTokens = [
          {
            id: 'NewToken111111111111111111111111111111111111',
            name: 'New Token',
            symbol: 'NEW',
            decimals: 9,
            tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            holderCount: 50,
            usdPrice: 0.001,
            liquidity: 5000,
            organicScore: 10,
            organicScoreLabel: 'low',
            isVerified: false,
            firstPool: {
              id: 'PoolAddress11111111111111111111111111111111',
              createdAt: '2025-01-15T10:30:00.000Z',
            },
            updatedAt: '2025-01-15T10:30:00.000Z',
          },
        ];

        nock(baseURL).get('/tokens/v2/recent').reply(200, mockTokens);

        const result = await tokensApi.getRecentTokens();

        expect(result).toHaveLength(1);
        expect(result[0]?.symbol).toBe('NEW');
        expect(result[0]?.isVerified).toBe(false);
        expect(result[0]?.firstPool).toBeDefined();
      });
    });
  });

  describe('ShieldApiService', () => {
    let shieldApi: ShieldApiService;

    beforeEach(() => {
      shieldApi = new ShieldApiService(client);
    });

    it('should return warnings for multiple mints', async () => {
      const mockResponse = {
        warnings: {
          So11111111111111111111111111111111111111112: [],
          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: [
            {
              type: 'HAS_FREEZE_AUTHORITY',
              message: 'The authority owner can freeze your token account',
              severity: 'warning',
            },
            {
              type: 'HAS_MINT_AUTHORITY',
              message: 'The authority owner can mint more tokens',
              severity: 'info',
            },
          ],
          SuspiciousToken1111111111111111111111111111: [
            {
              type: 'NOT_VERIFIED',
              message: 'This token is not verified',
              severity: 'info',
            },
            {
              type: 'LOW_ORGANIC_ACTIVITY',
              message: 'This token has low organic activity',
              severity: 'info',
            },
            {
              type: 'SUSPICIOUS_DEV_ACTIVITY',
              message: 'Suspicious developer activity detected',
              severity: 'critical',
            },
          ],
        },
      };

      nock(baseURL).get('/ultra/v1/shield').query(true).reply(200, mockResponse);

      const result = await shieldApi.getShieldWarnings([
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'SuspiciousToken1111111111111111111111111111',
      ]);

      expect(result.warnings['So11111111111111111111111111111111111111112']).toHaveLength(0);
      expect(result.warnings['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']).toHaveLength(2);
      expect(result.warnings['SuspiciousToken1111111111111111111111111111']).toHaveLength(3);

      const criticalWarning = result.warnings['SuspiciousToken1111111111111111111111111111']?.find(
        (w) => w.severity === 'critical'
      );
      expect(criticalWarning?.type).toBe('SUSPICIOUS_DEV_ACTIVITY');
    });

    it('should return empty warnings for empty mints array', async () => {
      const result = await shieldApi.getShieldWarnings([]);

      expect(result.warnings).toEqual({});
    });

    it('should handle API errors', async () => {
      nock(baseURL).get('/ultra/v1/shield').query(true).reply(400, { error: 'Bad request' });

      await expect(shieldApi.getShieldWarnings(['invalid'])).rejects.toThrow();
    });
  });

  describe('PriceV3ApiService', () => {
    let priceApi: PriceV3ApiService;

    beforeEach(() => {
      priceApi = new PriceV3ApiService(client);
    });

    it('should return detailed price data', async () => {
      const mockResponse = {
        data: {
          So11111111111111111111111111111111111111112: {
            id: 'So11111111111111111111111111111111111111112',
            type: 'derivedPrice',
            price: '171.340000000',
            extraInfo: {
              lastSwappedPrice: {
                lastJupiterSellAt: 1710000000,
                lastJupiterSellPrice: '171.34',
                lastJupiterBuyAt: 1710000001,
                lastJupiterBuyPrice: '171.35',
              },
              quotedPrice: {
                buyPrice: '171.35',
                buyAt: 1710000001,
                sellPrice: '171.34',
                sellAt: 1710000000,
              },
              confidenceLevel: 'high',
              depth: {
                buyPriceImpactRatio: {
                  depth: {
                    '10': 0.001,
                    '100': 0.005,
                    '1000': 0.012,
                  },
                },
                sellPriceImpactRatio: {
                  depth: {
                    '10': 0.001,
                    '100': 0.004,
                    '1000': 0.011,
                  },
                },
              },
            },
          },
        },
        timeTaken: 0.005,
      };

      nock(baseURL).get('/price/v3').query(true).reply(200, mockResponse);

      const result = await priceApi.getPricesV3(['So11111111111111111111111111111111111111112']);

      const solPrice = result.data['So11111111111111111111111111111111111111112'];
      expect(solPrice).toBeDefined();
      expect(solPrice?.price).toBe('171.340000000');
      expect(solPrice?.extraInfo?.confidenceLevel).toBe('high');
      expect(solPrice?.extraInfo?.quotedPrice?.buyPrice).toBe('171.35');
      expect(solPrice?.extraInfo?.depth?.buyPriceImpactRatio?.depth['10']).toBe(0.001);
    });

    it('should return empty data for empty mints array', async () => {
      const result = await priceApi.getPricesV3([]);

      expect(result.data).toEqual({});
      expect(result.timeTaken).toBe(0);
    });

    it('should handle API errors', async () => {
      nock(baseURL).get('/price/v3').query(true).reply(500, { error: 'Internal server error' });

      await expect(
        priceApi.getPricesV3(['So11111111111111111111111111111111111111112'])
      ).rejects.toThrow();
    });

    it('should handle rate limiting', async () => {
      nock(baseURL).get('/price/v3').query(true).reply(429, {}, { 'retry-after': '60' });

      await expect(
        priceApi.getPricesV3(['So11111111111111111111111111111111111111112'])
      ).rejects.toThrow('Rate limit exceeded');
    });
  });
});
