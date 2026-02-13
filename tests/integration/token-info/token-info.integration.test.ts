import { PrismaClient } from '@prisma/client';
import { ProjectConfigurationService } from '../../../src/core/config';
import { MasterPasswordService } from '../../../src/application/services/security/master-password.service';
import { PrismaTokenInfoRepository } from '../../../src/infrastructure/repositories/prisma-token-info.repository';
import { TokenInfoService } from '../../../src/application/services/token-info.service';
import { TokenInfo } from '../../../src/domain/entities/token-info.entity';
import * as path from 'path';
import * as fs from 'fs';

jest.mock('../../../src/infrastructure/jupiter-api/shared/jupiter-client', () => ({
  JupiterClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
  jupiterClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('TokenInfo Integration Tests', () => {
  const testDataDir = path.join(__dirname, 'fixtures', 'token-info-test-data');
  let prisma: PrismaClient;
  let tokenInfoRepo: PrismaTokenInfoRepository;
  let tokenInfoService: TokenInfoService;

  const solMint = 'So11111111111111111111111111111111111111112';
  const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const jupMint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    const projectConfig = new ProjectConfigurationService(testDataDir);
    const prismaInit = projectConfig.createPrismaClient();
    const masterPasswordService = new MasterPasswordService(prismaInit);

    await projectConfig.initialize('test-password-12345', masterPasswordService, {
      skipIfExists: false,
    });
    await prismaInit.$disconnect();

    prisma = projectConfig.createPrismaClient();
    await prisma.$connect();

    tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
    tokenInfoService = new TokenInfoService(tokenInfoRepo);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await prisma.tokenInfo.deleteMany();
  });

  describe('PrismaTokenInfoRepository', () => {
    describe('findByMint', () => {
      it('should return null for non-existent token', async () => {
        const result = await tokenInfoRepo.findByMint('non-existent-mint');
        expect(result).toBeNull();
      });

      it('should return token info for existing token', async () => {
        const tokenInfo = new TokenInfo(solMint, 'SOL', 9, { name: 'Solana' });
        await tokenInfoRepo.upsert(tokenInfo);

        const result = await tokenInfoRepo.findByMint(solMint);

        expect(result).not.toBeNull();
        expect(result?.mint).toBe(solMint);
        expect(result?.symbol).toBe('SOL');
        expect(result?.name).toBe('Solana');
        expect(result?.decimals).toBe(9);
      });
    });

    describe('findByMints', () => {
      it('should return empty array for empty input', async () => {
        const result = await tokenInfoRepo.findByMints([]);
        expect(result).toEqual([]);
      });

      it('should return multiple token infos', async () => {
        const sol = new TokenInfo(solMint, 'SOL', 9, { name: 'Solana' });
        const usdc = new TokenInfo(usdcMint, 'USDC', 6, { name: 'USD Coin' });

        await tokenInfoRepo.upsert(sol);
        await tokenInfoRepo.upsert(usdc);

        const result = await tokenInfoRepo.findByMints([solMint, usdcMint]);

        expect(result).toHaveLength(2);
        expect(result.find((t) => t.mint === solMint)?.symbol).toBe('SOL');
        expect(result.find((t) => t.mint === usdcMint)?.symbol).toBe('USDC');
      });

      it('should only return existing tokens', async () => {
        const sol = new TokenInfo(solMint, 'SOL', 9);
        await tokenInfoRepo.upsert(sol);

        const result = await tokenInfoRepo.findByMints([solMint, 'non-existent']);

        expect(result).toHaveLength(1);
        expect(result[0]?.mint).toBe(solMint);
      });
    });

    describe('upsert', () => {
      it('should insert new token info', async () => {
        const tokenInfo = new TokenInfo(solMint, 'SOL', 9, { name: 'Solana' });

        const result = await tokenInfoRepo.upsert(tokenInfo);

        expect(result.mint).toBe(solMint);
        expect(result.symbol).toBe('SOL');

        const fromDb = await prisma.tokenInfo.findUnique({ where: { mint: solMint } });
        expect(fromDb).not.toBeNull();
        expect(fromDb?.symbol).toBe('SOL');
      });

      it('should update existing token info', async () => {
        const original = new TokenInfo(solMint, 'SOL', 9, { name: 'Original' });
        await tokenInfoRepo.upsert(original);

        const updated = new TokenInfo(solMint, 'SOL', 9, { name: 'Solana', verified: true });
        await tokenInfoRepo.upsert(updated);

        const fromDb = await prisma.tokenInfo.findUnique({ where: { mint: solMint } });
        expect(fromDb?.name).toBe('Solana');
        expect(fromDb?.verified).toBe(true);
      });
    });

    describe('delete', () => {
      it('should delete existing token info', async () => {
        const tokenInfo = new TokenInfo(solMint, 'SOL', 9);
        await tokenInfoRepo.upsert(tokenInfo);

        await tokenInfoRepo.delete(solMint);

        const fromDb = await prisma.tokenInfo.findUnique({ where: { mint: solMint } });
        expect(fromDb).toBeNull();
      });

      it('should throw for non-existent token', async () => {
        await expect(tokenInfoRepo.delete('non-existent')).rejects.toThrow();
      });
    });
  });

  describe('TokenInfoService with Repository', () => {
    it('should cache token info after first fetch', async () => {
      const result1 = await tokenInfoService.getTokenInfo(solMint);
      expect(result1).not.toBeNull();
      expect(result1?.symbol).toBe('SOL');

      const fromDb = await prisma.tokenInfo.findUnique({ where: { mint: solMint } });
      expect(fromDb).not.toBeNull();
      expect(fromDb?.symbol).toBe('SOL');
    });

    it('should return cached token info on subsequent calls', async () => {
      const result1 = await tokenInfoService.getTokenInfo(usdcMint);
      const result2 = await tokenInfoService.getTokenInfo(usdcMint);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1?.symbol).toBe('USDC');
      expect(result2?.symbol).toBe('USDC');
    });

    it('should batch fetch multiple tokens', async () => {
      const result = await tokenInfoService.getTokenInfoBatch([solMint, usdcMint, jupMint]);

      expect(result.size).toBe(3);
      expect(result.get(solMint)?.symbol).toBe('SOL');
      expect(result.get(usdcMint)?.symbol).toBe('USDC');
      expect(result.get(jupMint)?.symbol).toBe('JUP');

      const fromDb = await prisma.tokenInfo.findMany();
      expect(fromDb.length).toBe(3);
    });

    it('should handle unknown tokens gracefully', async () => {
      const unknownMint = 'UnknownTokenAddress123456789';

      const result = await tokenInfoService.getTokenInfo(unknownMint);

      expect(result).toBeNull();
    });
  });
});
