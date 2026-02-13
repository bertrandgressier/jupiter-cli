import { Wallet } from '../../../domain/entities/wallet.entity';
import { WalletRepository } from '../../../domain/repositories/wallet.repository';
import { WalletNotFoundError } from '../../../core/errors/wallet.errors';

export class WalletResolverService {
  private walletRepo: WalletRepository;

  constructor(walletRepo: WalletRepository) {
    this.walletRepo = walletRepo;
  }

  async resolve(identifier: string): Promise<Wallet> {
    const index = this.parseAsIndex(identifier);
    if (index !== null) {
      return this.resolveByIndex(index);
    }

    if (this.looksLikeUuid(identifier)) {
      const wallet = await this.walletRepo.findById(identifier);
      if (wallet) return wallet;
    }

    const walletByName = await this.walletRepo.findByName(identifier);
    if (walletByName) return walletByName;

    const walletById = await this.walletRepo.findById(identifier);
    if (walletById) return walletById;

    throw new WalletNotFoundError(identifier);
  }

  async resolveByIndex(index: number): Promise<Wallet> {
    if (index < 1) {
      throw new WalletNotFoundError(String(index));
    }

    const wallets = await this.walletRepo.findAll();

    if (index > wallets.length) {
      throw new WalletNotFoundError(`#${index}`);
    }

    const wallet = wallets[index - 1];
    if (!wallet) {
      throw new WalletNotFoundError(`#${index}`);
    }

    return wallet;
  }

  private parseAsIndex(value: string): number | null {
    if (/^\d+$/.test(value)) {
      const num = parseInt(value, 10);
      return num > 0 ? num : null;
    }
    return null;
  }

  private looksLikeUuid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
}
