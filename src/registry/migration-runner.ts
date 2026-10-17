import { rollbackMigrations, runMigrations } from "@veap/database";
import type { IMigrationRunner } from "./contracts.js";

/**
 * `IMigrationRunner` adapter delegating to the knex-based migration runner.
 */
export class KnexMigrationRunner implements IMigrationRunner {
  // The knex runner reports the batch it applied; the port only promises that
  // the run finished, so the summary is dropped here on purpose.
  async run(scope: string, migrations: any[]): Promise<void> {
    await runMigrations(scope, migrations);
  }

  // Same here: the runner reports what it undid, the port stays `void`.
  async rollback(scope: string, migrations: any[]): Promise<void> {
    await rollbackMigrations(scope, migrations);
  }
}
