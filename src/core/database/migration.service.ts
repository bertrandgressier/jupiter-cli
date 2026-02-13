import { execSync } from 'child_process';

export class MigrationService {
  private static migrationsRun = false;

  static runMigrations(databaseUrl: string): boolean {
    if (MigrationService.migrationsRun) {
      return false;
    }

    try {
      execSync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      MigrationService.migrationsRun = true;
      return true;
    } catch {
      return false;
    }
  }

  static reset(): void {
    MigrationService.migrationsRun = false;
  }

  static hasRunMigrations(): boolean {
    return MigrationService.migrationsRun;
  }
}
