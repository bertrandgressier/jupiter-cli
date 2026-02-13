import { TokenInfoService } from '../../../src/application/services/token-info.service';
import { TokenInfoRepository } from '../../../src/domain/repositories/token-info.repository';
import { TokenInfo } from '../../../src/domain/entities/token-info.entity';
import { UltraApiService } from '../../../src/infrastructure/jupiter-api/ultra/ultra-api.service';
import { TokenNotFoundError } from '../../../src/core/errors/token.errors';

function createTokenInfo(
  mint: string,
  symbol: string,
  decimals: number,
  options?: { name?: string; verified?: boolean }
): TokenInfo {
  return new TokenInfo(mint, symbol, decimals, options);
}

function createMockRepository(): jest.Mocked<TokenInfoRepository> {
  return {
    findByMint: jest.fn(),
    findByMints: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockImplementation(async (token: TokenInfo) => token),
    delete: jest.fn(),
  };
}

function createMockUltraApi(): jest.Mocked<UltraApiService> {
  return {
    getTokenInfo: jest.fn(),
    getPrice: jest.fn(),
    searchTokens: jest.fn(),
    getOrder: jest.fn(),
    executeOrder: jest.fn(),
  } as unknown as jest.Mocked<UltraApiService>;
}

describe('TokenInfoService', () => {
  let service: TokenInfoService;
  let mockRepo: jest.Mocked<TokenInfoRepository>;
  let mockApi: jest.Mocked<UltraApiService>;

  const solMint = 'So11111111111111111111111111111111111111112';
  const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const unknownMint = 'UnknownMintAddress123456789';

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockApi = createMockUltraApi();
    service = new TokenInfoService(mockRepo, mockApi);
  });

  describe('getTokenInfo', () => {
    describe('cache hit', () => {
      it('should return cached token info from repository', async () => {
        const cachedToken = createTokenInfo(solMint, 'SOL', 9, { name: 'Solana' });
        mockRepo.findByMint.mockResolvedValueOnce(cachedToken);

        const result = await service.getTokenInfo(solMint);

        expect(result).toBe(cachedToken);
        expect(mockRepo.findByMint).toHaveBeenCalledWith(solMint);
        expect(mockApi.getTokenInfo).not.toHaveBeenCalled();
      });
    });

    describe('known tokens', () => {
      it('should return SOL info for wrapped SOL mint without API call', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);

        const result = await service.getTokenInfo(solMint);

        expect(result).not.toBeNull();
        expect(result?.symbol).toBe('SOL');
        expect(result?.name).toBe('Solana');
        expect(result?.decimals).toBe(9);
        expect(result?.verified).toBe(true);
        expect(mockRepo.upsert).toHaveBeenCalled();
        expect(mockApi.getTokenInfo).not.toHaveBeenCalled();
      });

      it('should return USDC info for USDC mint without API call', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);

        const result = await service.getTokenInfo(usdcMint);

        expect(result).not.toBeNull();
        expect(result?.symbol).toBe('USDC');
        expect(result?.name).toBe('USD Coin');
        expect(result?.decimals).toBe(6);
        expect(result?.verified).toBe(true);
        expect(mockRepo.upsert).toHaveBeenCalled();
        expect(mockApi.getTokenInfo).not.toHaveBeenCalled();
      });
    });

    describe('API fetch', () => {
      it('should fetch token info from API when not cached and not known', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);
        mockApi.getTokenInfo.mockResolvedValueOnce({
          address: unknownMint,
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: 8,
          verified: false,
        });

        const result = await service.getTokenInfo(unknownMint);

        expect(result).not.toBeNull();
        expect(result?.symbol).toBe('UNKNOWN');
        expect(result?.name).toBe('Unknown Token');
        expect(result?.decimals).toBe(8);
        expect(mockApi.getTokenInfo).toHaveBeenCalledWith(unknownMint);
        expect(mockRepo.upsert).toHaveBeenCalled();
      });

      it('should return null when API returns null', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);
        mockApi.getTokenInfo.mockResolvedValueOnce(null);

        const result = await service.getTokenInfo(unknownMint);

        expect(result).toBeNull();
        expect(mockApi.getTokenInfo).toHaveBeenCalledWith(unknownMint);
      });

      it('should return null when API throws error', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);
        mockApi.getTokenInfo.mockRejectedValueOnce(new Error('API Error'));

        const result = await service.getTokenInfo(unknownMint);

        expect(result).toBeNull();
      });
    });
  });

  describe('getTokenInfoBatch', () => {
    it('should return empty map for empty input', async () => {
      const result = await service.getTokenInfoBatch([]);

      expect(result.size).toBe(0);
      expect(mockRepo.findByMints).not.toHaveBeenCalled();
    });

    it('should return cached tokens without API calls', async () => {
      const cachedSol = createTokenInfo(solMint, 'SOL', 9);
      mockRepo.findByMints.mockResolvedValueOnce([cachedSol]);

      const result = await service.getTokenInfoBatch([solMint]);

      expect(result.size).toBe(1);
      expect(result.get(solMint)).toBe(cachedSol);
      expect(mockApi.getTokenInfo).not.toHaveBeenCalled();
    });

    it('should fetch missing tokens from API', async () => {
      mockRepo.findByMints.mockResolvedValueOnce([]);
      mockApi.getTokenInfo.mockResolvedValueOnce({
        address: unknownMint,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 8,
        verified: false,
      });

      const result = await service.getTokenInfoBatch([solMint, unknownMint]);

      expect(result.size).toBe(2);
      expect(result.get(solMint)?.symbol).toBe('SOL');
      expect(result.get(unknownMint)?.symbol).toBe('UNKNOWN');
      expect(mockApi.getTokenInfo).toHaveBeenCalledWith(unknownMint);
    });

    it('should handle partial API failures gracefully', async () => {
      mockRepo.findByMints.mockResolvedValueOnce([]);
      mockApi.getTokenInfo.mockRejectedValueOnce(new Error('API Error'));

      const result = await service.getTokenInfoBatch([solMint, unknownMint]);

      expect(result.size).toBe(1);
      expect(result.get(solMint)?.symbol).toBe('SOL');
      expect(result.has(unknownMint)).toBe(false);
    });

    it('should not fetch known tokens from API', async () => {
      mockRepo.findByMints.mockResolvedValueOnce([]);

      const jupMint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
      const result = await service.getTokenInfoBatch([solMint, usdcMint, jupMint]);

      expect(result.size).toBe(3);
      expect(result.get(solMint)?.symbol).toBe('SOL');
      expect(result.get(usdcMint)?.symbol).toBe('USDC');
      expect(result.get(jupMint)?.symbol).toBe('JUP');
      expect(mockApi.getTokenInfo).not.toHaveBeenCalled();
    });
  });

  describe('resolveToken', () => {
    describe('with mint address', () => {
      it('should resolve mint address and return token info', async () => {
        const cachedToken = createTokenInfo(solMint, 'SOL', 9, { name: 'Solana' });
        mockRepo.findByMint.mockResolvedValueOnce(cachedToken);

        const result = await service.resolveToken(solMint);

        expect(result.mint).toBe(solMint);
        expect(result.symbol).toBe('SOL');
        expect(result.decimals).toBe(9);
        expect(result.name).toBe('Solana');
      });

      it('should throw TokenNotFoundError for unknown mint address', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);
        mockApi.getTokenInfo.mockResolvedValueOnce(null);

        await expect(service.resolveToken(unknownMint)).rejects.toThrow(TokenNotFoundError);
      });
    });

    describe('with symbol', () => {
      it('should resolve known symbol without API call', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);

        const result = await service.resolveToken('SOL');

        expect(result.mint).toBe(solMint);
        expect(result.symbol).toBe('SOL');
        expect(result.decimals).toBe(9);
        expect(result.name).toBe('Solana');
      });

      it('should resolve known symbol case-insensitively', async () => {
        mockRepo.findByMint.mockResolvedValueOnce(null);

        const result = await service.resolveToken('sol');

        expect(result.mint).toBe(solMint);
        expect(result.symbol).toBe('SOL');
      });

      it('should search API for unknown symbol', async () => {
        mockApi.searchTokens.mockResolvedValueOnce([
          {
            address: unknownMint,
            symbol: 'UNKNOWN',
            name: 'Unknown Token',
            decimals: 8,
            verified: true,
          },
        ]);

        const result = await service.resolveToken('UNKNOWN');

        expect(result.mint).toBe(unknownMint);
        expect(result.symbol).toBe('UNKNOWN');
        expect(result.decimals).toBe(8);
        expect(mockApi.searchTokens).toHaveBeenCalledWith('UNKNOWN');
        expect(mockRepo.upsert).toHaveBeenCalled();
      });

      it('should prefer exact symbol match from search results', async () => {
        mockApi.searchTokens.mockResolvedValueOnce([
          {
            address: 'differentMint',
            symbol: 'UNKNOWN2',
            name: 'Different Token',
            decimals: 6,
            verified: false,
          },
          {
            address: unknownMint,
            symbol: 'UNKNOWN',
            name: 'Unknown Token',
            decimals: 8,
            verified: true,
          },
        ]);

        const result = await service.resolveToken('UNKNOWN');

        expect(result.mint).toBe(unknownMint);
        expect(result.symbol).toBe('UNKNOWN');
      });

      it('should throw TokenNotFoundError for symbol not found', async () => {
        mockApi.searchTokens.mockResolvedValueOnce([]);

        await expect(service.resolveToken('NOTEXIST')).rejects.toThrow(TokenNotFoundError);
      });

      it('should throw TokenNotFoundError when API throws error', async () => {
        mockApi.searchTokens.mockRejectedValueOnce(new Error('API Error'));

        await expect(service.resolveToken('NOTEXIST')).rejects.toThrow(TokenNotFoundError);
      });
    });
  });
});
