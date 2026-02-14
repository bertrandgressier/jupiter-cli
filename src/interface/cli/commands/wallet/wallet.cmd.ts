import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { WalletManagerService } from '../../../../application/services/wallet/wallet-manager.service';
import { WalletCreatorService } from '../../../../application/services/wallet/wallet-creator.service';
import { WalletImporterService } from '../../../../application/services/wallet/wallet-importer.service';
import { WalletExporterService } from '../../../../application/services/wallet/wallet-exporter.service';
import { WalletSyncService } from '../../../../application/services/wallet/wallet-sync.service';
import { WalletResolverService } from '../../../../application/services/wallet/wallet-resolver.service';
import { MasterPasswordService } from '../../../../application/services/security/master-password.service';
import { TokenInfoService } from '../../../../application/services/token-info.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { solanaRpcService } from '../../../../infrastructure/solana/solana-rpc.service';
import { ultraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { TriggerApiService } from '../../../../infrastructure/jupiter-api/trigger/trigger-api.service';
import { PathManager } from '../../../../core/config/path-manager';
import { SessionService } from '../../../../core/session/session.service';
import {
  OrderSyncService,
  ActiveOrderWithPrice,
} from '../../../../application/services/order/order-sync.service';

export function createWalletCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const wallet = new Command('wallet').description('Manage wallets');

  wallet.hook('preAction', () => {
    const dataDir = getDataDir();
    const pathManager = new PathManager(dataDir);

    if (!pathManager.isInitialized()) {
      console.error(chalk.red('\n❌ Jup CLI is not initialized.\n'));
      console.log(chalk.dim('Please run: jup-cli init\n'));
      process.exit(1);
    }
  });

  wallet
    .command('list')
    .description('List all wallets')
    .action(async () => {
      const spinner = ora('Loading wallets...').start();

      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const walletManager = new WalletManagerService(walletRepo);
        const wallets = await walletManager.getAllWallets();
        spinner.stop();

        if (wallets.length === 0) {
          console.log(chalk.yellow('No wallets found. Create one with: jup-cli wallet create'));
          return;
        }

        console.log(chalk.bold('\n📁 Wallets\n'));
        console.log(
          chalk.gray(`${'#'.padEnd(4)} ${'Name'.padEnd(20)} ${'Address'.padEnd(45)} Status`)
        );
        console.log(chalk.gray('─'.repeat(80)));

        for (let i = 0; i < wallets.length; i++) {
          const w = wallets[i];
          if (!w) continue;
          const index = String(i + 1).padEnd(4);
          const status = w.isActive ? chalk.green('Active') : chalk.gray('Inactive');

          console.log(
            `${chalk.cyan(index)} ${w.name.padEnd(20)} ${w.address.padEnd(45)} ${status}`
          );
        }

        console.log();
        console.log(chalk.dim('Tip: Use wallet number, name, or UUID in commands'));
        console.log(chalk.dim('Example: jup-cli wallet show 1  or  jup-cli wallet show Trading'));
        console.log();
      } catch (error) {
        spinner.fail('Failed to load wallets');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  wallet
    .command('create')
    .description('Create a new wallet')
    .option('-n, --name <name>', 'Wallet name')
    .option('-p, --password <password>', 'Master password (optional if session exists)')
    .action(async (options) => {
      let name = options.name;

      const prisma = getPrisma();
      const dataDir = getDataDir();
      const sessionService = new SessionService(prisma, dataDir);
      const sessionKey = await sessionService.getSessionKey();

      if (!name) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter wallet name:',
            validate: (input: string) => input.trim() !== '' || 'Name is required',
          },
        ]);
        name = answer.name;
      }

      const spinner = ora('Creating wallet...').start();

      try {
        const walletRepo = new PrismaWalletRepository(prisma);
        const masterPasswordService = new MasterPasswordService(prisma);

        if (sessionKey) {
          masterPasswordService.setSessionKey(sessionKey);
        } else if (options.password) {
          await masterPasswordService.authenticate(options.password);
        } else {
          spinner.stop();
          const answer = await inquirer.prompt([
            {
              type: 'password',
              name: 'password',
              message: 'Enter master password (no active session):',
              mask: '*',
              validate: (input: string) => input.trim() !== '' || 'Master password is required',
            },
          ]);
          spinner.start('Creating wallet...');
          await masterPasswordService.authenticate(answer.password);
        }

        const walletCreator = new WalletCreatorService(walletRepo, masterPasswordService);

        const newWallet = await walletCreator.createWallet(name);

        spinner.succeed('Wallet created successfully');

        console.log(chalk.green('\n✅ New wallet created'));
        console.log(chalk.dim(`ID:      ${newWallet.id}`));
        console.log(chalk.dim(`Name:    ${newWallet.name}`));
        console.log(chalk.dim(`Address: ${newWallet.address}`));
        console.log(
          chalk.yellow('\n⚠️  Important: Store your address safely. Private key is encrypted.')
        );
      } catch (error) {
        spinner.fail('Failed to create wallet');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  wallet
    .command('import')
    .description('Import a wallet from private key')
    .option('-n, --name <name>', 'Wallet name')
    .option('-k, --private-key <key>', 'Private key (base58)')
    .option('-p, --password <password>', 'Master password (for scripting)')
    .action(async (options) => {
      let name = options.name;
      let privateKey = options.privateKey;
      let masterPassword = options.password;

      if (!name) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter wallet name:',
            validate: (input: string) => input.trim() !== '' || 'Name is required',
          },
        ]);
        name = answer.name;
      }

      if (!privateKey) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'privateKey',
            message: 'Enter private key (base58):',
            mask: '*',
            validate: (input: string) => input.trim() !== '' || 'Private key is required',
          },
        ]);
        privateKey = answer.privateKey;
      }

      if (!masterPassword) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter master password:',
            mask: '*',
            validate: (input: string) => input.trim() !== '' || 'Master password is required',
          },
        ]);
        masterPassword = answer.password;
      }

      const spinner = ora('Importing wallet...').start();

      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const masterPasswordService = new MasterPasswordService(prisma);
        const walletImporter = new WalletImporterService(walletRepo, masterPasswordService);

        const importedWallet = await walletImporter.importWallet(name, privateKey, masterPassword);

        spinner.succeed('Wallet imported successfully');

        console.log(chalk.green('\n✅ Wallet imported'));
        console.log(chalk.dim(`ID:      ${importedWallet.id}`));
        console.log(chalk.dim(`Name:    ${importedWallet.name}`));
        console.log(chalk.dim(`Address: ${importedWallet.address}`));
      } catch (error) {
        spinner.fail('Failed to import wallet');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  wallet
    .command('show')
    .description('Show wallet status and balances (fetched from blockchain in real-time)')
    .argument('<wallet>', 'Wallet identifier (number, name, or UUID)')
    .action(async (walletIdentifier) => {
      const spinner = ora('Fetching wallet state from blockchain...').start();

      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);

        const foundWallet = await walletResolver.resolve(walletIdentifier);

        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApiService);
        const walletSync = new WalletSyncService(
          walletRepo,
          solanaRpcService,
          ultraApiService,
          tokenInfoService
        );
        const state = await walletSync.getWalletState(foundWallet.id);

        const priceProvider = {
          getPrice: async (mints: string[]) => ultraApiService.getPrice(mints),
        };

        // Fetch active orders (requires Jupiter API key)
        let activeOrders: ActiveOrderWithPrice[] = [];
        try {
          const triggerApi = new TriggerApiService();
          const orderSyncService = new OrderSyncService(
            triggerApi,
            priceProvider,
            tokenInfoService
          );
          activeOrders = await orderSyncService.getActiveOrdersWithPrices(foundWallet.address);
        } catch (_error) {
          // Jupiter API key not configured or API error - skip active orders display
        }

        spinner.stop();

        console.log(chalk.bold('\n📊 Wallet Status\n'));
        console.log(chalk.cyan('Wallet:'), foundWallet.name);
        console.log(chalk.dim('ID:'), foundWallet.id);
        console.log(chalk.dim('Address:'), foundWallet.address);
        console.log(
          chalk.dim('Status:'),
          foundWallet.isActive ? chalk.green('Active') : chalk.gray('Inactive')
        );
        console.log();

        console.log(chalk.bold('💰 Portfolio Summary'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(
          `${'Total Value:'.padEnd(20)} ${chalk.bold('$' + state.totalValue.toFixed(2))}`
        );
        console.log();

        if (state.tokens.length > 0) {
          console.log(chalk.bold('📈 Token Balances'));
          console.log(chalk.gray('─'.repeat(80)));
          console.log(
            `${chalk.gray('Token'.padEnd(8))} ${chalk.gray('Amount'.padEnd(14))} ${chalk.gray('Price'.padEnd(10))} ${chalk.gray('Value')}`
          );
          console.log(chalk.gray('─'.repeat(80)));

          for (const token of state.tokens) {
            const symbol = token.symbol ?? token.mint.slice(0, 8) + '...';
            const amount = token.amount.toFixed(4).padEnd(14);
            const price = '$' + token.price.toFixed(2).padEnd(8);
            const value = '$' + token.value.toFixed(2);

            console.log(`${chalk.cyan(symbol.padEnd(8))} ${amount} ${price} ${value}`);
          }
          console.log();
        }

        if (activeOrders.length > 0) {
          console.log(chalk.bold(`⏳ Active Limit Orders (${activeOrders.length})`));
          console.log(chalk.gray('─'.repeat(80)));
          console.log(
            `${chalk.gray('Input'.padEnd(15))} ${chalk.gray('Output'.padEnd(15))} ${chalk.gray('Target'.padEnd(12))} ${chalk.gray('Current'.padEnd(12))} ${chalk.gray('Diff')}`
          );
          console.log(chalk.gray('─'.repeat(80)));

          for (const order of activeOrders) {
            const inputStr = `${order.inputAmount} ${order.inputSymbol || '???'}`.slice(0, 14);
            const outputStr = `${order.outputAmount} ${order.outputSymbol || '???'}`.slice(0, 14);
            const target = `$${order.targetPrice.toFixed(2)}`;
            const current = `$${order.currentPrice.toFixed(2)}`;
            const diff =
              order.diffPercent >= 0
                ? chalk.green(`+${order.diffPercent.toFixed(1)}%`)
                : chalk.red(`${order.diffPercent.toFixed(1)}%`);

            console.log(
              `${inputStr.padEnd(15)} ${outputStr.padEnd(15)} ${target.padEnd(12)} ${current.padEnd(12)} ${diff}`
            );
          }
          console.log();
        }

        console.log();
        console.log(chalk.dim('Data fetched in real-time from Solana RPC + Jupiter API'));
        console.log();
      } catch (error) {
        spinner.fail('Failed to load wallet status');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  wallet
    .command('export')
    .description('Export wallet private key (PROTECTED - requires password, session not allowed)')
    .argument('<wallet>', 'Wallet identifier (number, name, or UUID)')
    .option('-p, --password <password>', 'Master password')
    .action(async (walletIdentifier, options) => {
      const prisma = getPrisma();
      const dataDir = getDataDir();
      const sessionService = new SessionService(prisma, dataDir);
      const walletRepo = new PrismaWalletRepository(prisma);
      const walletResolver = new WalletResolverService(walletRepo);

      let wallet;
      try {
        wallet = await walletResolver.resolve(walletIdentifier);
      } catch {
        console.log(chalk.red('\n❌ Wallet not found'));
        return;
      }

      const hasSession = await sessionService.hasSession();
      if (hasSession && !options.password) {
        console.log(chalk.yellow('\n🔒 This is a protected command.'));
        console.log(chalk.dim('Session access is not allowed for exporting private keys.'));
        console.log(chalk.dim('Please provide your master password.\n'));
      }

      let password = options.password;

      if (!password) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter master password:',
            mask: '*',
          },
        ]);
        password = answer.password;
      }

      const spinner = ora('Exporting wallet...').start();

      try {
        const masterPasswordService = new MasterPasswordService(prisma);
        const walletExporter = new WalletExporterService(walletRepo, masterPasswordService);

        const privateKey = await walletExporter.exportPrivateKey(wallet.id, password);

        spinner.succeed('Wallet exported');

        console.log(chalk.yellow('\n⚠️  WARNING: Keep this private key secure!\n'));
        console.log(chalk.dim('Private Key:'));
        console.log(chalk.white(privateKey));
        console.log();
      } catch (error) {
        spinner.fail('Failed to export wallet');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  wallet
    .command('delete')
    .description('Delete a wallet (PROTECTED - requires password, session not allowed)')
    .argument('<wallet>', 'Wallet identifier (number, name, or UUID)')
    .option('-p, --password <password>', 'Master password')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (walletIdentifier, options) => {
      const prisma = getPrisma();
      const dataDir = getDataDir();
      const sessionService = new SessionService(prisma, dataDir);
      const walletRepo = new PrismaWalletRepository(prisma);
      const walletResolver = new WalletResolverService(walletRepo);

      let foundWallet;
      try {
        foundWallet = await walletResolver.resolve(walletIdentifier);
      } catch {
        console.log(chalk.red('\n❌ Wallet not found'));
        return;
      }

      const hasSession = await sessionService.hasSession();
      if (hasSession && !options.password) {
        console.log(chalk.yellow('\n🔒 This is a protected command.'));
        console.log(chalk.dim('Session access is not allowed for deleting wallets.'));
        console.log(chalk.dim('Please provide your master password.\n'));
      }

      console.log(chalk.dim(`\nWallet: ${foundWallet.name} (${foundWallet.address})`));

      if (!options.force) {
        const { confirmDelete } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmDelete',
            message: chalk.red('Are you sure you want to delete this wallet?'),
            default: false,
          },
        ]);

        if (!confirmDelete) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }
      }

      let password = options.password;

      if (!password) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter master password to confirm deletion:',
            mask: '*',
          },
        ]);
        password = answer.password;
      }

      const spinner = ora('Deleting wallet...').start();

      try {
        const masterPasswordService = new MasterPasswordService(prisma);

        const isValid = await masterPasswordService.verifyPassword(password);
        if (!isValid) {
          spinner.fail('Invalid password');
          return;
        }

        await walletRepo.delete(foundWallet.id);

        spinner.succeed('Wallet deleted');

        console.log(chalk.green('\n✅ Wallet deleted successfully'));
        console.log(chalk.dim(`ID: ${foundWallet.id}`));
        console.log();
        console.log(
          chalk.yellow('⚠️  The wallet can still be recovered if you have the private key.')
        );
        console.log(chalk.dim('Use `jup-cli wallet import` to restore it.'));
      } catch (error) {
        spinner.fail('Failed to delete wallet');
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
      }
    });

  return wallet;
}
