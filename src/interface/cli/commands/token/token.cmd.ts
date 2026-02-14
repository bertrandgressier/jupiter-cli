import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { TokensApiService } from '../../../../infrastructure/jupiter-api/tokens/tokens-api.service';
import { ShieldApiService } from '../../../../infrastructure/jupiter-api/shield/shield-api.service';
import { PriceV3ApiService } from '../../../../infrastructure/jupiter-api/price/price-v3-api.service';
import { TokenDiscoveryService } from '../../../../application/services/token-discovery/token-discovery.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';
import { TokenInterval } from '../../../../application/ports/token-discovery.port';
import { displayTokenTable, displayTokenDetails, displayShieldWarnings } from './token-formatters';

function checkJupiterApiKey(dataDir: string | undefined): boolean {
  const configService = ConfigurationService.getInstance(dataDir);
  return !!configService.getConfig().jupiter.apiKey;
}

function createService(): TokenDiscoveryService {
  const tokensApi = new TokensApiService();
  const shieldApi = new ShieldApiService();
  const priceApi = new PriceV3ApiService();
  return new TokenDiscoveryService(tokensApi, shieldApi, priceApi);
}

function apiKeyCheck(getDataDir: () => string | undefined): () => void {
  return () => {
    if (!checkJupiterApiKey(getDataDir())) {
      console.error(chalk.red('\nJupiter API key not configured.\n'));
      console.log(chalk.dim('Token commands require a Jupiter API key.'));
      console.log(chalk.dim('Get one at: https://portal.jup.ag/'));
      console.log(chalk.dim('Then run: jup-cli config set-jupiter-key\n'));
      process.exit(1);
    }
  };
}

