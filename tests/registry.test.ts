import type { IEventBus, ILogger } from "@veap/kernel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlugin } from "../src/common";
import { bindPluginsContext } from "../src/common";
import type {
  IMigrationRunner,
  IPluginRepository,
  PluginRecord,
} from "../src/registry";
import { applyPluginFilters, PluginRegistry } from "../src/registry";

class InMemoryPluginRepository implements IPluginRepository {
  public records = new Map<string, PluginRecord>();

  async findAll(): Promise<PluginRecord[]> {
    return Array.from(this.records.values());
  }

  async findById(id: string): Promise<PluginRecord | null> {
    return this.records.get(id) ?? null;
  }

  async seed(
    values: Array<{
      id: string;
      enabled: boolean;
      installed: boolean;
      system: boolean;
    }>,
  ): Promise<void> {
    for (const val of values) {
      if (!this.records.has(val.id)) {
        this.records.set(val.id, {
          id: val.id,
          enabled: true,
          installed: true,
          system: val.system,
        });
      }
    }
  }

  async upsertStatus(
    id: string,
    data: {
      enabled?: boolean;
      config?: Record<string, any>;
      installedVersion?: string;
    },
  ): Promise<PluginRecord> {
    const existing = this.records.get(id) ?? {
      id,
      enabled: true,
      config: {},
      installedVersion: "0.1.0",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updated: PluginRecord = {
      ...existing,
      enabled: data.enabled ?? existing.enabled,
      config: data.config ?? existing.config,
      installedVersion: data.installedVersion ?? existing.installedVersion,
      updated_at: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async setEnabled(id: string, enabled: boolean): Promise<PluginRecord> {
    return this.upsertStatus(id, { enabled });
  }

  async updateConfig(
    id: string,
    config: Record<string, any>,
  ): Promise<PluginRecord> {
    return this.upsertStatus(id, { config });
  }
}

class NoopMigrationRunner implements IMigrationRunner {
  async runMigrations(
    _pluginId: string,
    _migrations: any[],
    _direction: "up" | "down" = "up",
  ): Promise<void> {}
}

const mockLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as ILogger;

const mockEventBus: IEventBus = {
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
} as unknown as IEventBus;

describe("PluginRegistry", () => {
  let repository: InMemoryPluginRepository;
  let runner: NoopMigrationRunner;
  let registry: PluginRegistry;

  beforeEach(() => {
    repository = new InMemoryPluginRepository();
    runner = new NoopMigrationRunner();
    registry = new PluginRegistry(repository, runner, mockLogger, mockEventBus);
  });

  it("registers and enables plugins by default", async () => {
    const plugin: IPlugin = {
      manifest: {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        description: "Test",
      },
    };

    registry.register(plugin);
    await registry.init();

    const enabled = registry.getEnabledPlugins();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].manifest.id).toBe("test-plugin");
  });

  it("disables a plugin and updates repository", async () => {
    const plugin: IPlugin = {
      manifest: {
        id: "toggle-plugin",
        name: "Toggle Plugin",
        version: "1.0.0",
        description: "Toggle",
      },
    };

    registry.register(plugin);
    await registry.init();

    await registry.togglePlugin("toggle-plugin", false);

    const enabled = registry.getEnabledPlugins();
    expect(enabled).toHaveLength(0);

    const record = await repository.findById("toggle-plugin");
    expect(record?.enabled).toBe(false);
  });

  it("resolves extensions from enabled plugins", async () => {
    const dummyComponent = () => "Dummy";
    const plugin: IPlugin = {
      manifest: {
        id: "ext-plugin",
        name: "Ext Plugin",
        version: "1.0.0",
        description: "Ext",
      },
      extensions: [
        {
          id: "header-button",
          target: "core",
          point: "header",
          component: dummyComponent as any,
        },
      ],
    };

    registry.register(plugin);
    await registry.init();

    const extensions = await registry.getExtensions("core", "header");
    expect(extensions).toHaveLength(1);
    expect(extensions[0].id).toBe("header-button");
  });

  it("applies filters through plugin hooks", async () => {
    const plugin: IPlugin = {
      manifest: {
        id: "hook-plugin",
        name: "Hook Plugin",
        version: "1.0.0",
        description: "Hook",
      },
      hooks: [
        {
          point: "filter:title",
          callback: async (val: string) => `${val} - Filtered`,
        },
      ],
    };

    registry.register(plugin);
    await registry.init();

    bindPluginsContext({
      registry,
      navigation: {} as any,
    });

    const result = await applyPluginFilters("filter:title", "Initial");
    expect(result).toBe("Initial - Filtered");
  });
});
