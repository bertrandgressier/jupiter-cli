import { WalletRepository } from '../../../domain/repositories/wallet.repository';
import { SolanaRpcPort } from '../../ports/blockchain.port';
import { TokenInfoProvider } from '../token-info.service';
import { WalletNotFoundError } from '../../../core/errors/wallet.errors';
import { LoggerService } from '../../../core/logger/logger.service';

export interface PriceProvider {
  getPrice(mints: string[]): Promise<{ mint: string; price: number; timestamp: Date }[]>;
}

export interface WalletState {
  address: string;
  solBalance: number;
  tokens: Array<{
    mint: string;
    symbol?: string;
    amount: number;
    decimals: number;
    price: number;
    value: number;
  }>;
  totalValue: number;
}

export class WalletSyncService {
  private walletRepo: WalletRepository;
  private solanaRpc: SolanaRpcPort;
  private priceProvider: PriceProvider;
  private tokenInfoProvider: TokenInfoProvider;

  constructor(
    walletRepo: WalletRepository,
    solanaRpc: SolanaRpcPort,
    priceProvider: PriceProvider,
    tokenInfoProvider: TokenInfoProvider
  ) {
    this.walletRepo = walletRepo;
    this.solanaRpc = solanaRpc;
    this.priceProvider = priceProvider;
    this.tokenInfoProvider = tokenInfoProvider;
  }

  async getWalletState(walletId: string): Promise<WalletState> {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }

    LoggerService.getInstance().info(`Fetching wallet state for ${wallet.address}`);

    const walletTokens = await this.solanaRpc.getTokenAccounts(wallet.address);

    const mints = walletTokens.tokens.map((t) => t.mint);
    if (walletTokens.solBalance > 0) {
      mints.unshift('So11111111111111111111111111111111111111112');
    }

    const tokenInfoMap = await this.tokenInfoProvider.getTokenInfoBatch(mints);

    let prices: Map<string, number> = new Map();
    if (mints.length > 0) {
      try {
        const priceResults = await this.priceProvider.getPrice(mints);
        prices = new Map(priceResults.map((p) => [p.mint, p.price]));
      } catch (error) {
        LoggerService.getInstance().warn(
          `Failed to fetch prices: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const tokens: WalletState['tokens'] = [];
    let totalValue = 0;

    if (walletTokens.solBalance > 0) {
      const mint = 'So11111111111111111111111111111111111111112';
      const price = prices.get(mint) || 0;
      const value = walletTokens.solBalance * price;
      const tokenInfo = tokenInfoMap.get(mint);
      tokens.push({
        mint,
        symbol: tokenInfo?.symbol,
        amount: walletTokens.solBalance,
        decimals: 9,
        price,
        value,
      });
      totalValue += value;
    }

    for (const token of walletTokens.tokens) {
      const price = prices.get(token.mint) || 0;
      const value = token.uiAmount * price;
      const tokenInfo = tokenInfoMap.get(token.mint);
      tokens.push({
        mint: token.mint,
        symbol: tokenInfo?.symbol,
        amount: token.uiAmount,
        decimals: token.decimals,
        price,
        value,
      });
      totalValue += value;
    }

    wallet.markAsUsed();
    await this.walletRepo.update(wallet);

    return {
      address: wallet.address,
      solBalance: walletTokens.solBalance,
      tokens,
      totalValue,
    };
  }
}
