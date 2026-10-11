import { rollbackMigrations, runMigrations } from "@veap/database";
import type { IMigrationRunner } from "./contracts";

/**
 * `IMigrationRunner` adapter delegating to the knex-based migration runner.
 */
export class KnexMigrationRunner implements IMigrationRunner {
  run(scope: string, migrations: any[]): Promise<void> {
    return runMigrations(scope, migrations);
  }

  rollback(scope: string, migrations: any[]): Promise<void> {
    return rollbackMigrations(scope, migrations);
  }
}
