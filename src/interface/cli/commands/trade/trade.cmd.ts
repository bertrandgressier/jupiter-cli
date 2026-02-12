import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { UltraApiService } from '../../../../infrastructure/jupiter-api/ultra/ultra-api.service';
import { ConfigurationService } from '../../../../core/config/configuration.service';
import { MasterPasswordService } from '../../../../application/services/security/master-password.service';
import { keyEncryptionService } from '../../../../application/services/security/key-encryption.service';
import { WalletManagerService } from '../../../../application/services/wallet/wallet-manager.service';
import { PrismaWalletRepository } from '../../../../infrastructure/repositories/prisma-wallet.repository';
import { SessionService } from '../../../../core/session/session.service';

const TOKEN_MINTS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
};

function resolveToken(token: string): { mint: string; decimals: number } {
  const upper = token.toUpperCase();
  if (TOKEN_MINTS[upper]) {
    return TOKEN_MINTS[upper];
  }
  return { mint: token, decimals: 9 };
}

function checkJupiterApiKey(dataDir: string | undefined): boolean {
  const configService = new ConfigurationService(dataDir);
  return !!configService.getConfig().jupiter.apiKey;
}

export function createTradeCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const trade = new Command('trade').description('Execute trades on Jupiter');

  const ultraApi = new UltraApiService();

  trade
    .command('swap')
    .description('Swap tokens using Jupiter Ultra API')
    .argument('<inputToken>', 'Input token (SOL, USDC, USDT, JUP, BONK or mint address)')
    .argument('<outputToken>', 'Output token (SOL, USDC, USDT, JUP, BONK or mint address)')
    .argument('<amount>', 'Amount of input token to swap')
    .requiredOption('-w, --wallet <id>', 'Wallet ID to use for the swap')
    .option('-s, --slippage <bps>', 'Slippage tolerance in basis points', '100')
    .option('-p, --password <password>', 'Master password (optional if session exists)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Get quote without executing the swap')
    .hook('preAction', () => {
      if (!checkJupiterApiKey(getDataDir())) {
        console.error(chalk.red('\n❌ Jupiter API key not configured.\n'));
        console.log(chalk.dim('Trading commands require a Jupiter API key.'));
        console.log(chalk.dim('Get one at: https://portal.jup.ag/'));
        console.log(chalk.dim('Then run: jupiter config set-jupiter-key\n'));
        process.exit(1);
      }
    })
    .action(async (inputToken, outputToken, amount, options) => {
      const spinner = ora();

      try {
        const prisma = getPrisma();
        const dataDir = getDataDir();
        const walletRepo = new PrismaWalletRepository(prisma);
        const walletManager = new WalletManagerService(walletRepo);
        const sessionService = new SessionService(prisma, dataDir);
        const masterPasswordService = new MasterPasswordService(prisma);

        const wallet = await walletManager.getWallet(options.wallet);
        console.log(chalk.dim(`\nWallet: ${wallet.name} (${wallet.address.slice(0, 8)}...)\n`));

        const input = resolveToken(inputToken);
        const output = resolveToken(outputToken);
        const inputAmount = parseFloat(amount);
        const slippageBps = parseInt(options.slippage, 10);

        if (input.mint === output.mint) {
          console.error(chalk.red('❌ Input and output tokens must be different'));
          process.exit(1);
        }

        const inputDecimals = TOKEN_MINTS[inputToken.toUpperCase()]?.decimals ?? 9;
        const amountInSmallestUnit = Math.floor(
          inputAmount * Math.pow(10, inputDecimals)
        ).toString();

        spinner.start('Getting order from Jupiter Ultra...');
        const order = await ultraApi.getOrder(
          input.mint,
          output.mint,
          amountInSmallestUnit,
          wallet.address,
          slippageBps
        );
        spinner.stop();

        const outputAmount = parseFloat(order.outAmount) / Math.pow(10, output.decimals);
        const priceImpact = parseFloat(order.priceImpactPct);

        console.log(chalk.bold('📊 Order\n'));
        console.log(`  Input:  ${chalk.cyan(amount)} ${inputToken.toUpperCase()}`);
        console.log(
          `  Output: ${chalk.green(outputAmount.toFixed(6))} ${outputToken.toUpperCase()}`
        );
        console.log(
          `  Price Impact: ${
            priceImpact > 1
              ? chalk.red(priceImpact.toFixed(4) + '%')
              : chalk.dim(priceImpact.toFixed(4) + '%')
          }`
        );
        console.log(`  Slippage: ${order.slippageBps / 100}%`);
        if (order.routePlan && order.routePlan.length > 0) {
          console.log(`  Route: ${order.routePlan.map((r) => r.swapInfo.label).join(' → ')}`);
        }
        console.log();

        if (options.dryRun) {
          console.log(chalk.yellow('Dry run complete. No swap executed.'));
          return;
        }

        let confirm = options.yes;
        if (!confirm) {
          const answer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Confirm swap ${amount} ${inputToken.toUpperCase()} → ${outputAmount.toFixed(6)} ${outputToken.toUpperCase()}?`,
              default: false,
            },
          ]);
          confirm = answer.confirm;
        }

        if (!confirm) {
          console.log(chalk.dim('Swap cancelled.'));
          return;
        }

        spinner.start('Signing transaction...');

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
                message: 'Enter master password (no active session):',
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

        const txBuffer = Buffer.from(order.transaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);

        const privateKeyBytes = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        transaction.sign([keypair]);

        privateKeyBytes.fill(0);

        const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

        spinner.text = 'Executing swap via Jupiter Ultra...';

        const result = await ultraApi.executeOrder(signedTransaction, order.requestId);

        spinner.stop();

        if (result.status === 'Success' || result.status === 'Completed') {
          console.log(chalk.green('\n✅ Swap successful!\n'));
          console.log(`  Input:  ${amount} ${inputToken.toUpperCase()}`);
          console.log(`  Output: ${outputAmount.toFixed(6)} ${outputToken.toUpperCase()}`);
          console.log(`  Signature: ${chalk.dim(result.signature)}`);
          console.log(chalk.dim(`  https://solscan.io/tx/${result.signature}`));
        } else {
          console.log(chalk.yellow(`\n⚠️ Swap status: ${result.status}\n`));
          console.log(`  Signature: ${chalk.dim(result.signature)}`);
          console.log(chalk.dim(`  https://solscan.io/tx/${result.signature}`));
        }
      } catch (error) {
        spinner.fail('Swap failed');
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return trade;
}
