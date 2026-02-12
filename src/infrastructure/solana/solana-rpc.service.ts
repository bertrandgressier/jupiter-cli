import { LoggerService } from '../../core/logger/logger.service';
import { NetworkError } from '../../core/errors/api.errors';

export interface TokenAccount {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

export interface WalletTokens {
  address: string;
  solBalance: number;
  tokens: TokenAccount[];
}

// RPC Response Types
interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number;
}

interface TokenAccountInfo {
  mint: string;
  tokenAmount: TokenAmount;
}

interface ParsedAccountData {
  parsed: {
    info: TokenAccountInfo;
  };
}

interface AccountData {
  account: {
    data: ParsedAccountData;
  };
}

interface TokenAccountResponse {
  value?: AccountData[];
}

interface BalanceResponse {
  value: number;
}

// Configuration
const RPC_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Solana RPC Service - Utilise le RPC public pour scanner les tokens
 * Avec retry automatique et timeout
 */
export class SolanaRpcService {
  private rpcUrl: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(
    rpcUrl: string = 'https://api.mainnet.solana.com',
    maxRetries: number = MAX_RETRIES,
    timeoutMs: number = RPC_TIMEOUT_MS
  ) {
    this.rpcUrl = rpcUrl;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Get all token accounts for a wallet
   */
  async getTokenAccounts(walletAddress: string): Promise<WalletTokens> {
    try {
      LoggerService.getInstance().debug('Fetching token accounts via Solana RPC', {
        walletAddress,
      });

      // Get token accounts
      const tokenResponse = await this.callRpc<TokenAccountResponse>('getTokenAccountsByOwner', [
        walletAddress,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]);

      // Get SOL balance
      const balanceResponse = await this.callRpc<BalanceResponse>('getBalance', [walletAddress]);
      const solBalance = balanceResponse.value / 1e9;

      const tokens: TokenAccount[] = [];

      if (tokenResponse.value) {
        for (const account of tokenResponse.value) {
          const parsed = account.account.data.parsed;
          if (parsed && parsed.info) {
            const token: TokenAccount = {
              mint: parsed.info.mint,
              amount: parsed.info.tokenAmount.amount,
              decimals: parsed.info.tokenAmount.decimals,
              uiAmount: parsed.info.tokenAmount.uiAmount || 0,
            };

            // Skip if amount is 0
            if (token.uiAmount > 0) {
              tokens.push(token);
            }
          }
        }
      }

      LoggerService.getInstance().info(`Found ${tokens.length} tokens via Solana RPC`, {
        walletAddress,
      });

      return {
        address: walletAddress,
        solBalance,
        tokens,
      };
    } catch (error) {
      LoggerService.getInstance().error('Failed to fetch token accounts', error as Error);
      throw error;
    }
  }

  /**
   * Call Solana RPC method with retry and timeout
   */
  private async callRpc<T>(method: string, params: unknown[], retries = 0): Promise<T> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new NetworkError(
          `${this.rpcUrl}/${method}`,
          new Error(`HTTP ${response.status}: ${response.statusText}`)
        );
      }

      const data = (await response.json()) as {
        error?: { message: string; code?: number };
        result: T;
      };

      if (data.error) {
        throw new Error(`RPC error [${data.error.code}]: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      // Check if we should retry
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        const delay = BASE_DELAY_MS * Math.pow(2, retries); // Exponential backoff
        LoggerService.getInstance().warn(
          `RPC call failed, retrying in ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`,
          {
            method,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
        await this.sleep(delay);
        return this.callRpc<T>(method, params, retries + 1);
      }

      // Wrap network errors
      if (error instanceof NetworkError) {
        throw error;
      }

      throw new NetworkError(
        `${this.rpcUrl}/${method}`,
        error instanceof Error ? error : new Error('Unknown RPC error')
      );
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    if (error instanceof Error) {
      // Retry on timeout or network errors
      if (error.name === 'AbortError') return true;
      if (error.message.includes('fetch failed')) return true;
      if (error.message.includes('ECONNRESET')) return true;
      if (error.message.includes('ETIMEDOUT')) return true;
      // Retry on rate limit (HTTP 429)
      if (error.message.includes('429')) return true;
      // Retry on server errors (5xx)
      if (/HTTP 5\d\d/.test(error.message)) return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const solanaRpcService = new SolanaRpcService();
