import { PrismaClient, Trade as PrismaTrade, Prisma } from '@prisma/client';
import { Trade, TradeType } from '../../domain/entities/trade.entity';
import { TradeRepository } from '../../domain/repositories/trade.repository';

export class PrismaTradeRepository implements TradeRepository {
  constructor(private prisma: PrismaClient) {}

  async create(trade: Trade): Promise<Trade> {
    const created = await this.prisma.trade.create({
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
        inputSymbol: trade.inputSymbol ?? null,
        outputSymbol: trade.outputSymbol ?? null,
        inputUsdPrice: trade.inputUsdPrice ?? null,
        outputUsdPrice: trade.outputUsdPrice ?? null,
        inputUsdValue: trade.inputUsdValue ?? null,
        outputUsdValue: trade.outputUsdValue ?? null,
      },
    });

    return this.toEntity(created);
  }

  async findByWallet(
    walletId: string,
    options?: {
      mint?: string;
      type?: TradeType;
      limit?: number;
      offset?: number;
    }
  ): Promise<Trade[]> {
    const where: Prisma.TradeWhereInput = { walletId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.mint) {
      where.OR = [{ inputMint: options.mint }, { outputMint: options.mint }];
    }

    const trades = await this.prisma.trade.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      skip: options?.offset,
      take: options?.limit,
    });

    return trades.map((t) => this.toEntity(t));
  }

  async countByWallet(
    walletId: string,
    options?: {
      mint?: string;
      type?: TradeType;
    }
  ): Promise<number> {
    const where: Prisma.TradeWhereInput = { walletId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.mint) {
      where.OR = [{ inputMint: options.mint }, { outputMint: options.mint }];
    }

    return this.prisma.trade.count({ where });
  }

  async findBySignature(signature: string): Promise<Trade | null> {
    const trade = await this.prisma.trade.findFirst({
      where: { signature },
    });

    return trade ? this.toEntity(trade) : null;
  }

  async findByWalletAndMint(walletId: string, mint: string): Promise<Trade[]> {
    const trades = await this.prisma.trade.findMany({
      where: {
        walletId,
        OR: [{ inputMint: mint }, { outputMint: mint }],
      },
      orderBy: { executedAt: 'asc' },
    });

    return trades.map((t) => this.toEntity(t));
  }

  private toEntity(data: PrismaTrade): Trade {
    return new Trade(
      data.id,
      data.walletId,
      data.inputMint,
      data.outputMint,
      data.inputAmount,
      data.outputAmount,
      data.type as TradeType,
      data.signature,
      data.executedAt,
      data.inputSymbol ?? undefined,
      data.outputSymbol ?? undefined,
      data.inputUsdPrice ?? undefined,
      data.outputUsdPrice ?? undefined,
      data.inputUsdValue ?? undefined,
      data.outputUsdValue ?? undefined
    );
  }
}
