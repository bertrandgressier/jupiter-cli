import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { InvalidWalletNameError, InvalidPrivateKeyError } from '../../../core/errors/wallet.errors';

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function validateWalletName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new InvalidWalletNameError('name cannot be empty');
  }
  if (trimmed.length > 50) {
    throw new InvalidWalletNameError('name must be 50 characters or less');
  }
}

export function validatePrivateKey(privateKeyBase58: string): Uint8Array {
  if (!privateKeyBase58 || privateKeyBase58.trim().length === 0) {
    throw new InvalidPrivateKeyError();
  }

  const trimmed = privateKeyBase58.trim();

  if (trimmed.length < 80 || trimmed.length > 100) {
    throw new InvalidPrivateKeyError();
  }

  for (const char of trimmed) {
    if (!BASE58_CHARS.includes(char)) {
      throw new InvalidPrivateKeyError();
    }
  }

  try {
    const decoded = bs58.decode(trimmed);

    if (decoded.length !== 64) {
      throw new InvalidPrivateKeyError();
    }

    Keypair.fromSecretKey(decoded);

    return decoded;
  } catch (error) {
    if (error instanceof InvalidPrivateKeyError) {
      throw error;
    }
    throw new InvalidPrivateKeyError();
  }
}
