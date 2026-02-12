import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { Wallet } from '../../../domain/entities/wallet.entity';
import { WalletRepository } from '../../../domain/repositories/wallet.repository';
import { keyEncryptionService } from '../security/key-encryption.service';
import { WalletAlreadyExistsError } from '../../../core/errors/wallet.errors';
import { MasterPasswordService } from '../security/master-password.service';
import { validateWalletName } from './wallet-validation.util';

export class WalletCreatorService {
  private walletRepo: WalletRepository;
  private masterPasswordService: MasterPasswordService;

  constructor(walletRepo: WalletRepository, masterPasswordService: MasterPasswordService) {
    this.walletRepo = walletRepo;
    this.masterPasswordService = masterPasswordService;
  }

  async createWallet(name: string): Promise<Wallet> {
    validateWalletName(name);

    const keypair = Keypair.generate();
    const secretKey = keypair.secretKey;
    const privateKey = bs58.encode(secretKey);
    const publicKey = keypair.publicKey.toBase58();

    const existing = await this.walletRepo.findByAddress(publicKey);
    if (existing) {
      secretKey.fill(0);
      throw new WalletAlreadyExistsError(publicKey);
    }

    const sessionKey = await this.masterPasswordService.getSessionKey();

    const { encryptedKey, nonce, salt, authTag } = await keyEncryptionService.encryptPrivateKey(
      privateKey,
      sessionKey
    );

    secretKey.fill(0);

    const wallet = new Wallet(
      crypto.randomUUID(),
      name,
      publicKey,
      encryptedKey,
      nonce,
      salt,
      authTag
    );

    return this.walletRepo.create(wallet);
  }
}
