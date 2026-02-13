import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';

function checkJupiterApiKey(dataDir: string | undefined): boolean {
  const configService = new ConfigurationService(dataDir);
  return !!configService.getConfig().jupiter.apiKey;
}

export function createPriceCommands(
  _getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const price = new Command('price').description('Get token prices and information');

  const ultraApi = new UltraApiService();

  // Get price
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
      const spinner = ora('Fetching prices...').start();

      try {
        // Handle common symbols
        const mints = tokens.map((t: string) => {
          const upper = t.toUpperCase();
          if (upper === 'SOL') return 'So11111111111111111111111111111111111111112';
          if (upper === 'USDC') return 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
          if (upper === 'USDT') return 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
          if (upper === 'BONK') return 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
          return t;
        });

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
        console.log(`${chalk.gray('Token'.padEnd(44))} ${chalk.gray('Price (USD)')}`);
        console.log(chalk.gray('─'.repeat(65)));

        for (const price of prices) {
          const displayMint = price.mint.slice(0, 42).padEnd(44);
          const priceStr = price.price > 0 ? `$${price.price.toFixed(6)}` : chalk.gray('N/A');
          console.log(`${chalk.cyan(displayMint)} ${priceStr}`);
        }

        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch prices');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  // Search tokens
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
