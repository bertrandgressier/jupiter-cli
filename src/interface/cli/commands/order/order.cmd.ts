import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { TriggerApiService } from '../../../../infrastructure/jupiter-api/trigger/trigger-api.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { PrismaTokenInfoRepository } from '../../../../infrastructure/repositories/prisma-token-info.repository';
import { WalletResolverService } from '../../../../application/services/wallet/wallet-resolver.service';
import { TokenInfoService } from '../../../../application/services/token-info.service';
import { OrderSyncService } from '../../../../application/services/order/order-sync.service';
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

        // Note: Trade recording happens via 'order sync' when the order is filled,
        // not when it's created. Limit orders are pending until matched.

        spinner.stop();

        console.log(chalk.green('\n✅ Limit order created!\n'));
        console.log(`  Order ID: ${orderResponse.order || orderResponse.orderId}`);
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
        const walletResolver = new WalletResolverService(walletRepo);
        const tokenInfoService = new TokenInfoService(tokenInfoRepo, ultraApi);

        const priceProvider = {
          getPrice: async (mints: string[]) => ultraApi.getPrice(mints),
        };

        const orderSyncService = new OrderSyncService(triggerApi, priceProvider, tokenInfoService);

        const wallet = await walletResolver.resolve(options.wallet);
        console.log(chalk.dim(`\nWallet: ${wallet.name}\n`));

        if (options.history) {
          const response = await triggerApi.getOrders(wallet.address, 'history');

          if (response.orders.length === 0) {
            console.log(chalk.yellow('No order history found.'));
            return;
          }

          // Fetch token info for all mints
          const mints = new Set<string>();
          response.orders.forEach((ord) => {
            mints.add(ord.inputMint);
            mints.add(ord.outputMint);
          });
          const tokenInfoMap = await tokenInfoService.getTokenInfoBatch(Array.from(mints));

          console.log(chalk.bold(`\n📋 Order History (${response.orders.length})\n`));
          console.log(
            `${chalk.gray('Date').padEnd(12)} ${chalk.gray('Status').padEnd(10)} ${chalk.gray('Input').padEnd(25)} ${chalk.gray('→').padEnd(4)} ${chalk.gray('Output').padEnd(25)} ${chalk.gray('Value')}`
          );
          console.log(chalk.gray('─'.repeat(110)));

          for (const ord of response.orders) {
            const status =
              ord.status === 'filled' || ord.status === 'Completed'
                ? chalk.green('✓'.padEnd(10))
                : ord.status === 'cancelled'
                  ? chalk.red('✗ Cancel'.padEnd(10))
                  : chalk.yellow(ord.status.padEnd(10));
            const date = new Date(ord.createdAt);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;

            const inputInfo = tokenInfoMap.get(ord.inputMint);
            const outputInfo = tokenInfoMap.get(ord.outputMint);
            const inputDecimals = inputInfo?.decimals ?? 9;
            const outputDecimals = outputInfo?.decimals ?? 6;

            const inputAmount = parseFloat(ord.makingAmount) / Math.pow(10, inputDecimals);
            const outputAmount = parseFloat(ord.takingAmount) / Math.pow(10, outputDecimals);

            const inputSymbol = inputInfo?.symbol || ord.inputMint.slice(0, 6) + '...';
            const outputSymbol = outputInfo?.symbol || ord.outputMint.slice(0, 6) + '...';

            const formattedInput =
              inputAmount < 0.001
                ? inputAmount.toExponential(2)
                : inputAmount < 1
                  ? inputAmount.toFixed(6)
                  : inputAmount.toFixed(4);
            const formattedOutput =
              outputAmount < 0.001
                ? outputAmount.toExponential(2)
                : outputAmount < 1
                  ? outputAmount.toFixed(6)
                  : outputAmount.toFixed(4);

            const inputStr = `${formattedInput} ${inputSymbol}`.padEnd(25);
            const outputStr = `${formattedOutput} ${outputSymbol}`.padEnd(25);

            // Show executed value for completed orders
            let valueStr = '';
            if (ord.status === 'filled' || ord.status === 'Completed') {
              valueStr = chalk.green('$' + (outputAmount * 1).toFixed(2)); // Simplified, ideally fetch current price
            }

            console.log(
              `${dateStr.padEnd(12)} ${status} ${inputStr} ${'→'.padEnd(4)} ${outputStr} ${valueStr}`
            );
          }
        } else {
          const orders = await orderSyncService.getActiveOrdersWithPrices(wallet.address);

          if (orders.length === 0) {
            console.log(chalk.yellow('No active limit orders.'));
            return;
          }

          // Calculate total blocked value
          const totalBlocked = orders.reduce((sum, ord) => sum + ord.inputUsdValue, 0);

          console.log(chalk.bold(`\n⏳ Active Limit Orders (${orders.length})`));
          console.log(chalk.dim(`💰 Total blocked: $${totalBlocked.toFixed(2)}\n`));

          console.log(
            `${chalk.gray('Token').padEnd(12)} ${chalk.gray('Amount').padEnd(18)} ${chalk.gray('Target').padEnd(12)} ${chalk.gray('Current').padEnd(12)} ${chalk.gray('Diff').padEnd(12)} ${chalk.gray('Created')}`
          );
          console.log(chalk.gray('─'.repeat(90)));

          for (const ord of orders) {
            const inputSymbol =
              ord.inputSymbol || (ord.inputMint ? ord.inputMint.slice(0, 8) + '...' : '???');
            const inputAmount = parseFloat(ord.inputAmount);
            // Format small numbers nicely
            const formattedAmount =
              inputAmount < 0.001
                ? inputAmount.toExponential(2)
                : inputAmount < 1
                  ? inputAmount.toFixed(6)
                  : inputAmount.toFixed(4);
            const tokenStr = `${inputSymbol.padEnd(12)} ${formattedAmount.padEnd(18)}`;
            const target = `$${ord.targetPrice < 1000 ? ord.targetPrice.toFixed(2) : ord.targetPrice.toExponential(2)}`;
            const current = `$${ord.currentPrice < 1000 ? ord.currentPrice.toFixed(2) : ord.currentPrice.toExponential(2)}`;
            const diffStr =
              ord.diffPercent >= 0
                ? chalk.green(`+${ord.diffPercent.toFixed(0)}%`)
                : chalk.red(`${ord.diffPercent.toFixed(0)}%`);
            const created = (Date.now() - ord.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const createdStr = created < 1 ? '<1d' : `${Math.floor(created)}d`;

            console.log(
              `${tokenStr} ${target.padEnd(12)} ${current.padEnd(12)} ${diffStr.padEnd(12)} ${createdStr}`
            );
          }
        }
      } catch (error) {
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

          const orderIds = response.orders
            .map((o) => o.orderKey || o.id || o.orderId || '')
            .filter(Boolean);
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
