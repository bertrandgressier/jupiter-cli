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
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION = packageJson.version;

import { execSync } from 'child_process';
import { createInitCommand } from './interface/cli/commands/init/init.cmd';
import { createWalletCommands } from './interface/cli/commands/wallet/wallet.cmd';
import { createPriceCommands } from './interface/cli/commands/price/price.cmd';
import { createTradeCommands } from './interface/cli/commands/trade/trade.cmd';
import { createConfigCommands } from './interface/cli/commands/config/config.cmd';
import { createSessionCommands } from './interface/cli/commands/session/session.cmd';
import { ConfigurationService } from './core/config/configuration.service';
import { PathManager } from './core/config/path-manager';
import { LoggerService } from './core/logger/logger.service';
import { PrismaClient } from '@prisma/client';

// Global option for data directory
let dataDir: string | undefined;

// Thread-safe PrismaClient singleton
class PrismaClientFactory {
  private static instance: PrismaClient | null = null;
  private static initializing = false;
  private static migrationsRun = false;

  private static runMigrations(databaseUrl: string): void {
    if (PrismaClientFactory.migrationsRun) {
      return;
    }

    try {
      execSync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Ignore migration errors - might be fresh install without init
    }

    PrismaClientFactory.migrationsRun = true;
  }

  static getInstance(): PrismaClient {
    if (!PrismaClientFactory.instance && !PrismaClientFactory.initializing) {
      PrismaClientFactory.initializing = true;
      try {
        const configService = ConfigurationService.getInstance(dataDir);
        const databaseUrl = configService.getDatabaseUrl();

        const pathManager = new PathManager(dataDir);
        if (pathManager.isInitialized()) {
          PrismaClientFactory.runMigrations(databaseUrl);
        }

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

const program = new Command();

program
  .name('jup-cli')
  .description('Jup CLI - Trade on Solana with multi-wallet support')
  .version(VERSION)
  .option('-d, --data-dir <path>', 'Data directory path (default: ~/.solana/jup-cli/)')
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
  console.log('  $ jup-cli init                              # Initialize CLI');
  console.log('  $ jup-cli --data-dir ./my-data init         # Initialize with custom path');
  console.log('  $ jup-cli config set-jupiter-key            # Set API key');
  console.log('  $ jup-cli wallet list                       # List wallets');
  console.log('  $ jup-cli wallet create -n Trading          # Create named wallet');
  console.log('  $ jup-cli price get SOL USDC                # Get prices');
  console.log('  $ jup-cli trade swap -w <id> SOL USDC 1     # Execute swap');
  console.log('  $ jup-cli session status                    # Check session');
  console.log('');
  console.log(chalk.dim('Configuration:'));
  console.log(chalk.dim('  All settings are stored in: ~/.solana/jup-cli/config.yaml'));
  console.log(chalk.dim('  Use "jup-cli config" commands to manage settings'));
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
