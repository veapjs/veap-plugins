import { isDatabaseInitialized } from "@veap/database";
import { IntlService } from "@veap/intl/server";
import {
  APP_PLUGINS,
  eventBus,
  ROUTER_SERVICE,
  ServiceProvider,
  SITE_LAYOUT,
} from "@veap/kernel";
import type * as React from "react";
import { bindPluginsContext } from "../common/context";
import { runPluginMigrations } from "../migrations";
import { NavigationService } from "../navigation/navigation.service";
import { MIGRATION_RUNNER, PLUGIN_REPOSITORY } from "../registry/contracts";
import { ensurePluginsInitialized, registerPlugins } from "../registry/facade";
import { KnexMigrationRunner } from "../registry/migration-runner";
import { ActiveRecordPluginRepository } from "../registry/plugin.repository";
import { PluginRegistry } from "../registry/registry.service";
import { RouterService } from "../router/router.service";

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
      token: NavigationService,
      useClass: NavigationService,
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
    const navigation =
      await this.container.resolve<NavigationService>(NavigationService);
    const routerService =
      await this.container.resolve<RouterService>(RouterService);

    bindPluginsContext({
      registry,
      navigation,
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
