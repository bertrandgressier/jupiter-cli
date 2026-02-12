#!/usr/bin/env node

// Suppress punycode deprecation warning from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return;
  }
  console.warn(warning);
});

import { Command } from 'commander';
import chalk from 'chalk';
import { createInitCommand } from './interface/cli/commands/init/init.cmd';
import { createWalletCommands } from './interface/cli/commands/wallet/wallet.cmd';
import { createPriceCommands } from './interface/cli/commands/price/price.cmd';
import { createTradeCommands } from './interface/cli/commands/trade/trade.cmd';
import { createConfigCommands } from './interface/cli/commands/config/config.cmd';
import { createSessionCommands } from './interface/cli/commands/session/session.cmd';
import { ConfigurationService } from './core/config/configuration.service';
import { LoggerService } from './core/logger/logger.service';
import { PrismaClient } from '@prisma/client';

// Global option for data directory
let dataDir: string | undefined;

// Thread-safe PrismaClient singleton
class PrismaClientFactory {
  private static instance: PrismaClient | null = null;
  private static initializing = false;

  static getInstance(): PrismaClient {
    if (!PrismaClientFactory.instance && !PrismaClientFactory.initializing) {
      PrismaClientFactory.initializing = true;
      try {
        const configService = ConfigurationService.getInstance(dataDir);
        const databaseUrl = configService.getDatabaseUrl();

        PrismaClientFactory.instance = new PrismaClient({
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        });
      } finally {
        PrismaClientFactory.initializing = false;
      }
    }

    if (!PrismaClientFactory.instance) {
      throw new Error('Failed to initialize PrismaClient');
    }

    return PrismaClientFactory.instance;
  }

  static async disconnect(): Promise<void> {
    if (PrismaClientFactory.instance) {
      await PrismaClientFactory.instance.$disconnect();
      PrismaClientFactory.instance = null;
    }
  }

  static reset(): void {
    PrismaClientFactory.instance = null;
  }
}

function getDataDir(): string | undefined {
  return dataDir;
}

function getPrismaClient(): PrismaClient {
  return PrismaClientFactory.getInstance();
}

const VERSION = '1.0.0';
const program = new Command();

program
  .name('jupiter')
  .description('Jupiter CLI - Trade on Solana with multi-wallet support and PnL tracking')
  .version(VERSION)
  .option('-d, --data-dir <path>', 'Data directory path (default: ~/.solana/jupiter-cli/)')
  .option('-v, --verbose', 'Enable verbose logging to console')
  .hook('preAction', (thisCommand) => {
    // Get options before any command runs
    const options = thisCommand.opts();
    if (options.dataDir) {
      dataDir = options.dataDir;
      // Reset configuration to use new data dir
      ConfigurationService.resetInstance();
      ConfigurationService.getInstance(dataDir);
    }
    if (options.verbose) {
      LoggerService.getInstance().setVerbose(true);
    }
  });

// Add commands with factory functions that get Prisma client
program.addCommand(createInitCommand(getDataDir));
program.addCommand(createWalletCommands(getPrismaClient, getDataDir));
program.addCommand(createPriceCommands(getPrismaClient, getDataDir));
program.addCommand(createTradeCommands(getPrismaClient, getDataDir));
program.addCommand(createConfigCommands(getDataDir));
program.addCommand(createSessionCommands(getPrismaClient, getDataDir));

// Default help
program.on('--help', () => {
  console.log('');
  console.log(chalk.bold('Examples:'));
  console.log('  $ jupiter init                              # Initialize CLI');
  console.log('  $ jupiter --data-dir ./my-data init         # Initialize with custom path');
  console.log('  $ jupiter config set-jupiter-key            # Set API key');
  console.log('  $ jupiter wallet list                       # List wallets');
  console.log('  $ jupiter price get SOL USDC                # Get prices');
  console.log('  $ jupiter trade swap --wallet <id> SOL USDC 1   # Execute swap');
  console.log('  $ jupiter transfer scan --wallet <id>       # Scan transfers');
  console.log('  $ jupiter pnl show --wallet <id>            # Show PnL');
  console.log('');
  console.log(chalk.dim('Configuration:'));
  console.log(chalk.dim('  All settings are stored in: ~/.solana/jupiter-cli/config.yaml'));
  console.log(chalk.dim('  Use "jupiter config" commands to manage settings'));
  console.log('');
});

// Handle graceful shutdown
async function cleanup() {
  try {
    await PrismaClientFactory.disconnect();
  } catch (_err) {
    // Ignore errors during cleanup
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void cleanup();
});
process.on('SIGTERM', () => {
  void cleanup();
});

// Handle errors
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Ignore commander.help and version errors (they are not real errors)
    // When using -V/--version, commander throws an error with the version as message
    // When using --help, commander throws an error with 'commander.help' or '(outputHelp)' as message
    if (
      error instanceof Error &&
      error.message !== 'commander.help' &&
      error.message !== '(outputHelp)' &&
      error.message !== VERSION
    ) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
      process.exit(1);
    }
  }
}

main();
