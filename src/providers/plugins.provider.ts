import { isDatabaseInitialized } from "@veap/database";
import { IntlService } from "@veap/intl/server";
import { eventBus, ServiceProvider } from "@veap/kernel";
import type { CommandEntry } from "@veap/kernel/cli";
import type * as React from "react";
import { AddPluginCommand } from "../cli/commands/add-plugin.js";
import { EjectPluginCommand } from "../cli/commands/eject-plugin.js";
import { ListPluginsCommand } from "../cli/commands/list-plugins.js";
import { MakePluginCommand } from "../cli/commands/make-plugin.js";
import { PluginsSyncCommand } from "../cli/commands/plugins-sync.js";
import { RemovePluginCommand } from "../cli/commands/remove-plugin.js";
import { bindPluginsContext } from "../common/context.js";
import {
  APP_PLUGINS,
  EXTENSION_SERVICE,
  MENU_SERVICE,
  ROUTER_SERVICE,
  SITE_LAYOUT,
  WIDGET_SERVICE,
} from "../common/tokens.js";
import { runPluginMigrations } from "../migrations/index.js";
import { MenuService } from "../navigation/navigation.service.js";
import { MIGRATION_RUNNER, PLUGIN_REPOSITORY } from "../registry/contracts.js";
import {
  ensurePluginsInitialized,
  registerPlugins,
} from "../registry/facade.js";
import { KnexMigrationRunner } from "../registry/migration-runner.js";
import { ActiveRecordPluginRepository } from "../registry/plugin.repository.js";
import { PluginRegistry } from "../registry/registry.service.js";
import { RouterService } from "../router/router.service.js";
import { ExtensionService } from "../widgets/extension.service.js";
import { WidgetService } from "../widgets/widget.service.js";

export interface PluginsConfig {
  plugins?: any[];
  rewrites?: Record<string, string>;
  siteLayout?: React.ComponentType<any>;
  /**
   * Whether to automatically run plugin database migrations during boot().
   * Defaults to `true` when database connection is initialized.
   */
  autoMigrate?: boolean;
}

export class PluginsServiceProvider extends ServiceProvider {
  private config?: PluginsConfig;

  constructor(container: any, config?: PluginsConfig) {
    super(container);
    this.config = config;
  }

  /**
   * Plugin management CLI commands harvested by the Veap console (`@veap/kernel/cli`):
   * `list-plugins`, `add`, `remove`, `eject`, `make:plugin`, and `PluginsSyncCommand`.
   */
  commands(): CommandEntry[] {
    return [
      ListPluginsCommand,
      AddPluginCommand,
      RemovePluginCommand,
      EjectPluginCommand,
      MakePluginCommand,
      PluginsSyncCommand,
    ];
  }

  register(): void {
    this.container.register({
      token: PLUGIN_REPOSITORY,
      useClass: ActiveRecordPluginRepository,
      singleton: true,
    });

    this.container.register({
      token: MIGRATION_RUNNER,
      useClass: KnexMigrationRunner,
      singleton: true,
    });

    this.container.register({
      token: PluginRegistry,
      useClass: PluginRegistry,
      singleton: true,
    });

    this.container.register({
      token: MenuService,
      useClass: MenuService,
      singleton: true,
    });

    this.container.register({
      token: MENU_SERVICE,
      useFactory: (c) => c.resolve(MenuService),
      inject: [this.container.constructor as any],
      singleton: true,
    });

    this.container.register({
      token: WidgetService,
      useClass: WidgetService,
      singleton: true,
    });

    this.container.register({
      token: WIDGET_SERVICE,
      useFactory: (c) => c.resolve(WidgetService),
      inject: [this.container.constructor as any],
      singleton: true,
    });

    this.container.register({
      token: ExtensionService,
      useClass: ExtensionService,
      singleton: true,
    });

    this.container.register({
      token: EXTENSION_SERVICE,
      useFactory: (c) => c.resolve(ExtensionService),
      inject: [this.container.constructor as any],
      singleton: true,
    });

    this.container.register({
      token: RouterService,
      useClass: RouterService,
      singleton: true,
    });

    this.container.register({
      token: ROUTER_SERVICE,
      useClass: RouterService,
      singleton: true,
    });

    if (this.config?.siteLayout) {
      this.container.register({
        token: SITE_LAYOUT,
        useValue: this.config.siteLayout,
        singleton: true,
      });
    }
  }

