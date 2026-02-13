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
import { MasterPasswordService } from '../../../../application/services/security/master-password.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { solanaRpcService } from '../../../../infrastructure/solana/solana-rpc.service';
import { ultraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { PathManager } from '../../../../core/config/path-manager';
import { SessionService } from '../../../../core/session/session.service';

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
          chalk.gray(`${'ID'.padEnd(38)} ${'Name'.padEnd(20)} ${'Address'.padEnd(45)} Status`)
        );
        console.log(chalk.gray('─'.repeat(110)));

        for (const w of wallets) {
          const status = w.isActive ? chalk.green('Active') : chalk.gray('Inactive');

          console.log(`${chalk.cyan(w.id)} ${w.name.padEnd(20)} ${w.address.padEnd(45)} ${status}`);
        }

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
    .argument('<wallet-id>', 'Wallet UUID')
    .action(async (walletId) => {
      const spinner = ora('Fetching wallet state from blockchain...').start();

      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const foundWallet = await walletRepo.findById(walletId);

        if (!foundWallet) {
          spinner.fail('Wallet not found');
          return;
        }

        const walletSync = new WalletSyncService(walletRepo, solanaRpcService, ultraApiService);
        const state = await walletSync.getWalletState(walletId);

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
          console.log(chalk.gray('─'.repeat(70)));
          console.log(
            `${chalk.gray('Token'.padEnd(12))} ${chalk.gray('Amount'.padEnd(15))} ${chalk.gray('Price'.padEnd(12))} ${chalk.gray('Value')}`
          );
          console.log(chalk.gray('─'.repeat(70)));

          for (const token of state.tokens) {
            const symbol =
              token.mint === 'So11111111111111111111111111111111111111112'
                ? 'SOL'
                : token.mint.slice(0, 8) + '...';
            const amount = token.amount.toFixed(4).padEnd(15);
            const price = '$' + token.price.toFixed(2).padEnd(10);
            const value = '$' + token.value.toFixed(2);

            console.log(`${symbol.padEnd(12)} ${amount} ${price} ${value}`);
          }
          console.log();
        }

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
    .argument('<wallet-id>', 'Wallet UUID')
    .option('-p, --password <password>', 'Master password')
    .action(async (walletId, options) => {
      const prisma = getPrisma();
      const dataDir = getDataDir();
      const sessionService = new SessionService(prisma, dataDir);

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
        const walletRepo = new PrismaWalletRepository(prisma);
        const masterPasswordService = new MasterPasswordService(prisma);
        const walletExporter = new WalletExporterService(walletRepo, masterPasswordService);

        const privateKey = await walletExporter.exportPrivateKey(walletId, password);

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
    .argument('<wallet-id>', 'Wallet UUID')
    .option('-p, --password <password>', 'Master password')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (walletId, options) => {
      const prisma = getPrisma();
      const dataDir = getDataDir();
      const sessionService = new SessionService(prisma, dataDir);

      const hasSession = await sessionService.hasSession();
      if (hasSession && !options.password) {
        console.log(chalk.yellow('\n🔒 This is a protected command.'));
        console.log(chalk.dim('Session access is not allowed for deleting wallets.'));
        console.log(chalk.dim('Please provide your master password.\n'));
      }

      const walletRepo = new PrismaWalletRepository(prisma);
      const foundWallet = await walletRepo.findById(walletId);

      if (!foundWallet) {
        console.log(chalk.red('\n❌ Wallet not found'));
        return;
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

        await walletRepo.delete(walletId);

        spinner.succeed('Wallet deleted');

        console.log(chalk.green('\n✅ Wallet deleted successfully'));
        console.log(chalk.dim(`ID: ${walletId}`));
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
