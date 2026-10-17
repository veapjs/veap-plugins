import type { IPlugin } from "../common/index.js";

/**
 * Persisted status of a plugin (mirrors the `plugins` table).
 */
export interface PluginStatusRecord {
  id: string;
  enabled: boolean;
  installed: boolean;
  system: boolean;
  /** Raw JSON string of the plugin config, or `null`. */
  config?: string | null;
  lastStep?: string | null;
}

/**
 * Backwards compatibility alias for PluginStatusRecord.
 */
export type PluginRecord = PluginStatusRecord;

/**
 * In-memory status overlay kept by the registry between DB syncs.
 */
export interface PluginRuntimeStatus {
  enabled: boolean;
  installed: boolean;
  lastStep?: string | null;
}

/** Payload used when a plugin row does not exist yet and must be created. */
export interface UpsertPluginStatusRecord {
  enabled?: boolean;
  installed?: boolean;
  lastStep?: string | null;
}

/**
 * Plugin status persistence port.
 */
export interface IPluginRepository {
  /** Returns all persisted plugin statuses. */
  findAll(): Promise<PluginStatusRecord[]>;

  /** Returns the persisted status of a single plugin, or `null`. */
  findById(id: string): Promise<PluginStatusRecord | null>;

  /**
   * Bulk-seeds statuses for newly registered plugins.
   * Existing rows are left alone except that `system` is re-merged.
   */
  seed(
    values: Array<{
      id: string;
      enabled: boolean;
      installed: boolean;
      system: boolean;
    }>,
  ): Promise<void>;

  /**
   * Updates the status of a plugin, creating the row if it does not exist.
   * `system` of the new row is taken from the registered plugin manifest.
   */
  upsertStatus(
    id: string,
    update: UpsertPluginStatusRecord,
    defaults: { system: boolean },
  ): Promise<void>;

  /** Stores the raw JSON plugin config. */
  updateConfig(id: string, configJson: string): Promise<void>;
}

/** Injection token for the plugin repository port. */
export const PLUGIN_REPOSITORY = Symbol.for("veap:plugins:repository");

/**
 * Migration runner port.
 */
export interface IMigrationRunner {
  run(scope: string, migrations: any[]): Promise<void>;
  rollback(scope: string, migrations: any[]): Promise<void>;
}

/** Injection token for the migration runner port. */
export const MIGRATION_RUNNER = Symbol.for("veap:plugins:migration-runner");

/** Convenience type re-export so consumers can name the contract. */
export type { IPlugin };
