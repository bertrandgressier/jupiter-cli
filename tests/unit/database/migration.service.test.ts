import { execSync } from 'child_process';
import { MigrationService } from '../../../src/core/database/migration.service';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('MigrationService', () => {
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
  const testDatabaseUrl = 'file:./test.db';

  beforeEach(() => {
    jest.clearAllMocks();
    MigrationService.reset();
  });

  describe('runMigrations', () => {
    it('should run prisma migrate deploy with correct database URL', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      const result = MigrationService.runMigrations(testDatabaseUrl);

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('npx prisma migrate deploy', {
        env: expect.objectContaining({
          DATABASE_URL: testDatabaseUrl,
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should only run migrations once', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      MigrationService.runMigrations(testDatabaseUrl);
      MigrationService.runMigrations(testDatabaseUrl);
      MigrationService.runMigrations(testDatabaseUrl);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('should return true on successful migration', () => {
      mockExecSync.mockReturnValue(Buffer.from('Migration applied'));

      const result = MigrationService.runMigrations(testDatabaseUrl);

      expect(result).toBe(true);
    });

    it('should return false when migration fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Migration failed');
      });

      const result = MigrationService.runMigrations(testDatabaseUrl);

      expect(result).toBe(false);
    });

    it('should not throw on migration failure', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Migration failed');
      });

      expect(() => MigrationService.runMigrations(testDatabaseUrl)).not.toThrow();
    });
  });

  describe('hasRunMigrations', () => {
    it('should return false before migrations run', () => {
      expect(MigrationService.hasRunMigrations()).toBe(false);
    });

    it('should return true after successful migration', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      MigrationService.runMigrations(testDatabaseUrl);

      expect(MigrationService.hasRunMigrations()).toBe(true);
    });

    it('should return false after failed migration', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Migration failed');
      });

      MigrationService.runMigrations(testDatabaseUrl);

      expect(MigrationService.hasRunMigrations()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should allow migrations to run again after reset', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      MigrationService.runMigrations(testDatabaseUrl);
      expect(mockExecSync).toHaveBeenCalledTimes(1);

      MigrationService.reset();

      MigrationService.runMigrations(testDatabaseUrl);
      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });
  });
});