  async boot(): Promise<void> {
    const registry =
      await this.container.resolve<PluginRegistry>(PluginRegistry);
    const menu = await this.container.resolve<MenuService>(MenuService);
    const widgets = await this.container.resolve<WidgetService>(WidgetService);
    const extensions =
      await this.container.resolve<ExtensionService>(ExtensionService);
    const routerService =
      await this.container.resolve<RouterService>(RouterService);

    bindPluginsContext({
      registry,
      menu,
      navigation: menu,
      widgets,
      extensions,
      router: routerService,
    });

    if (this.config?.rewrites) {
      for (const [from, to] of Object.entries(this.config.rewrites)) {
        routerService.addRewrite(from, to);
      }
    }

    if (this.config?.siteLayout) {
      routerService.setSiteLayout(this.config.siteLayout);
    }

    // Register Intl loader for plugins if IntlService is available
    if (this.container.has(IntlService)) {
      try {
        const intlService =
          await this.container.resolve<IntlService>(IntlService);
        intlService.registerLoader({
          id: "veap:plugins",
          priority: 100,
          load: async (locale: string) => {
            let combined: any = {};
            const plugins = registry.getPlugins();
            for (const plugin of plugins) {
              if (plugin.locales && plugin.locales[locale]) {
                try {
                  const pluginDict = await plugin.locales[locale]();
                  const data = pluginDict.default || pluginDict;
                  combined = { ...combined, ...data };
                } catch (e) {
                  console.error(
                    `[veap:Intl] Error loading locale ${locale} for plugin ${plugin.manifest.id}`,
                    e,
                  );
                }
              }
            }
            return combined;
          },
        });
      } catch (err: any) {
        console.warn(
          "[veap:plugins] Intl loader registration deferred:",
          err?.message || err,
        );
      }
    }

    // Clear cache when plugins are enabled/disabled
    eventBus.subscribe("system:plugin:toggle", "route-tree-cache", async () => {
      await routerService.clearCache();
    });

    // Clear cache after plugin initialization finishes
    eventBus.subscribe(
      "system:plugins:init:end",
      "route-tree-cache-init",
      async () => {
        await routerService.clearCache();
      },
    );

    // Register plugins from config or container
    const pluginsToRegister =
      this.config?.plugins ||
      (this.container.has(APP_PLUGINS)
        ? await this.container.resolve<any[]>(APP_PLUGINS)
        : this.container.has("AppPlugins")
          ? await this.container.resolve<any[]>("AppPlugins")
          : []);

    if (pluginsToRegister?.length) {
      await registerPlugins(pluginsToRegister);
    }

    // Under the console (`VEAP_CLI=1`), keep in-memory plugin definitions
    // registered for inspection (e.g. `veap list-plugins`), but skip automatic
    // database migrations and runtime initialization side effects.
    if (process.env.VEAP_CLI === "1") return;

    // Automatically run plugin migrations if database is initialized and autoMigrate is not disabled
    if (this.config?.autoMigrate !== false && isDatabaseInitialized()) {
      try {
        await runPluginMigrations();
      } catch (err: any) {
        console.warn(
          "[veap:plugins] Plugin migration deferred:",
          err?.message || err,
        );
      }
    }

    // Auto-bootstrap and synchronize database state
    try {
      await ensurePluginsInitialized();
    } catch (e: any) {
      console.warn(
        "[veap:plugins] Plugin initialization deferred:",
        e?.message || e,
      );
    }
  }
}

export type { PluginsConfig as RouterConfig };
// Backwards compatibility aliases
export {
  PluginsServiceProvider as PluginServiceProvider,
  PluginsServiceProvider as RouterServiceProvider,
};
