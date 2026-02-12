import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Commitment,
} from '@solana/web3.js';
import { ConfigurationService } from '../../core/config/configuration.service';
import { LoggerService } from '../../core/logger/logger.service';
import {
  BlockchainPort,
  SignatureInfo,
  ParsedTransaction,
} from '../../application/ports/blockchain.port';

export class ConnectionService implements BlockchainPort {
  private connection: Connection;
  private configService: ConfigurationService;

  constructor() {
    this.configService = ConfigurationService.getInstance();
    this.connection = new Connection(this.configService.getConfig().solana.rpcUrl, {
      commitment: this.configService.getConfig().solana.commitment as Commitment,
    });
  }

  getConnection(): Connection {
    return this.connection;
  }

  async signTransaction(
    transaction: Transaction | VersionedTransaction,
    privateKey: string
  ): Promise<Transaction | VersionedTransaction> {
    try {
      // Import here to avoid circular dependency
      const { Keypair } = await import('@solana/web3.js');
      const { default: bs58 } = await import('bs58');

      const privateKeyBytes = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(privateKeyBytes);

      if (transaction instanceof VersionedTransaction) {
        transaction.sign([keypair]);
      } else {
        transaction.partialSign(keypair);
      }

      // Zero out private key from memory
      privateKeyBytes.fill(0);

      return transaction;
    } catch (error) {
      throw new Error(
        `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async sendTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      LoggerService.getInstance().info(`Transaction sent: ${signature}`);
      return signature;
    } catch (error) {
      LoggerService.getInstance().error('Failed to send transaction', error as Error);
      throw error;
    }
  }

  async confirmTransaction(signature: string): Promise<boolean> {
    try {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        LoggerService.getInstance().error(`Transaction failed: ${confirmation.value.err}`);
        return false;
      }

      return true;
    } catch (error) {
      LoggerService.getInstance().error('Failed to confirm transaction', error as Error);
      return false;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const balance = await this.connection.getBalance(new PublicKey(address));
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      LoggerService.getInstance().error('Failed to get balance', error as Error);
      return 0;
    }
  }

  async getTokenBalance(address: string, mint: string): Promise<number> {
    try {
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');

      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(mint),
        new PublicKey(address)
      );

      const account = await getAccount(this.connection, tokenAccount);
      return Number(account.amount);
    } catch (_error) {
      LoggerService.getInstance().debug(`No token account found for ${mint}`);
      return 0;
    }
  }

  async getSignaturesForAddress(
    address: string,
    options?: { before?: string; limit?: number }
  ): Promise<SignatureInfo[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(new PublicKey(address), {
        before: options?.before,
        limit: options?.limit,
      });

      return signatures.map((sig) => ({
        signature: sig.signature,
        slot: sig.slot,
        err: sig.err,
        memo: sig.memo,
        blockTime: sig.blockTime || undefined,
        confirmationStatus: sig.confirmationStatus || undefined,
      }));
    } catch (error) {
      LoggerService.getInstance().error('Failed to get signatures', error as Error);
      return [];
    }
  }

  async getParsedTransaction(signature: string): Promise<ParsedTransaction | null> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return null;

      return {
        slot: tx.slot,
        transaction: {
          message: {
            accountKeys: tx.transaction.message.accountKeys.map((acc: unknown) => {
              const account = acc as {
                pubkey: { toString: () => string };
                signer: boolean;
                writable: boolean;
              };
              return {
                pubkey: account.pubkey.toString(),
                signer: account.signer,
                writable: account.writable,
              };
            }),
            instructions: tx.transaction.message.instructions.map((ix: unknown) => {
              const instruction = ix as {
                programId: { toString: () => string };
                parsed: Record<string, unknown> | null;
                accounts?: Array<{ toString: () => string }>;
                data?: string;
              };
              return {
                programId: instruction.programId.toString(),
                parsed: instruction.parsed,
                accounts: instruction.accounts?.map((acc) => acc.toString()),
                data: instruction.data,
              };
            }),
          },
          signatures: tx.transaction.signatures,
        },
        meta: tx.meta
          ? {
              err: tx.meta.err,
              fee: tx.meta.fee,
              preBalances: tx.meta.preBalances,
              postBalances: tx.meta.postBalances,
              preTokenBalances:
                tx.meta.preTokenBalances?.map((tb: unknown) => {
                  const tokenBalance = tb as {
                    accountIndex: number;
                    mint: string;
                    uiTokenAmount: { amount: string; decimals: number; uiAmount: number };
                  };
                  return {
                    accountIndex: tokenBalance.accountIndex,
                    mint: tokenBalance.mint,
                    uiTokenAmount: {
                      amount: tokenBalance.uiTokenAmount.amount,
                      decimals: tokenBalance.uiTokenAmount.decimals,
                      uiAmount: tokenBalance.uiTokenAmount.uiAmount,
                    },
                  };
                }) || [],
              postTokenBalances:
                tx.meta.postTokenBalances?.map((tb: unknown) => {
                  const tokenBalance = tb as {
                    accountIndex: number;
                    mint: string;
                    uiTokenAmount: { amount: string; decimals: number; uiAmount: number };
                  };
                  return {
                    accountIndex: tokenBalance.accountIndex,
                    mint: tokenBalance.mint,
                    uiTokenAmount: {
                      amount: tokenBalance.uiTokenAmount.amount,
                      decimals: tokenBalance.uiTokenAmount.decimals,
                      uiAmount: tokenBalance.uiTokenAmount.uiAmount,
                    },
                  };
                }) || [],
              logMessages: tx.meta.logMessages || [],
            }
          : null,
        blockTime: tx.blockTime || null,
      };
    } catch (error) {
      LoggerService.getInstance().error('Failed to get parsed transaction', error as Error);
      return null;
    }
  }
}
