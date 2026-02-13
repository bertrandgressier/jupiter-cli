import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { PrismaClient } from '@prisma/client';
import { PrismaTradeRepository } from '../../../../infrastructure/repositories/prisma-trade.repository';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { WalletResolverService } from '../../../../application/services/wallet/wallet-resolver.service';
import { PnLService } from '../../../../application/services/pnl/pnl.service';
import { TokenInfoService } from '../../../../application/services/token-info.service';
import { SolanaRpcService } from '../../../../infrastructure/solana/solana-rpc.service';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';

export function createPnlCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const pnl = new Command('pnl').description('View profit and loss');

  const ultraApi = new UltraApiService();

  pnl
    .command('show')
    .description('Show PnL report for a wallet')
    .argument('[token]', 'Optional: show PnL for specific token only')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier (number, name, or UUID)')
    .action(async (token, options) => {
      try {
        const prisma = getPrisma();
        const dataDir = getDataDir();
        const configService = ConfigurationService.getInstance(dataDir);

        const walletRepo = new PrismaWalletRepository(prisma);
        const tradeRepo = new PrismaTradeRepository(prisma);
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);
        const rpcService = new SolanaRpcService(configService.getConfig().solana.rpcUrl);

        const priceProvider = {
          getPrice: async (mints: string[]) => {
            return ultraApi.getPrice(mints);
          },
        };

        const walletResolver = new WalletResolverService(walletRepo);
        const wallet = await walletResolver.resolve(options.wallet);

        console.log(chalk.bold(`\n📊 PnL Report — Wallet: ${wallet.name}\n`));

        let mintFilter: string | undefined;
        if (token) {
          const resolvedToken = await tokenInfoService.resolveToken(token);
          mintFilter = resolvedToken.mint;
        }

        const pnlService = new PnLService(tradeRepo, rpcService, priceProvider);
        const result = await pnlService.calculatePnL(wallet.id, wallet.address, mintFilter);

        if (result.tokens.length === 0) {
          console.log(chalk.yellow('No tracked tokens found.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.gray('Token'),
            chalk.gray('Balance'),
            chalk.gray('Avg Cost'),
            chalk.gray('Current'),
            chalk.gray('Value'),
            chalk.gray('Unrealized'),
            chalk.gray('Realized'),
          ],
          colWidths: [10, 15, 12, 12, 15, 15, 12],
        });

        for (const tokenPnL of result.tokens) {
          const symbol = tokenPnL.symbol || tokenPnL.mint.slice(0, 8);
          const balance = tokenPnL.balance.toFixed(4);
          const avgCost = tokenPnL.tracked
            ? `$${tokenPnL.avgCost.toFixed(4)}`
            : chalk.dim('untracked');
          const current = `$${tokenPnL.currentPrice.toFixed(4)}`;
          const value = `$${tokenPnL.currentValue.toFixed(2)}`;

          let unrealized: string;
          if (!tokenPnL.tracked) {
            unrealized = chalk.dim('-');
          } else if (tokenPnL.unrealizedPnl >= 0) {
            unrealized = chalk.green(`+$${tokenPnL.unrealizedPnl.toFixed(2)}`);
          } else {
            unrealized = chalk.red(`-$${Math.abs(tokenPnL.unrealizedPnl).toFixed(2)}`);
          }

          const realized = tokenPnL.tracked
            ? `$${tokenPnL.realizedPnl.toFixed(2)}`
            : chalk.dim('-');

          table.push([symbol, balance, avgCost, current, value, unrealized, realized]);
        }

        console.log(table.toString());

        console.log();
        console.log(chalk.bold('Total Value:'), `$${result.totalValue.toFixed(2)}`);
        console.log(
          chalk.bold('Unrealized PnL:'),
          result.totalUnrealizedPnl >= 0
            ? chalk.green(
                `+$${result.totalUnrealizedPnl.toFixed(2)} (+${result.totalUnrealizedPnlPercent.toFixed(1)}%)`
              )
            : chalk.red(
                `-$${Math.abs(result.totalUnrealizedPnl).toFixed(2)} (${result.totalUnrealizedPnlPercent.toFixed(1)}%)`
              )
        );
        console.log(chalk.bold('Realized PnL:'), `$${result.totalRealizedPnl.toFixed(2)}`);

        if (result.untrackedTokens.length > 0) {
          console.log();
          console.log(
            chalk.yellow('⚠ Untracked tokens (no trade history):'),
            result.untrackedTokens.slice(0, 5).join(', ') +
              (result.untrackedTokens.length > 5 ? '...' : '')
          );
          console.log(
            chalk.dim('  These tokens were received outside the CLI (transfers, airdrops, etc.)')
          );
        }

        console.log();
        console.log(chalk.dim('Calculated using cost average method'));
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return pnl;
}
