import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { PrismaClient } from '@prisma/client';
import { PrismaTradeRepository } from '../../../../infrastructure/repositories/prisma-trade.repository';
import { TradeService } from '../../../../application/services/trade/trade.service';
import { TokenInfoService } from '../../../../application/services/token-info.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { WalletResolverService } from '../../../../application/services/wallet/wallet-resolver.service';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';

export function createHistoryCommands(
  getPrisma: () => PrismaClient,
  _getDataDir: () => string | undefined
): Command {
  const history = new Command('history').description('View trade history');

  const ultraApi = new UltraApiService();

  history
    .description('Show trade history for a wallet')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier (number, name, or UUID)')
    .option('--token <symbol>', 'Filter by token symbol or mint')
    .option('--type <type>', 'Filter by trade type (swap | limit_order)')
    .option('--limit <n>', 'Number of results', '20')
    .option('--page <n>', 'Page number', '1')
    .action(async (options) => {
      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);
        const tradeRepo = new PrismaTradeRepository(prisma);
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);

        const priceProvider = {
          getPrice: async (mints: string[]) => {
            return mints.map((mint) => ({ mint, price: 0, timestamp: new Date() }));
          },
        };

        const tradeService = new TradeService(tradeRepo, priceProvider);

        const wallet = await walletResolver.resolve(options.wallet);
        console.log(chalk.dim(`\nWallet: ${wallet.name}\n`));

        const limit = parseInt(options.limit, 10);
        const page = parseInt(options.page, 10);
        const offset = (page - 1) * limit;

        let mintFilter: string | undefined;
        if (options.token) {
          const token = await tokenInfoService.resolveToken(options.token);
          mintFilter = token.mint;
        }

        const { trades, total } = await tradeService.getTradeHistory(wallet.id, {
          mint: mintFilter,
          type: options.type,
          limit,
          offset,
        });

        if (trades.length === 0) {
          console.log(chalk.yellow('No trades found.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.gray('Date'),
            chalk.gray('Type'),
            chalk.gray('Input'),
            chalk.gray('Output'),
            chalk.gray('USD Value'),
          ],
          colWidths: [20, 10, 25, 25, 15],
        });

        for (const trade of trades) {
          const date =
            trade.executedAt.toLocaleDateString() + ' ' + trade.executedAt.toLocaleTimeString();
          const type = trade.type === 'swap' ? chalk.cyan('Swap') : chalk.magenta('Limit');
          const inputStr = `${trade.inputAmount} ${trade.inputSymbol || trade.inputMint.slice(0, 8)}`;
          const outputStr = `${trade.outputAmount} ${trade.outputSymbol || trade.outputMint.slice(0, 8)}`;
          const usdValue = trade.inputUsdValue
            ? `$${parseFloat(trade.inputUsdValue).toFixed(2)}`
            : chalk.dim('N/A');

          table.push([date, type, inputStr, outputStr, usdValue]);
        }

        console.log(table.toString());
        console.log();
        console.log(
          chalk.dim(`Page ${page} of ${Math.ceil(total / limit)} (${total} total trades)`)
        );
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return history;
}
