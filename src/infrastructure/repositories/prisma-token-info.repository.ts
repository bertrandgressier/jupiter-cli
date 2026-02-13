import { PrismaClient, TokenInfo as PrismaTokenInfo } from '@prisma/client';
import { TokenInfo } from '../../domain/entities/token-info.entity';
import { TokenInfoRepository } from '../../domain/repositories/token-info.repository';

export class PrismaTokenInfoRepository implements TokenInfoRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async findByMint(mint: string): Promise<TokenInfo | null> {
    const tokenInfo = await this.prisma.tokenInfo.findUnique({
      where: { mint },
    });

    return tokenInfo ? this.toEntity(tokenInfo) : null;
  }

  async findByMints(mints: string[]): Promise<TokenInfo[]> {
    if (mints.length === 0) {
      return [];
    }

    const tokenInfos = await this.prisma.tokenInfo.findMany({
      where: {
        mint: { in: mints },
      },
    });

    return tokenInfos.map((t) => this.toEntity(t));
  }

  async upsert(tokenInfo: TokenInfo): Promise<TokenInfo> {
    const upserted = await this.prisma.tokenInfo.upsert({
      where: { mint: tokenInfo.mint },
      update: {
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        logoURI: tokenInfo.logoURI,
        verified: tokenInfo.verified,
        fetchedAt: tokenInfo.fetchedAt,
      },
      create: {
        mint: tokenInfo.mint,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        logoURI: tokenInfo.logoURI,
        verified: tokenInfo.verified,
        fetchedAt: tokenInfo.fetchedAt,
      },
    });

    return this.toEntity(upserted);
  }

  async delete(mint: string): Promise<void> {
    await this.prisma.tokenInfo.delete({
      where: { mint },
    });
  }

  private toEntity(data: PrismaTokenInfo): TokenInfo {
    return new TokenInfo(data.mint, data.symbol, data.decimals, {
      name: data.name ?? undefined,
      logoURI: data.logoURI ?? undefined,
      verified: data.verified,
      fetchedAt: data.fetchedAt,
    });
  }
}
