import { PrismaClient, Wallet as PrismaWallet } from '@prisma/client';
import { Wallet } from '../../domain/entities/wallet.entity';
import { WalletRepository } from '../../domain/repositories/wallet.repository';

export class PrismaWalletRepository implements WalletRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async findAll(): Promise<Wallet[]> {
    const wallets = await this.prisma.wallet.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return wallets.map((w) => this.toEntity(w));
  }

  async findById(id: string): Promise<Wallet | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
    });

    return wallet ? this.toEntity(wallet) : null;
  }

  async findByAddress(address: string): Promise<Wallet | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { address },
    });

    return wallet ? this.toEntity(wallet) : null;
  }

  async findByName(name: string): Promise<Wallet | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { name },
    });

    return wallet ? this.toEntity(wallet) : null;
  }

  async create(wallet: Wallet): Promise<Wallet> {
    const created = await this.prisma.wallet.create({
      data: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        encryptedKey: wallet.encryptedKey,
        keyNonce: wallet.keyNonce,
        keySalt: wallet.keySalt,
        keyAuthTag: wallet.keyAuthTag,
        isActive: wallet.isActive,
        createdAt: wallet.createdAt,
        lastUsed: wallet.lastUsed,
      },
    });

    return this.toEntity(created);
  }

  async update(wallet: Wallet): Promise<Wallet> {
    const updated = await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        name: wallet.name,
        isActive: wallet.isActive,
        lastUsed: wallet.lastUsed,
      },
    });

    return this.toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.wallet.delete({
      where: { id },
    });
  }

  private toEntity(data: PrismaWallet): Wallet {
    return new Wallet(
      data.id,
      data.name,
      data.address,
      data.encryptedKey,
      data.keyNonce,
      data.keySalt,
      data.keyAuthTag,
      data.isActive,
      data.createdAt,
      data.lastUsed ?? undefined
    );
  }
}
