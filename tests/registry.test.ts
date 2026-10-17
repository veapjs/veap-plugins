import { Container, type IEventBus, type ILogger, Inject } from "@veap/kernel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlugin } from "../src/common";
import {
  bindPluginsContext,
  EXTENSION_SERVICE,
  MENU_SERVICE,
  WIDGET_SERVICE,
} from "../src/common";
import { MenuService } from "../src/navigation";
import type {
  IMigrationRunner,
  IPluginRepository,
  PluginRecord,
} from "../src/registry";
import { applyPluginFilters, PluginRegistry } from "../src/registry";
import { ExtensionService, WidgetService } from "../src/widgets";

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

  it("registers extensions via ExtensionService injected into plugin.init() and clears them when disabled", async () => {
    const ioc = new Container();
    const customRegistry = new PluginRegistry(
      repository,
      runner,
      mockLogger,
      mockEventBus,
      ioc,
    );
    const extensionService = new ExtensionService(customRegistry);

    ioc.register({
      token: ExtensionService,
      useValue: extensionService,
      singleton: true,
    });
    ioc.register({
      token: EXTENSION_SERVICE,
      useValue: extensionService,
      singleton: true,
    });

    const dummyComponent = () => "Dummy";
    const adminComponent = () => "AdminButton";

    class ExtPlugin implements IPlugin {
      manifest = {
        id: "ext-plugin",
        name: "Ext Plugin",
        version: "1.0.0",
        description: "Ext",
      };

      async init(
        @Inject(ExtensionService) extensions: ExtensionService,
      ): Promise<void> {
        extensions.register([
          {
            id: "admin-header-button",
            target: "core",
            point: "header",
            component: adminComponent as any,
            priority: 20,
            roles: ["admin"],
          },
          {
            id: "header-button",
            target: "core",
            point: "header",
            component: dummyComponent as any,
            priority: 5,
          },
        ]);
      }
    }

    customRegistry.register(new ExtPlugin());
    await customRegistry.init();

    expect(await customRegistry.hasExtension("core", "header")).toBe(true);

    const guestExtensions = await customRegistry.getExtensions(
      "core",
      "header",
      false,
      { roles: ["user"], permissions: [] },
    );
    expect(guestExtensions).toHaveLength(1);
    expect(guestExtensions[0].id).toBe("header-button");

    const adminExtensions = await customRegistry.getExtensions(
      "core",
      "header",
      false,
      { roles: ["admin"], permissions: [] },
    );
    expect(adminExtensions.map((e) => e.id)).toEqual([
      "header-button",
      "admin-header-button",
    ]);

    await customRegistry.togglePlugin("ext-plugin", false);
    expect(await customRegistry.hasExtension("core", "header")).toBe(false);
    expect(await customRegistry.getExtensions("core", "header")).toHaveLength(
      0,
    );
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

  it("injects IoC services via @Inject into plugin lifecycle methods (init, onEnable, onDisable)", async () => {
    const ioc = new Container();

    class FakeAuthService {
      getProviderName() {
        return "veap-auth";
      }
    }

    ioc.register({
      token: FakeAuthService,
      useClass: FakeAuthService,
      singleton: true,
    });

    const injectedCalls: string[] = [];

    class InjectablePlugin implements IPlugin {
      manifest = {
        id: "injectable-plugin",
        name: "Injectable Plugin",
        version: "1.0.0",
        description: "Tests method injection",
      };

      async init(
        @Inject(FakeAuthService) authService: FakeAuthService,
      ): Promise<void> {
        injectedCalls.push(`init:${authService.getProviderName()}`);
      }

      async onEnable(
        @Inject(FakeAuthService) authService: FakeAuthService,
        context?: { source?: string },
      ): Promise<void> {
        injectedCalls.push(
          `onEnable:${authService.getProviderName()}:${context?.source ?? "none"}`,
        );
      }

      async onDisable(
        @Inject(FakeAuthService) authService: FakeAuthService,
      ): Promise<void> {
        injectedCalls.push(`onDisable:${authService.getProviderName()}`);
      }
    }

    const customRegistry = new PluginRegistry(
      repository,
      runner,
      mockLogger,
      mockEventBus,
      ioc,
    );

    customRegistry.register(new InjectablePlugin());
    await customRegistry.init();

    expect(injectedCalls).toEqual(["init:veap-auth"]);

    await customRegistry.togglePlugin("injectable-plugin", false);
    expect(injectedCalls).toContain("onDisable:veap-auth");

    await customRegistry.togglePlugin("injectable-plugin", true, {
      source: "panel",
    });
    expect(injectedCalls).toContain("onEnable:veap-auth:panel");
  });

  it("registers navigation via MenuService injected into plugin.init() and clears it when disabled", async () => {
    const ioc = new Container();
    const customRegistry = new PluginRegistry(
      repository,
      runner,
      mockLogger,
      mockEventBus,
      ioc,
    );
    const menuService = new MenuService(customRegistry, {
      get: async () => ({ privatePath: "/veap" }) as any,
    });

    ioc.register({
      token: MenuService,
      useValue: menuService,
      singleton: true,
    });
    ioc.register({
      token: MENU_SERVICE,
      useValue: menuService,
      singleton: true,
    });

    class BlogNavPlugin implements IPlugin {
      manifest = {
        id: "blog-nav",
        name: "Blog Nav",
        version: "1.0.0",
        description: "Registers blog navigation",
      };

      async init(@Inject(MenuService) menu: MenuService): Promise<void> {
        menu.addPublicItem({
          id: "blog-home",
          title: "Blog",
          url: "/blog",
          priority: 10,
        });
        menu.addAdminItem("content", {
          id: "blog-posts",
          title: "Posts",
          url: "/blog/posts",
          priority: 20,
        });
        menu.addSettingsItem("blog-settings", {
          id: "blog-seo",
          title: "SEO",
          url: "/settings/blog-seo",
          priority: 30,
        });
      }
    }

    customRegistry.register(new BlogNavPlugin());
    await customRegistry.init();

    const publicItems = await menuService.getPublicNavigation();
    expect(publicItems).toHaveLength(1);
    expect(publicItems[0]).toMatchObject({
      id: "blog-home",
      title: "Blog",
      url: "/blog",
    });

    const adminGroups = await menuService.getVeapNavigationGrouped("admin");
    expect(adminGroups.content).toHaveLength(1);
    expect(adminGroups.content[0]).toMatchObject({
      id: "blog-posts",
      title: "Posts",
      url: "/veap/blog/posts",
    });

    const settingsGroups =
      await menuService.getVeapNavigationGrouped("settings");
    expect(settingsGroups["blog-settings"]).toHaveLength(1);
    expect(settingsGroups["blog-settings"][0]).toMatchObject({
      id: "blog-seo",
      title: "SEO",
      url: "/veap/settings/blog-seo",
    });

    // Disabling the plugin should automatically clear its navigation items
    await customRegistry.togglePlugin("blog-nav", false);

    expect(await menuService.getPublicNavigation()).toHaveLength(0);
    expect(await menuService.getVeapNavigationGrouped("admin")).toEqual({});
    expect(await menuService.getVeapNavigationGrouped("settings")).toEqual({});
  });

  it("registers widgets via WidgetService injected into plugin.init() and clears them when disabled", async () => {
    const ioc = new Container();
    const customRegistry = new PluginRegistry(
      repository,
      runner,
      mockLogger,
      mockEventBus,
      ioc,
    );
    const widgetService = new WidgetService(customRegistry);

    ioc.register({
      token: WidgetService,
      useValue: widgetService,
      singleton: true,
    });
    ioc.register({
      token: WIDGET_SERVICE,
      useValue: widgetService,
      singleton: true,
    });

    const DummyStatsWidget = () => "Stats";
    const DummyAdminWidget = () => "AdminOnly";

    class DashboardWidgetsPlugin implements IPlugin {
      manifest = {
        id: "dashboard-widgets",
        name: "Dashboard Widgets",
        version: "1.0.0",
        description: "Registers dashboard widgets",
      };

      async init(@Inject(WidgetService) widgets: WidgetService): Promise<void> {
        widgets.register([
          {
            id: "admin-metrics",
            name: "Admin Metrics",
            area: "dashboard-stats",
            component: DummyAdminWidget as any,
            priority: 20,
            roles: ["admin"],
          },
          {
            id: "public-welcome",
            name: "Welcome",
            area: "dashboard-stats",
            component: DummyStatsWidget as any,
            priority: 5,
          },
        ]);
      }
    }

    customRegistry.register(new DashboardWidgetsPlugin());
    await customRegistry.init();

    // Without admin role, only the unrestricted widget is returned
    const guestWidgets = await widgetService.getWidgets("dashboard-stats", {
      roles: ["user"],
      permissions: [],
    });
    expect(guestWidgets).toHaveLength(1);
    expect(guestWidgets[0].id).toBe("public-welcome");

    // With admin role, both widgets are returned sorted by priority (5 then 20)
    const adminWidgets = await widgetService.getWidgets("dashboard-stats", {
      roles: ["admin"],
      permissions: [],
    });
    expect(adminWidgets.map((w) => w.id)).toEqual([
      "public-welcome",
      "admin-metrics",
    ]);

    // Disabling the plugin clears its widgets
    await customRegistry.togglePlugin("dashboard-widgets", false);

    expect(
      await widgetService.getWidgets("dashboard-stats", {
        roles: ["admin"],
        permissions: [],
      }),
    ).toHaveLength(0);
  });
});
