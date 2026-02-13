import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { TokenInfoService } from '../../../../application/services/token-info.service';

function checkJupiterApiKey(dataDir: string | undefined): boolean {
  const configService = new ConfigurationService(dataDir);
  return !!configService.getConfig().jupiter.apiKey;
}

export function createPriceCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const price = new Command('price').description('Get token prices and information');

  const ultraApi = new UltraApiService();

  price
    .command('get')
    .description('Get price of tokens')
    .argument('<tokens...]', 'Token mint addresses or symbols')
    .option('--debug', 'Show debug information')
    .hook('preAction', () => {
      if (!checkJupiterApiKey(getDataDir())) {
        console.error(chalk.red('\n❌ Jupiter API key not configured.\n'));
        console.log(chalk.dim('Price commands require a Jupiter API key.'));
        console.log(chalk.dim('Get one at: https://portal.jup.ag/'));
        console.log(chalk.dim('Then run: jup-cli config set-jupiter-key\n'));
        process.exit(1);
      }
    })
    .action(async (tokens, options) => {
      const spinner = ora('Resolving tokens...').start();

      try {
        const prisma = getPrisma();
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);

        const resolvedTokens = await Promise.all(
          tokens.map((t: string) => tokenInfoService.resolveToken(t))
        );

        const mints = resolvedTokens.map((t) => t.mint);
        const symbolMap = new Map(resolvedTokens.map((t) => [t.mint, t.symbol]));

        spinner.text = 'Fetching prices...';
        const prices = await ultraApi.getPrice(mints);

        spinner.stop();

        if (options.debug) {
          console.log(chalk.dim('\nDebug - Raw response:'));
          console.log(JSON.stringify(prices, null, 2));
          console.log();
        }

        if (!prices || prices.length === 0) {
          console.log(chalk.yellow('\n⚠️  No prices returned from API.'));
          console.log(chalk.dim('This might be due to:'));
          console.log(chalk.dim('  - Invalid API key'));
          console.log(chalk.dim('  - Invalid token mint addresses'));
          console.log(chalk.dim('  - API rate limiting'));
          console.log(chalk.dim('  - API service unavailable\n'));
          return;
        }

        console.log(chalk.bold('\n💰 Prices\n'));
        console.log(
          `${chalk.gray('Token'.padEnd(8))} ${chalk.gray('Mint Address'.padEnd(45))} ${chalk.gray('Price (USD)')}`
        );
        console.log(chalk.gray('─'.repeat(70)));

        for (const price of prices) {
          const symbol = symbolMap.get(price.mint) ?? price.mint.slice(0, 8) + '...';
          const mintDisplay = price.mint.padEnd(45);
          const priceStr = price.price > 0 ? `$${price.price.toFixed(6)}` : chalk.gray('N/A');
          console.log(`${chalk.cyan(symbol.padEnd(8))} ${chalk.dim(mintDisplay)} ${priceStr}`);
        }

        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch prices');
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  price
    .command('search')
    .description('Search for tokens')
    .argument('<query>', 'Search query')
    .hook('preAction', () => {
      if (!checkJupiterApiKey(getDataDir())) {
        console.error(chalk.red('\n❌ Jupiter API key not configured.\n'));
        console.log(chalk.dim('Price commands require a Jupiter API key.'));
        console.log(chalk.dim('Get one at: https://portal.jup.ag/'));
        console.log(chalk.dim('Then run: jup-cli config set-jupiter-key\n'));
        process.exit(1);
      }
    })
    .action(async (query) => {
      const spinner = ora('Searching tokens...').start();

      try {
        const tokens = await ultraApi.searchTokens(query);

        spinner.stop();

        if (tokens.length === 0) {
          console.log(chalk.yellow('No tokens found'));
          return;
        }

        console.log(chalk.bold(`\n🔍 Search results for "${query}"\n`));
        console.log(
          `${chalk.gray('Symbol'.padEnd(10))} ${chalk.gray('Name'.padEnd(30))} ${chalk.gray('Address')}`
        );
        console.log(chalk.gray('─'.repeat(90)));

        for (const token of tokens.slice(0, 10)) {
          const verified = token.verified ? chalk.green('✓') : chalk.gray('○');
          console.log(
            `${verified} ${token.symbol.padEnd(8)} ${token.name.slice(0, 28).padEnd(30)} ${chalk.dim(token.address)}`
          );
        }

        console.log();
      } catch (error) {
        spinner.fail('Failed to search tokens');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  return price;
}