export function createTokenCommands(getDataDir: () => string | undefined): Command {
  const token = new Command('token').description(
    'Discover tokens, check security, and get market data'
  );

  // token search <query>
  token
    .command('search')
    .description('Search tokens by symbol, name, or mint address')
    .argument('<query>', 'Search query (symbol, name, or mint address)')
    .option('--stats', 'Show trading statistics')
    .option('--limit <n>', 'Max results to display', '20')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (query, options) => {
      const spinner = ora('Searching tokens...').start();

      try {
        const service = createService();
        const tokens = await service.searchTokens(query);

        spinner.stop();

        const limit = parseInt(options.limit, 10);
        const displayTokens = tokens.slice(0, limit);

        console.log(chalk.bold(`\nSearch results for "${query}" (${tokens.length} found)\n`));
        displayTokenTable(displayTokens, options.stats);
        console.log();
      } catch (error) {
        spinner.fail('Search failed');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token info <mint>
  token
    .command('info')
    .description('Get detailed information about a token including security analysis')
    .argument('<mint>', 'Token mint address')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (mint) => {
      const spinner = ora('Fetching token details...').start();

      try {
        const service = createService();
        const details = await service.getTokenDetails(mint);

        spinner.stop();

        displayTokenDetails(details.token, details.warnings, details.price);
      } catch (error) {
        spinner.fail('Failed to get token details');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token trending [interval]
  token
    .command('trending')
    .description('Show trending tokens')
    .argument('[interval]', 'Time interval: 5m, 1h, 6h, 24h', '24h')
    .option('--limit <n>', 'Max results to display', '20')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (interval, options) => {
      const validIntervals: TokenInterval[] = ['5m', '1h', '6h', '24h'];
      if (!validIntervals.includes(interval as TokenInterval)) {
        console.error(
          chalk.red(`\nInvalid interval "${interval}". Use: ${validIntervals.join(', ')}`)
        );
        return;
      }

      const spinner = ora(`Fetching trending tokens (${interval})...`).start();

      try {
        const service = createService();
        const limit = parseInt(options.limit, 10);
        const tokens = await service.getTrendingTokens(interval as TokenInterval, limit);

        spinner.stop();

        console.log(chalk.bold(`\nTrending Tokens (${interval})\n`));
        displayTokenTable(tokens.slice(0, limit), true);
        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch trending tokens');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token traded [interval]
  token
    .command('traded')
    .description('Show top traded tokens by volume')
    .argument('[interval]', 'Time interval: 5m, 1h, 6h, 24h', '24h')
    .option('--limit <n>', 'Max results to display', '20')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (interval, options) => {
      const validIntervals: TokenInterval[] = ['5m', '1h', '6h', '24h'];
      if (!validIntervals.includes(interval as TokenInterval)) {
        console.error(
          chalk.red(`\nInvalid interval "${interval}". Use: ${validIntervals.join(', ')}`)
        );
        return;
      }

      const spinner = ora(`Fetching top traded tokens (${interval})...`).start();

      try {
        const service = createService();
        const limit = parseInt(options.limit, 10);
        const tokens = await service.getTopTradedTokens(interval as TokenInterval, limit);

        spinner.stop();

        console.log(chalk.bold(`\nTop Traded Tokens (${interval})\n`));
        displayTokenTable(tokens.slice(0, limit), true);
        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch top traded tokens');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token organic [interval]
  token
    .command('organic')
    .description('Show tokens with highest organic score')
    .argument('[interval]', 'Time interval: 5m, 1h, 6h, 24h', '24h')
    .option('--limit <n>', 'Max results to display', '20')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (interval, options) => {
      const validIntervals: TokenInterval[] = ['5m', '1h', '6h', '24h'];
      if (!validIntervals.includes(interval as TokenInterval)) {
        console.error(
          chalk.red(`\nInvalid interval "${interval}". Use: ${validIntervals.join(', ')}`)
        );
        return;
      }

      const spinner = ora(`Fetching top organic tokens (${interval})...`).start();

      try {
        const service = createService();
        const limit = parseInt(options.limit, 10);
        const tokens = await service.getTopOrganicTokens(interval as TokenInterval, limit);

        spinner.stop();

        console.log(chalk.bold(`\nTop Organic Score Tokens (${interval})\n`));
        displayTokenTable(tokens.slice(0, limit), true);
        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch top organic tokens');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token recent
  token
    .command('recent')
    .description('Show recently listed tokens (first pool created)')
    .option('--limit <n>', 'Max results to display', '20')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (options) => {
      const spinner = ora('Fetching recent tokens...').start();

      try {
        const service = createService();
        const tokens = await service.getRecentTokens();

        spinner.stop();

        const limit = parseInt(options.limit, 10);

        console.log(chalk.bold('\nRecently Listed Tokens\n'));
        displayTokenTable(tokens.slice(0, limit), true);
        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch recent tokens');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token verified
  token
    .command('verified')
    .description('List all verified tokens')
    .option('--limit <n>', 'Max results to display', '50')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (options) => {
      const spinner = ora('Fetching verified tokens...').start();

      try {
        const service = createService();
        const tokens = await service.getTokensByTag('verified');

        spinner.stop();

        const limit = parseInt(options.limit, 10);

        console.log(chalk.bold(`\nVerified Tokens (${tokens.length} total)\n`));
        displayTokenTable(tokens.slice(0, limit), false);
        if (tokens.length > limit) {
          console.log(
            chalk.dim(`\n  Showing ${limit} of ${tokens.length}. Use --limit to see more.`)
          );
        }
        console.log();
      } catch (error) {
        spinner.fail('Failed to fetch verified tokens');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  // token shield <mints...>
  token
    .command('shield')
    .description('Check security warnings for one or more tokens')
    .argument('<mints...>', 'Token mint addresses to check')
    .hook('preAction', apiKeyCheck(getDataDir))
    .action(async (mints) => {
      const spinner = ora('Checking token security...').start();

      try {
        const service = createService();
        const response = await service.getShieldWarnings(mints);

        spinner.stop();

        console.log(chalk.bold('\nSecurity Analysis\n'));
        displayShieldWarnings(response.warnings);
      } catch (error) {
        spinner.fail('Security check failed');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

  return token;
}
