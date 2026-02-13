import { Wallet } from '../entities/wallet.entity';

export interface WalletRepository {
  findAll(): Promise<Wallet[]>;
  findById(id: string): Promise<Wallet | null>;
  findByName(name: string): Promise<Wallet | null>;
  findByAddress(address: string): Promise<Wallet | null>;
  create(wallet: Wallet): Promise<Wallet>;
  update(wallet: Wallet): Promise<Wallet>;
  delete(id: string): Promise<void>;
}
