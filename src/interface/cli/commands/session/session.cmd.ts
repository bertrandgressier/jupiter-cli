import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { PrismaClient } from '@prisma/client';
import { SessionService } from '../../../../core/session/session.service';

export function createSessionCommands(
  getPrisma: () => PrismaClient,
  getDataDir: () => string | undefined
): Command {
  const session = new Command('session').description('Manage session for agent operations');

  session
    .command('status')
    .description('Show session status')
    .action(async () => {
      try {
        const prisma = getPrisma();
        const sessionService = new SessionService(prisma, getDataDir());

        const info = await sessionService.getSessionInfo();

        if (!info.exists) {
          console.log(chalk.yellow('\n⚠️ No active session'));
          console.log(chalk.dim('Run `jupiter init` to create a session.'));
          return;
        }

        console.log(chalk.bold('\n🔐 Session Status\n'));
        console.log(`  Status: ${chalk.green('Active')}`);
        console.log(`  Created: ${info.createdAt?.toLocaleString() || 'Unknown'}`);
        console.log(`  Wallets: ${info.walletCount}`);
        console.log();
        console.log(chalk.dim('The session allows the agent to:'));
        console.log(chalk.dim('  - View wallets and balances'));
        console.log(chalk.dim('  - Get token prices'));
        console.log(chalk.dim('  - Execute swaps'));
        console.log();
        console.log(chalk.yellow('Protected operations (require password):'));
        console.log(chalk.dim('  - wallet export'));
        console.log(chalk.dim('  - wallet delete'));
        console.log(chalk.dim('  - transfer'));
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  session
    .command('regenerate')
    .description('Regenerate session key (requires password)')
    .option('-p, --password <password>', 'Master password')
    .action(async (options) => {
      try {
        const prisma = getPrisma();
        const sessionService = new SessionService(prisma, getDataDir());

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

        console.log(chalk.dim('\nRegenerating session...'));

        await sessionService.regenerateSession(password);

        console.log(chalk.green('\n✅ Session regenerated successfully'));
        console.log(chalk.yellow('\n⚠️  Previous session is now invalid.'));
        console.log(chalk.dim('Update JUPITER_SESSION on your agent if exported.'));
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  session
    .command('clear')
    .description('Clear the current session')
    .action(async () => {
      try {
        const prisma = getPrisma();
        const sessionService = new SessionService(prisma, getDataDir());

        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Clear the session? The agent will not be able to operate until regenerated.',
            default: false,
          },
        ]);

        if (!confirm) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }

        await sessionService.clearSession();

        console.log(chalk.green('\n✅ Session cleared'));
        console.log(chalk.dim('Run `jupiter session regenerate` to create a new session.'));
      } catch (error) {
        console.error(
          chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return session;
}
