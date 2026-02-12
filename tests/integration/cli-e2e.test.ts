import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('CLI End-to-End Tests', () => {
  const testDataDir = path.join(__dirname, 'fixtures', 'e2e-test-data');
  const cliPath = path.join(__dirname, '..', '..', 'dist', 'index.js');
  const testPassword = 'test-password-12345';
  const testApiKey = 'test-api-key-for-jupiter';

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    if (!fs.existsSync(cliPath)) {
      throw new Error('CLI not built. Run: npm run build');
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const runCLI = (args: string, dataDir: string = testDataDir): string => {
    try {
      return execSync(`node ${cliPath} --data-dir ${dataDir} ${args}`, {
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, NODE_ENV: 'test' },
      });
    } catch (error: unknown) {
      const execError = error as { stdout?: string; message: string };
      return execError.stdout || execError.message;
    }
  };

  describe('Init Command', () => {
    it('should initialize the CLI', () => {
      const output = runCLI(`init --password ${testPassword} --jupiter-key ${testApiKey}`);

      expect(output).toContain('Setup complete');
      expect(fs.existsSync(testDataDir)).toBe(true);
      expect(fs.existsSync(path.join(testDataDir, 'config.yaml'))).toBe(true);
    });

    it('should show already initialized message on second init', () => {
      const output = runCLI('init --password test-password');

      expect(output).toContain('already initialized');
    });
  });

  describe('Config Commands', () => {
    it('should show configuration', () => {
      const output = runCLI('config show');

      expect(output).toContain('Configuration');
      expect(output).toContain('Jupiter API');
      expect(output).toContain('Solana');
    });

    it('should update log level', () => {
      const output = runCLI('config set-log-level debug');

      expect(output).toContain('Log level updated');

      const configShow = runCLI('config show');
      expect(configShow).toContain('debug');
    });

    it('should update Jupiter API key', () => {
      const newKey = 'new-api-key-67890';
      const output = runCLI(`config set-jupiter-key --key ${newKey}`);

      expect(output).toContain('API key configured');
    });
  });

  describe('Wallet Commands', () => {
    it('should create a wallet', () => {
      const output = runCLI(`wallet create --name "Test Wallet" --password ${testPassword}`);

      expect(output).toContain('New wallet created');
      expect(output).toContain('Test Wallet');
    });

    it('should list wallets', () => {
      const output = runCLI('wallet list');

      expect(output).toContain('Wallets');
      expect(output).toContain('Test Wallet');
    });

    it('should show error when not initialized', () => {
      const newDir = path.join(__dirname, 'fixtures', 'uninitialized-e2e');

      try {
        execSync(`node ${cliPath} --data-dir ${newDir} wallet list`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        (expect as unknown as { fail: (msg: string) => void }).fail('Should have thrown an error');
      } catch (error: unknown) {
        const execError = error as { stdout?: string; message: string };
        expect(execError.stdout || execError.message).toContain('Please run: jupiter init');
      } finally {
        if (fs.existsSync(newDir)) {
          fs.rmSync(newDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('Price Commands (with mocked API)', () => {
    it('should require API key for price command', () => {
      const noKeyDir = path.join(__dirname, 'fixtures', 'no-api-key-e2e');

      if (fs.existsSync(noKeyDir)) {
        fs.rmSync(noKeyDir, { recursive: true, force: true });
      }

      runCLI(`init --password ${testPassword}`, noKeyDir);

      const output = runCLI(`price get SOL`, noKeyDir);
      expect(output).toContain('Price commands require a Jupiter API key');

      if (fs.existsSync(noKeyDir)) {
        fs.rmSync(noKeyDir, { recursive: true, force: true });
      }
    });
  });

  describe('Version and Help', () => {
    it('should show version', () => {
      const output = runCLI('--version');

      expect(output).toContain('1.0.0');
    });

    it('should show help', () => {
      const output = runCLI('--help');

      expect(output).toContain('Usage:');
      expect(output).toContain('Commands:');
      expect(output).toContain('init');
      expect(output).toContain('wallet');
      expect(output).toContain('config');
    });
  });
});
