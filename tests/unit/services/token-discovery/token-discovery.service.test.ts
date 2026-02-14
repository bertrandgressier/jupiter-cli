import { TokenDiscoveryService } from '../../../../src/application/services/token-discovery/token-discovery.service';
import {
  TokenDiscoveryPort,
  ShieldPort,
  PriceV3Port,
  MintInformation,
  ShieldResponse,
  PriceV3Response,
} from '../../../../src/application/ports/token-discovery.port';

function createMintInfo(overrides: Partial<MintInformation> = {}): MintInformation {
  return {
    id: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
    icon: null,
    decimals: 9,
    twitter: null,
    telegram: null,
    website: null,
    dev: null,
    circSupply: null,
    totalSupply: null,
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    launchpad: null,
    graduatedPool: null,
    graduatedAt: null,
    holderCount: 1000000,
    fdv: 50000000000,
    mcap: 50000000000,
    usdPrice: 150.5,
    liquidity: 100000000,
    stats5m: null,
    stats1h: null,
    stats6h: null,
    stats24h: {
      priceChange: 2.5,
      holderChange: 0.1,
      liquidityChange: 1.0,
      volumeChange: 5.0,
      buyVolume: 5000000,
      sellVolume: 4500000,
      buyOrganicVolume: 4000000,
      sellOrganicVolume: 3500000,
      numBuys: 10000,
      numSells: 9500,
      numTraders: 5000,
      numOrganicBuyers: 4000,
      numNetBuyers: 500,
    },
    firstPool: null,
    audit: null,
    organicScore: 85,
    organicScoreLabel: 'high',
    isVerified: true,
    cexes: null,
    tags: ['verified'],
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockTokensApi(): jest.Mocked<TokenDiscoveryPort> {
  return {
    searchTokens: jest.fn().mockResolvedValue([]),
    getTokensByTag: jest.fn().mockResolvedValue([]),
    getTokensByCategory: jest.fn().mockResolvedValue([]),
    getRecentTokens: jest.fn().mockResolvedValue([]),
  };
}

function createMockShieldApi(): jest.Mocked<ShieldPort> {
  return {
    getShieldWarnings: jest.fn().mockResolvedValue({ warnings: {} }),
  };
}

function createMockPriceApi(): jest.Mocked<PriceV3Port> {
  return {
    getPricesV3: jest.fn().mockResolvedValue({ data: {}, timeTaken: 0 }),
  };
}

describe('TokenDiscoveryService', () => {
  let service: TokenDiscoveryService;
  let mockTokensApi: jest.Mocked<TokenDiscoveryPort>;
  let mockShieldApi: jest.Mocked<ShieldPort>;
  let mockPriceApi: jest.Mocked<PriceV3Port>;

  beforeEach(() => {
    mockTokensApi = createMockTokensApi();
    mockShieldApi = createMockShieldApi();
    mockPriceApi = createMockPriceApi();
    service = new TokenDiscoveryService(mockTokensApi, mockShieldApi, mockPriceApi);
  });

  describe('searchTokens', () => {
    it('should delegate to tokens API', async () => {
      const tokens = [createMintInfo()];
      mockTokensApi.searchTokens.mockResolvedValueOnce(tokens);

      const result = await service.searchTokens('SOL');

      expect(result).toEqual(tokens);
      expect(mockTokensApi.searchTokens).toHaveBeenCalledWith('SOL');
    });

    it('should return empty array when no results', async () => {
      mockTokensApi.searchTokens.mockResolvedValueOnce([]);

      const result = await service.searchTokens('nonexistent');

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      mockTokensApi.searchTokens.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.searchTokens('SOL')).rejects.toThrow('API Error');
    });
  });

  describe('getTokenDetails', () => {
    const mint = 'So11111111111111111111111111111111111111112';

    it('should combine token info, shield warnings, and price', async () => {
      const token = createMintInfo();
      mockTokensApi.searchTokens.mockResolvedValueOnce([token]);

      const shieldResponse: ShieldResponse = {
        warnings: {
          [mint]: [
            {
              type: 'HAS_FREEZE_AUTHORITY',
              message: 'Token has freeze authority',
              severity: 'warning',
            },
          ],
        },
      };
      mockShieldApi.getShieldWarnings.mockResolvedValueOnce(shieldResponse);

      const priceResponse: PriceV3Response = {
        data: {
          [mint]: {
            id: mint,
            type: 'derivedPrice',
            price: '150.50',
          },
        },
        timeTaken: 0.005,
      };
      mockPriceApi.getPricesV3.mockResolvedValueOnce(priceResponse);

      const result = await service.getTokenDetails(mint);

      expect(result.token).toEqual(token);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.type).toBe('HAS_FREEZE_AUTHORITY');
      expect(result.price).not.toBeNull();
      expect(result.price?.price).toBe('150.50');
    });

    it('should return empty warnings when shield API fails gracefully', async () => {
      const token = createMintInfo();
      mockTokensApi.searchTokens.mockResolvedValueOnce([token]);
      mockShieldApi.getShieldWarnings.mockRejectedValueOnce(new Error('Shield API down'));
      mockPriceApi.getPricesV3.mockResolvedValueOnce({ data: {}, timeTaken: 0 });

      const result = await service.getTokenDetails(mint);

      expect(result.token).toEqual(token);
      expect(result.warnings).toEqual([]);
      expect(result.price).toBeNull();
    });

    it('should return null price when price API fails gracefully', async () => {
      const token = createMintInfo();
      mockTokensApi.searchTokens.mockResolvedValueOnce([token]);
      mockShieldApi.getShieldWarnings.mockResolvedValueOnce({ warnings: {} });
      mockPriceApi.getPricesV3.mockRejectedValueOnce(new Error('Price API down'));

      const result = await service.getTokenDetails(mint);

      expect(result.token).toEqual(token);
      expect(result.price).toBeNull();
    });

    it('should throw when token is not found', async () => {
      mockTokensApi.searchTokens.mockResolvedValueOnce([]);
      mockShieldApi.getShieldWarnings.mockResolvedValueOnce({ warnings: {} });
      mockPriceApi.getPricesV3.mockResolvedValueOnce({ data: {}, timeTaken: 0 });

      await expect(service.getTokenDetails(mint)).rejects.toThrow('Token not found');
    });

    it('should match token by exact mint address', async () => {
      const exactToken = createMintInfo({ id: mint });
      const otherToken = createMintInfo({
        id: 'DifferentMint11111111111111111111111111111',
        symbol: 'OTHER',
      });
      mockTokensApi.searchTokens.mockResolvedValueOnce([otherToken, exactToken]);
      mockShieldApi.getShieldWarnings.mockResolvedValueOnce({ warnings: {} });
      mockPriceApi.getPricesV3.mockResolvedValueOnce({ data: {}, timeTaken: 0 });

      const result = await service.getTokenDetails(mint);

      expect(result.token.id).toBe(mint);
    });
  });

  describe('getTrendingTokens', () => {
    it('should call category API with toptrending', async () => {
      const tokens = [createMintInfo()];
      mockTokensApi.getTokensByCategory.mockResolvedValueOnce(tokens);

      const result = await service.getTrendingTokens('1h', 10);

      expect(result).toEqual(tokens);
      expect(mockTokensApi.getTokensByCategory).toHaveBeenCalledWith('toptrending', '1h', 10);
    });

    it('should use 24h as default interval', async () => {
      mockTokensApi.getTokensByCategory.mockResolvedValueOnce([]);

      await service.getTrendingTokens();

      expect(mockTokensApi.getTokensByCategory).toHaveBeenCalledWith(
        'toptrending',
        '24h',
        undefined
      );
    });
  });

  describe('getTopTradedTokens', () => {
    it('should call category API with toptraded', async () => {
      const tokens = [createMintInfo()];
      mockTokensApi.getTokensByCategory.mockResolvedValueOnce(tokens);

      const result = await service.getTopTradedTokens('6h', 5);

      expect(result).toEqual(tokens);
      expect(mockTokensApi.getTokensByCategory).toHaveBeenCalledWith('toptraded', '6h', 5);
    });
  });

  describe('getTopOrganicTokens', () => {
    it('should call category API with toporganicscore', async () => {
      mockTokensApi.getTokensByCategory.mockResolvedValueOnce([]);

      await service.getTopOrganicTokens('5m');

      expect(mockTokensApi.getTokensByCategory).toHaveBeenCalledWith(
        'toporganicscore',
        '5m',
        undefined
      );
    });
  });

  describe('getRecentTokens', () => {
    it('should delegate to tokens API', async () => {
      const tokens = [
        createMintInfo({
          id: 'NewToken111111111111111111111111111111111',
          symbol: 'NEW',
          isVerified: false,
          organicScore: 10,
          organicScoreLabel: 'low',
        }),
      ];
      mockTokensApi.getRecentTokens.mockResolvedValueOnce(tokens);

      const result = await service.getRecentTokens();

      expect(result).toEqual(tokens);
      expect(mockTokensApi.getRecentTokens).toHaveBeenCalled();
    });
  });

  describe('getTokensByTag', () => {
    it('should delegate to tokens API with verified tag', async () => {
      mockTokensApi.getTokensByTag.mockResolvedValueOnce([createMintInfo()]);

      const result = await service.getTokensByTag('verified');

      expect(result).toHaveLength(1);
      expect(mockTokensApi.getTokensByTag).toHaveBeenCalledWith('verified');
    });

    it('should delegate to tokens API with lst tag', async () => {
      mockTokensApi.getTokensByTag.mockResolvedValueOnce([]);

      await service.getTokensByTag('lst');

      expect(mockTokensApi.getTokensByTag).toHaveBeenCalledWith('lst');
    });
  });

  describe('getShieldWarnings', () => {
    it('should return warnings for multiple mints', async () => {
      const response: ShieldResponse = {
        warnings: {
          mint1: [{ type: 'HAS_FREEZE_AUTHORITY', message: 'Has freeze', severity: 'warning' }],
          mint2: [],
        },
      };
      mockShieldApi.getShieldWarnings.mockResolvedValueOnce(response);

      const result = await service.getShieldWarnings(['mint1', 'mint2']);

      expect(result.warnings['mint1']).toHaveLength(1);
      expect(result.warnings['mint2']).toHaveLength(0);
    });

    it('should propagate shield API errors', async () => {
      mockShieldApi.getShieldWarnings.mockRejectedValueOnce(new Error('Shield error'));

      await expect(service.getShieldWarnings(['mint1'])).rejects.toThrow('Shield error');
    });
  });

  describe('getPricesDetailed', () => {
    it('should return detailed price data', async () => {
      const response: PriceV3Response = {
        data: {
          mint1: {
            id: 'mint1',
            type: 'derivedPrice',
            price: '100.50',
            extraInfo: {
              confidenceLevel: 'high',
              quotedPrice: {
                buyPrice: '100.55',
                buyAt: 1710000001,
                sellPrice: '100.45',
                sellAt: 1710000000,
              },
            },
          },
        },
        timeTaken: 0.005,
      };
      mockPriceApi.getPricesV3.mockResolvedValueOnce(response);

      const result = await service.getPricesDetailed(['mint1']);

      expect(result.data['mint1']?.price).toBe('100.50');
      expect(result.data['mint1']?.extraInfo?.confidenceLevel).toBe('high');
    });
  });
});
