import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { TriggerApiService } from '../../../../infrastructure/jupiter-api/trigger/trigger-api.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { PrismaTradeRepository } from '../../../../infrastructure/repositories/prisma-trade.repository';
import { WalletResolverService } from '../../../../application/services/wallet/wallet-resolver.service';
import { TokenInfoService } from '../../../../application/services/token-info.service';
import { OrderSyncService } from '../../../../application/services/order/order-sync.service';
import { TradeService } from '../../../../application/services/trade/trade.service';
import { SessionService } from '../../../../core/session/session.service';
import { MasterPasswordService } from '../../../../application/services/security/master-password.service';
import { keyEncryptionService } from '../../../../application/services/security/key-encryption.service';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';

function checkJupiterApiKey(dataDir: string | undefined): boolean {
  const configService = ConfigurationService.getInstance(dataDir);
  return !!configService.getConfig().jupiter.apiKey;
}

export function createOrderCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const order = new Command('order').description('Manage limit orders');

  const triggerApi = new TriggerApiService();
  const ultraApi = new UltraApiService();

  order
    .command('create')
    .description('Create a limit order')
    .argument('<inputToken>', 'Input token (what you sell)')
    .argument('<outputToken>', 'Output token (what you receive)')
    .argument('<amount>', 'Amount of input token')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier')
    .requiredOption('--target <price>', 'Target price per unit of input token')
    .option('--expiry <seconds>', 'Order expiry in seconds')
    .option('-p, --password <password>', 'Master password')
    .option('-y, --yes', 'Skip confirmation')
    .hook('preAction', () => {
      if (!checkJupiterApiKey(getDataDir())) {
        console.error(chalk.red('\n❌ Jupiter API key required for limit orders.\n'));
        process.exit(1);
      }
    })
    .action(async (inputToken, outputToken, amount, options) => {
      const spinner = ora();

      try {
        const prisma = getPrisma();
        const dataDir = getDataDir();
        const walletRepo = new PrismaWalletRepository(prisma);
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);
        const sessionService = new SessionService(prisma, dataDir);
        const masterPasswordService = new MasterPasswordService(prisma);

        const wallet = await walletResolver.resolve(options.wallet);
        console.log(chalk.dim(`\nWallet: ${wallet.name}\n`));

        spinner.start('Resolving tokens...');
        const [input, output] = await Promise.all([
          tokenInfoService.resolveToken(inputToken),
          tokenInfoService.resolveToken(outputToken),
        ]);
        spinner.stop();

        const inputAmount = parseFloat(amount);
        const targetPrice = parseFloat(options.target);
        const outputAmount = inputAmount * targetPrice;

        const makingAmount = Math.floor(inputAmount * Math.pow(10, input.decimals)).toString();
        const takingAmount = Math.floor(outputAmount * Math.pow(10, output.decimals)).toString();

        console.log(chalk.bold('📊 Limit Order\n'));
        console.log(`  Sell: ${chalk.cyan(`${amount} ${input.symbol}`)}`);
        console.log(`  Receive: ${chalk.green(`${outputAmount.toFixed(6)} ${output.symbol}`)}`);
        console.log(`  Target Price: ${chalk.yellow(`$${targetPrice} per ${input.symbol}`)}`);
        console.log();

        let confirm = options.yes;
        if (!confirm) {
          const answer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Create this limit order?',
              default: false,
            },
          ]);
          confirm = answer.confirm;
        }

        if (!confirm) {
          console.log(chalk.dim('Order cancelled.'));
          return;
        }

        spinner.start('Creating order...');

        const orderResponse = await triggerApi.createOrder({
          maker: wallet.address,
          makingAmount,
          takingAmount,
          inputMint: input.mint,
          outputMint: output.mint,
          expiredAt: options.expiry
            ? Math.floor(Date.now() / 1000) + parseInt(options.expiry)
            : undefined,
        });

        spinner.text = 'Signing transaction...';

        let sessionKey = await sessionService.getSessionKey();
        if (!sessionKey) {
          if (options.password) {
            sessionKey = await masterPasswordService.getSessionKeyWithPassword(options.password);
          } else {
            spinner.stop();
            const answer = await inquirer.prompt([
              {
                type: 'password',
                name: 'password',
                message: 'Enter master password:',
                mask: '*',
              },
            ]);
            spinner.start('Signing transaction...');
            sessionKey = await masterPasswordService.getSessionKeyWithPassword(answer.password);
          }
        }

        const privateKeyBase58 = await keyEncryptionService.decryptPrivateKey(
          wallet.encryptedKey,
          wallet.keyNonce,
          wallet.keySalt,
          wallet.keyAuthTag,
          sessionKey
        );

        const txBuffer = Buffer.from(orderResponse.transaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);
        const privateKeyBytes = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        transaction.sign([keypair]);
        privateKeyBytes.fill(0);

        const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

        spinner.text = 'Executing...';

        const result = await triggerApi.execute(signedTransaction, orderResponse.requestId);

        if (result.signature) {
          try {
            const tradeRepo = new PrismaTradeRepository(prisma);
            const priceProvider = {
              getPrice: async (mints: string[]) => ultraApi.getPrice(mints),
            };
            const tradeService = new TradeService(tradeRepo, priceProvider);

            await tradeService.recordLimitOrderFill({
              walletId: wallet.id,
              inputMint: input.mint,
              outputMint: output.mint,
              inputAmount: amount,
              outputAmount: outputAmount.toFixed(6),
              inputSymbol: input.symbol,
              outputSymbol: output.symbol,
              signature: result.signature,
            });
          } catch {
            // Trade recording failed, but order succeeded - don't block user
          }
        }

        spinner.stop();

        console.log(chalk.green('\n✅ Limit order created!\n'));
        console.log(`  Order ID: ${orderResponse.orderId}`);
        if (result.signature) {
          console.log(`  Signature: ${chalk.dim(result.signature)}`);
        }
      } catch (error) {
        spinner.fail('Order creation failed');
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  order
    .command('list')
    .description('List limit orders')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier')
    .option('--history', 'Show filled/cancelled orders')
    .action(async (options) => {
      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tradeRepo = new PrismaTradeRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);

        const priceProvider = {
          getPrice: async (mints: string[]) => ultraApi.getPrice(mints),
        };

        const tradeService = new TradeService(tradeRepo, priceProvider);
        const orderSyncService = new OrderSyncService(
          triggerApi,
          tradeService,
          priceProvider,
          tokenInfoService
        );

        const wallet = await walletResolver.resolve(options.wallet);
        console.log(chalk.dim(`\nWallet: ${wallet.name}\n`));

        if (options.history) {
          const response = await triggerApi.getOrders(wallet.address, 'history');

          if (response.orders.length === 0) {
            console.log(chalk.yellow('No order history found.'));
            return;
          }

          const table = new Table({
            head: [
              chalk.gray('ID'),
              chalk.gray('Status'),
              chalk.gray('Created'),
              chalk.gray('Input'),
              chalk.gray('Output'),
            ],
            colWidths: [15, 12, 20, 20, 20],
          });

          for (const ord of response.orders) {
            const status =
              ord.status === 'filled' || ord.status === 'Completed'
                ? chalk.green(ord.status)
                : ord.status === 'cancelled'
                  ? chalk.red('Cancelled')
                  : chalk.yellow(ord.status);
            const date = new Date(ord.createdAt).toLocaleDateString();
            const orderId = (ord.orderKey || ord.id || ord.orderId || 'unknown')
              .toString()
              .slice(0, 15);
            const inputSymbol = ord.inputSymbol || 'tokens';
            const outputSymbol = ord.outputSymbol || 'tokens';
            table.push([
              orderId,
              status,
              date,
              `${ord.makingAmount} ${inputSymbol}`,
              `${ord.takingAmount} ${outputSymbol}`,
            ]);
          }

          console.log(table.toString());
        } else {
          const orders = await orderSyncService.getActiveOrdersWithPrices(wallet.address);

          if (orders.length === 0) {
            console.log(chalk.yellow('No active limit orders.'));
            return;
          }

          const table = new Table({
            head: [
              chalk.gray('Input'),
              chalk.gray('Output'),
              chalk.gray('Target'),
              chalk.gray('Current'),
              chalk.gray('Diff'),
            ],
            colWidths: [20, 20, 12, 12, 12],
          });

          for (const ord of orders) {
            const inputSymbol =
              ord.inputSymbol || (ord.inputMint ? ord.inputMint.slice(0, 8) : '???');
            const outputSymbol =
              ord.outputSymbol || (ord.outputMint ? ord.outputMint.slice(0, 8) : '???');
            const inputStr = `${ord.inputAmount} ${inputSymbol}`;
            const outputStr = `${ord.outputAmount} ${outputSymbol}`;
            const target = `$${ord.targetPrice.toFixed(2)}`;
            const current = `$${ord.currentPrice.toFixed(2)}`;
            const diff =
              ord.diffPercent >= 0
                ? chalk.green(
                    `+${ord.diffPercent.toFixed(1)}% ${ord.direction === 'up' ? '↑' : '↓'}`
                  )
                : chalk.red(`${ord.diffPercent.toFixed(1)}% ${ord.direction === 'up' ? '↑' : '↓'}`);

            table.push([inputStr, outputStr, target, current, diff]);
          }

          console.log(table.toString());
          console.log(chalk.dim(`\n${orders.length} active order(s)`));
        }
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  order
    .command('sync')
    .description('Sync filled limit orders as trades')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier')
    .action(async (options) => {
      const spinner = ora();

      try {
        const prisma = getPrisma();
        const walletRepo = new PrismaWalletRepository(prisma);
        const tokenInfoRepo = new PrismaTokenInfoRepository(prisma);
        const tradeRepo = new PrismaTradeRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);

        const priceProvider = {
          getPrice: async (mints: string[]) => ultraApi.getPrice(mints),
        };

        const tradeService = new TradeService(tradeRepo, priceProvider);
        const orderSyncService = new OrderSyncService(
          triggerApi,
          tradeService,
          priceProvider,
          tokenInfoService
        );

        const wallet = await walletResolver.resolve(options.wallet);

        spinner.start('Syncing filled orders...');

        const count = await orderSyncService.syncFilledOrders(wallet.id, wallet.address);

        spinner.stop();

        if (count === 0) {
          console.log(chalk.dim('No new filled orders to sync.'));
        } else {
          console.log(chalk.green(`\n✅ Synced ${count} new trade(s).\n`));
        }
      } catch (error) {
        spinner.fail('Sync failed');
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  order
    .command('cancel')
    .description('Cancel a limit order')
    .argument('[orderId]', 'Order ID to cancel (omit with --all to cancel all)')
    .requiredOption('-w, --wallet <identifier>', 'Wallet identifier')
    .option('--all', 'Cancel all active orders')
    .option('-p, --password <password>', 'Master password')
    .action(async (orderId, options) => {
      const spinner = ora();

      try {
        const prisma = getPrisma();
        const dataDir = getDataDir();
        const walletRepo = new PrismaWalletRepository(prisma);
        const walletResolver = new WalletResolverService(walletRepo);
        const sessionService = new SessionService(prisma, dataDir);
        const masterPasswordService = new MasterPasswordService(prisma);

        const wallet = await walletResolver.resolve(options.wallet);

        if (options.all) {
          spinner.start('Fetching active orders...');
          const response = await triggerApi.getOrders(wallet.address, 'active');

          if (response.orders.length === 0) {
            spinner.stop();
            console.log(chalk.yellow('No active orders to cancel.'));
            return;
          }

          const orderIds = response.orders.map((o) => o.id || o.orderId || '').filter(Boolean);
          spinner.text = `Cancelling ${orderIds.length} order(s)...`;

          const cancelResponse = await triggerApi.cancelOrders(wallet.address, orderIds);

          spinner.text = 'Signing transaction...';

          let sessionKey = await sessionService.getSessionKey();
          if (!sessionKey) {
            if (options.password) {
              sessionKey = await masterPasswordService.getSessionKeyWithPassword(options.password);
            } else {
              spinner.stop();
              const answer = await inquirer.prompt([
                {
                  type: 'password',
                  name: 'password',
                  message: 'Enter master password:',
                  mask: '*',
                },
              ]);
              spinner.start('Signing transaction...');
              sessionKey = await masterPasswordService.getSessionKeyWithPassword(answer.password);
            }
          }

          const privateKeyBase58 = await keyEncryptionService.decryptPrivateKey(
            wallet.encryptedKey,
            wallet.keyNonce,
            wallet.keySalt,
            wallet.keyAuthTag,
            sessionKey
          );

          for (const tx of cancelResponse.transactions) {
            const txBuffer = Buffer.from(tx, 'base64');
            const transaction = VersionedTransaction.deserialize(txBuffer);
            const privateKeyBytes = bs58.decode(privateKeyBase58);
            const keypair = Keypair.fromSecretKey(privateKeyBytes);
            transaction.sign([keypair]);
            privateKeyBytes.fill(0);

            const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            await triggerApi.execute(signedTransaction, cancelResponse.requestId);
          }

          spinner.stop();
          console.log(chalk.green(`\n✅ Cancelled ${orderIds.length} order(s).\n`));
        } else {
          if (!orderId) {
            console.error(chalk.red('❌ Order ID required (or use --all)'));
            process.exit(1);
          }

          spinner.start('Cancelling order...');

          const cancelResponse = await triggerApi.cancelOrder(wallet.address, orderId);

          spinner.text = 'Signing transaction...';

          let sessionKey = await sessionService.getSessionKey();
          if (!sessionKey) {
            if (options.password) {
              sessionKey = await masterPasswordService.getSessionKeyWithPassword(options.password);
            } else {
              spinner.stop();
              const answer = await inquirer.prompt([
                {
                  type: 'password',
                  name: 'password',
                  message: 'Enter master password:',
                  mask: '*',
                },
              ]);
              spinner.start('Signing transaction...');
              sessionKey = await masterPasswordService.getSessionKeyWithPassword(answer.password);
            }
          }

          const privateKeyBase58 = await keyEncryptionService.decryptPrivateKey(
            wallet.encryptedKey,
            wallet.keyNonce,
            wallet.keySalt,
            wallet.keyAuthTag,
            sessionKey
          );

          const txBuffer = Buffer.from(cancelResponse.transaction, 'base64');
          const transaction = VersionedTransaction.deserialize(txBuffer);
          const privateKeyBytes = bs58.decode(privateKeyBase58);
          const keypair = Keypair.fromSecretKey(privateKeyBytes);
          transaction.sign([keypair]);
          privateKeyBytes.fill(0);

          const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
          await triggerApi.execute(signedTransaction, cancelResponse.requestId);

          spinner.stop();
          console.log(chalk.green('\n✅ Order cancelled.\n'));
        }
      } catch (error) {
        spinner.fail('Cancel failed');
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return order;
}
