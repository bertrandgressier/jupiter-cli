import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectConfigurationService, PathManager } from '../../../../core/config';
import { ConfigurationService } from '../../../../core/config/configuration.service';
import { MasterPasswordService } from '../../../../application/services/security/master-password.service';
import { SessionService } from '../../../../core/session/session.service';

export function createInitCommand(getDataDir: () => string | undefined): Command {
  const command = new Command('init')
    .description('Initialize Jupiter CLI with master password')
    .option('-f, --force', 'Force reinitialization if already exists')
    .option('-p, --password <password>', 'Master password (non-interactive mode)')
    .option('--jupiter-key <key>', 'Jupiter API key (optional)')
    .action(async (options) => {
      const dataDir = getDataDir();
      const pathManager = new PathManager(dataDir);

      if (pathManager.isInitialized() && !options.force) {
        console.log(chalk.yellow(`\n⚠️  Jupiter CLI is already initialized at:`));
        console.log(chalk.dim(`   ${pathManager.getDataDir()}`));
        console.log(chalk.dim('\n   Use --force to reinitialize or delete the directory.'));
        return;
      }

      console.log(chalk.bold('\n🔧 Jupiter CLI Initialization\n'));

      if (dataDir) {
        console.log(chalk.dim(`Data directory: ${pathManager.getDataDir()}\n`));
      } else {
        console.log(chalk.dim(`Using default data directory: ${pathManager.getDataDir()}\n`));
      }

      try {
        let password = options.password;
        let jupiterKey = options.jupiterKey;

        if (!password) {
          const answers = await inquirer.prompt([
            {
              type: 'password',
              name: 'password',
              message: 'Set your master password:',
              mask: '*',
              validate: (input: string) => {
                if (input.length < 8) {
                  return 'Password must be at least 8 characters long';
                }
                return true;
              },
            },
            {
              type: 'password',
              name: 'confirmPassword',
              message: 'Confirm your master password:',
              mask: '*',
            },
            {
              type: 'confirm',
              name: 'hasJupiterKey',
              message: 'Do you have a Jupiter API key? (optional, required for trading)',
              default: false,
            },
            {
              type: 'password',
              name: 'jupiterKey',
              message: 'Enter your Jupiter API key:',
              mask: '*',
              when: (answers) => answers.hasJupiterKey,
              validate: (input: string) => {
                if (!input || input.trim() === '') {
                  return 'API key cannot be empty';
                }
                return true;
              },
            },
          ]);

          if (answers.password !== answers.confirmPassword) {
            console.log(chalk.red('\n❌ Passwords do not match'));
            return;
          }

          password = answers.password;
          jupiterKey = answers.jupiterKey;
        }

        if (password.length < 8) {
          console.log(chalk.red('\n❌ Password must be at least 8 characters long'));
          return;
        }

        console.log('\n⏳ Initializing Jupiter CLI...\n');

        const projectConfig = new ProjectConfigurationService(dataDir);
        const prisma = projectConfig.createPrismaClient();
        const masterPasswordService = new MasterPasswordService(prisma);

        await projectConfig.initialize(password, masterPasswordService, {
          skipIfExists: false,
          force: options.force,
        });

        const sessionService = new SessionService(prisma, dataDir);
        await sessionService.generateSessionKey(password);
        console.log(chalk.green('✓ Session key generated'));

        await prisma.$disconnect();

        if (jupiterKey) {
          const configService = new ConfigurationService(dataDir);
          const cfg = configService.getConfig();
          cfg.jupiter.apiKey = jupiterKey.trim();
          configService.saveConfiguration();
          console.log(chalk.green('✓ Jupiter API key configured'));
        }

        console.log(chalk.green('\n✅ Setup complete!'));
        console.log(chalk.dim(`\nData location: ${pathManager.getDataDir()}`));
        console.log(chalk.dim('Configuration: config.yaml'));
        console.log(chalk.dim('Database: data/jupiter.db'));
        console.log(chalk.dim('Session: session/key'));

        if (!jupiterKey) {
          console.log(chalk.yellow('\n⚠️  No Jupiter API key configured.'));
          console.log(chalk.dim('Trading commands require an API key.'));
          console.log(chalk.dim('Get one at: https://portal.jup.ag/'));
          console.log(chalk.dim('Then run: jupiter config set-jupiter-key'));
        }

        console.log(chalk.dim('\nYou can now:'));
        console.log(chalk.dim('  - Create wallets: jupiter wallet create'));
        console.log(chalk.dim('  - Import wallets: jupiter wallet import'));
        console.log(chalk.dim('  - View config:    jupiter config show'));
        console.log(chalk.dim('  - Check session:  jupiter session status'));

        console.log(chalk.cyan('\n🔐 Session Info:'));
        console.log(chalk.dim('The agent can operate autonomously with the session.'));
        console.log(
          chalk.dim('Protected commands (wallet export, delete, transfer) require password.')
        );

        if (dataDir) {
          console.log(chalk.dim(`\n⚠️  Remember to use --data-dir ${dataDir} for all commands`));
        }
      } catch (error) {
        console.error(
          chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });

  return command;
}
