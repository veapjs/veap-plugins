import {
  AppError,
  Container,
  container as defaultContainer,
  EVENT_BUS,
  type IEventBus,
  type ILogger,
  Inject,
  Injectable,
  LOGGER,
} from "@veap/kernel";
import {
  EXTENSION_SERVICE,
  type IPlugin,
  MENU_SERVICE,
  WIDGET_SERVICE,
} from "../common/index.js";
import type { MenuService } from "../navigation/navigation.service.js";
import type { ExtensionService } from "../widgets/extension.service.js";
import type { WidgetService } from "../widgets/widget.service.js";
import {
  type IMigrationRunner,
  type IPluginRepository,
  MIGRATION_RUNNER,
  PLUGIN_REPOSITORY,
  type PluginRuntimeStatus,
} from "./contracts.js";

/**
 * Normalizes an npm dependency string (e.g. "@veap/media-plugin") to a registered plugin id (e.g. "media-plugin").
 */
const resolveDependencyId = (depId: string): string =>
  depId.replace(/^@[^/]+\//, "");

@Injectable()
export class PluginRegistry {
  private plugins = new Map<string, IPlugin>();
  private pluginStatus = new Map<string, PluginRuntimeStatus>();
  private processingPlugins = new Set<string>();
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  constructor(
    @Inject(PLUGIN_REPOSITORY) private readonly repository: IPluginRepository,
    @Inject(MIGRATION_RUNNER)
    private readonly migrationRunner: IMigrationRunner,
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(Container)
    private readonly iocContainer: Container = defaultContainer,
  ) {}

  private async resolveMenuService(): Promise<MenuService | null> {
    try {
      if (this.iocContainer.has(MENU_SERVICE)) {
        return await this.iocContainer.resolve<MenuService>(MENU_SERVICE);
      }
      const { MenuService: MenuServiceClass } = await import(
        "../navigation/navigation.service"
      );
      if (this.iocContainer.has(MenuServiceClass)) {
        return await this.iocContainer.resolve<MenuService>(MenuServiceClass);
      }
    } catch {}
    return null;
  }

  private async resolveWidgetService(): Promise<WidgetService | null> {
    try {
      if (this.iocContainer.has(WIDGET_SERVICE)) {
        return await this.iocContainer.resolve<WidgetService>(WIDGET_SERVICE);
      }
      const { WidgetService: WidgetServiceClass } = await import(
        "../widgets/widget.service"
      );
      if (this.iocContainer.has(WidgetServiceClass)) {
        return await this.iocContainer.resolve<WidgetService>(
          WidgetServiceClass,
        );
      }
    } catch {}
    return null;
  }

  private async resolveExtensionService(): Promise<ExtensionService | null> {
    try {
      if (this.iocContainer.has(EXTENSION_SERVICE)) {
        return await this.iocContainer.resolve<ExtensionService>(
          EXTENSION_SERVICE,
        );
      }
      const { ExtensionService: ExtensionServiceClass } = await import(
        "../widgets/extension.service"
      );
      if (this.iocContainer.has(ExtensionServiceClass)) {
        return await this.iocContainer.resolve<ExtensionService>(
          ExtensionServiceClass,
        );
      }
    } catch {}
    return null;
  }

  private async invokePluginInit(plugin: IPlugin): Promise<void> {
    if (!plugin.init) return;
    const menuService = await this.resolveMenuService();
    const widgetService = await this.resolveWidgetService();
    const extensionService = await this.resolveExtensionService();

    const executeInit = () => this.iocContainer.call(plugin, "init");

    const withExtensions = extensionService
      ? () =>
          extensionService.runWithPluginContext(plugin.manifest.id, executeInit)
      : executeInit;

    const withWidgets = widgetService
      ? () =>
          widgetService.runWithPluginContext(plugin.manifest.id, withExtensions)
      : withExtensions;

    if (menuService) {
      await menuService.runWithPluginContext(plugin.manifest.id, withWidgets);
      return;
    }

    await withWidgets();
  }

  /** Lookup a plugin by id, falling back to the npm-name form. */
  private findPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id) ?? this.plugins.get(resolveDependencyId(id));
  }

  public register(pluginOrClass: IPlugin | (new (...args: any[]) => IPlugin)) {
    const plugin: IPlugin =
      typeof pluginOrClass === "function" ? new pluginOrClass() : pluginOrClass;

    if (this.plugins.has(plugin.manifest.id)) {
      // return;
    }

    this.plugins.set(plugin.manifest.id, plugin);

    // Recursive registration of nested plugins
    if (plugin.plugins && Array.isArray(plugin.plugins)) {
      for (const nested of plugin.plugins) {
        this.register(nested);
      }
    }

    if (process.env.NODE_ENV === "development") {
      // In development, we want to allow re-registration to pick up HMR changes
      this.plugins.set(plugin.manifest.id, plugin);
    }
  }

  private async updateStatus(
    id: string,
    update: {
      enabled?: boolean;
      installed?: boolean;
      lastStep?: string | null;
    },
  ) {
    const current = this.pluginStatus.get(id) || {
      enabled: false,
      installed: false,
      lastStep: null,
    };

    const next = { ...current, ...update };
    this.pluginStatus.set(id, next);

    if (update.lastStep !== undefined && update.lastStep !== null) {
      this.logger.info("PluginRegistry", `"${id}" step: ${update.lastStep}`);
    }

    const isStateTransition =
      update.enabled !== undefined || update.installed !== undefined;

    try {
      await this.repository.upsertStatus(id, update, {
        system: this.plugins.get(id)?.manifest.system ?? false,
      });
    } catch (e) {
      if (isStateTransition) {
        // Rollback in-memory state on DB failure to avoid split-brain
        this.pluginStatus.set(id, current);
        this.logger.error(
          "PluginRegistry",
          `Critical: DB status sync failed for plugin "${id}". Rolling back in-memory state:`,
          e,
        );
        throw e;
      } else {
        // Ephemeral progress steps (lastStep) can safely fail without aborting
        this.logger.warn(
          "PluginRegistry",
          `DB step sync failed for "${id}":`,
          e,
        );
      }
    }
  }

  private async updateStep(id: string, step: string | null) {
    await this.updateStatus(id, { lastStep: step });
  }

  private sortPlugins(plugins: IPlugin[]): IPlugin[] {
    const sorted: IPlugin[] = [];
    const visited = new Set<string>();
    const processing = new Set<string>();

    const visit = (plugin: IPlugin) => {
      if (visited.has(plugin.manifest.id)) return;
      if (processing.has(plugin.manifest.id)) {
        throw AppError.Internal(
          `Circular dependency detected: ${plugin.manifest.id}`,
        );
      }

      processing.add(plugin.manifest.id);

      const dependencies = plugin.manifest.dependencies || [];
      for (const depId of dependencies) {
        const depPlugin = this.findPlugin(depId);
        if (depPlugin) {
          visit(depPlugin);
        } else {
          this.logger.warn(
            "PluginRegistry",
            `Missing dependency: ${depId} for plugin ${plugin.manifest.id}`,
          );
        }
      }

      processing.delete(plugin.manifest.id);
      visited.add(plugin.manifest.id);
      sorted.push(plugin);
    };

    // First, visit system plugins
    for (const plugin of plugins) {
      if (plugin.manifest.system) {
        visit(plugin);
      }
    }

    // Then visit the rest
    for (const plugin of plugins) {
      visit(plugin);
    }

    return sorted;
  }

  public async init() {
    // if (this.initialized && process.env.NODE_ENV !== "development") return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        await this.eventBus.publish("system:plugins:init:start", {
          timestamp: Date.now(),
        });

        // 1. Sync with database
        const pluginValues = Array.from(this.plugins.values()).map(
          (plugin) => ({
            id: plugin.manifest.id,
            enabled: plugin.manifest.system ?? false,
            installed: plugin.manifest.system ?? false,
            system: plugin.manifest.system ?? false,
          }),
        );

        if (pluginValues.length > 0) {
          try {
            await this.repository.seed(pluginValues);
          } catch (_e) {
            // Ignore errors if table doesn't exist yet during bootstrap
          }
        }

        // 2. Fetch current status from DB
        try {
          const dbPlugins = await this.repository.findAll();
          for (const dbp of dbPlugins) {
            this.pluginStatus.set(dbp.id, {
              enabled: dbp.enabled || dbp.system,
              installed: dbp.installed || dbp.system,
              lastStep: dbp.lastStep,
            });
          }
        } catch (_e) {
          for (const plugin of this.plugins.values()) {
            this.pluginStatus.set(plugin.manifest.id, {
              enabled: plugin.manifest.system ?? false,
              installed: true,
              lastStep: null,
            });
          }
        }

        // 3. Sort plugins by dependencies
        const sortedPlugins = this.sortPlugins(
          Array.from(this.plugins.values()),
        );

        // 4. Initialize enabled plugins
        for (const plugin of sortedPlugins) {
          const status = this.pluginStatus.get(plugin.manifest.id);
          if (status?.enabled) {
            if (plugin.migrations && plugin.migrations.length > 0) {
              await this.migrationRunner.run(
                plugin.manifest.id,
                plugin.migrations as any,
              );
            }

            if (!status.installed) {
              await this.updateStep(plugin.manifest.id, "Installing...");
              if (plugin.onMigrate) {
                await this.iocContainer.call(plugin, "onMigrate");
              }
              if (plugin.onEnable) {
                await this.iocContainer.call(plugin, "onEnable");
              }

              await this.updateStatus(plugin.manifest.id, {
                installed: true,
                lastStep: null,
              });
            }

            if (plugin.init) {
              await this.invokePluginInit(plugin);
            }
          }
        }

        this.initialized = true;

        this.logger.info(
          "veap:plugins",
          `Initialized with ${this.plugins.size} plugins`,
        );

        await this.eventBus.publish("system:plugins:init:end", {
          timestamp: Date.now(),
          pluginCount: this.plugins.size,
        });
      } catch (error) {
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  public getPlugins() {
    return Array.from(this.plugins.values());
  }

  public getEnabledPlugins() {
    return this.getPlugins().filter((p) => {
      const status = this.pluginStatus.get(p.manifest.id);
      return status?.enabled ?? false;
    });
  }

  public getPlugin(id: string) {
    return this.plugins.get(id);
  }

  public async getPluginsStatus() {
    try {
      const dbPlugins = await this.repository.findAll();
      const dbStatusMap = new Map(dbPlugins.map((p) => [p.id, p]));

      return this.getPlugins().map((p) => {
        const dbp = dbStatusMap.get(p.manifest.id);
        const memStatus = this.pluginStatus.get(p.manifest.id);

        return {
          ...p.manifest,
          enabled:
            dbp?.enabled ??
            memStatus?.enabled ??
            p.manifest.enabled ??
            p.manifest.system ??
            false,
          installed:
            dbp?.installed ??
            memStatus?.installed ??
            p.manifest.system ??
            false,
          lastStep: memStatus?.lastStep ?? dbp?.lastStep ?? null,
        };
      });
    } catch (_e) {
      // Fallback for bootstrap phase
      return this.getPlugins().map((p) => {
        const status = this.pluginStatus.get(p.manifest.id);
        return {
          ...p.manifest,
          enabled:
            status?.enabled ?? p.manifest.enabled ?? p.manifest.system ?? false,
          installed: status?.installed ?? p.manifest.system ?? false,
          lastStep: status?.lastStep ?? null,
        };
      });
    }
  }

  public async getPluginStatus(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) return null;

    const memStatus = this.pluginStatus.get(id);
    const isProcessing = this.processingPlugins.has(id);

    try {
      const dbp = await this.repository.findById(id);

      return {
        ...plugin.manifest,
        enabled: dbp?.enabled ?? memStatus?.enabled ?? false,
        installed: dbp?.installed ?? memStatus?.installed ?? false,
        // In production, the DB is the only shared truth between processes.
        // We use DB's lastStep first, then memory, then "Processing..." indicator.
        lastStep:
          dbp?.lastStep ??
          memStatus?.lastStep ??
          (isProcessing ? "Processing..." : null),
      };
    } catch (_e) {
      // Fallback to in-memory if DB fails
      return {
        ...plugin.manifest,
        enabled: memStatus?.enabled ?? false,
        installed: memStatus?.installed ?? false,
        lastStep:
          memStatus?.lastStep ?? (isProcessing ? "Processing..." : null),
      };
    }
  }

  public async getHooks(point: string) {
    const hooks = [];
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.hooks) {
        hooks.push(...plugin.hooks.filter((h) => h.point === point));
      }
    }
    // Items without priority default to 100 to appear later
    return hooks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  public async getExtensions(
    target: string,
    point: string,
    includeDisabled = false,
    context?: { roles?: string[]; permissions?: string[] },
  ) {
    const extensionService = await this.resolveExtensionService();
    if (!extensionService) return [];
    return extensionService.getExtensions(
      target,
      point,
      includeDisabled,
      context,
    );
  }

  public async getWidgets(
    area: string,
    context?: { roles?: string[]; permissions?: string[] },
  ) {
    const widgetService = await this.resolveWidgetService();
    if (!widgetService) return [];
    return widgetService.getWidgets(area, context);
  }

  private async delay(ms = 500) {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL ||
      process.env.NEXT_RUNTIME === "edge"
    )
      return;

    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async togglePlugin(id: string, enabled: boolean, context?: any) {
    const plugin = this.findPlugin(id);
    if (!plugin) throw AppError.Internal(`Plugin ${id} not found`);

    // Canonicalize to the registered id so status lookups match
    id = plugin.manifest.id;

    const currentStatus = this.pluginStatus.get(id);
    if (currentStatus?.enabled === enabled) return;

    // Prevent infinite recursion (dependency cycles)
    if (this.processingPlugins.has(id)) {
      return;
    }

    this.processingPlugins.add(id);

    try {
      if (enabled) {
        // activation process

        // 1. Check if the plugin requires any plugins
        await this.updateStep(id, "Checking dependencies...");
        await this.delay();
        const dependencies = plugin.manifest.dependencies || [];

        // 2. Activate required dependencies
        for (const depId of dependencies) {
          const depPlugin = this.findPlugin(depId);
          const canonicalDepId =
            depPlugin?.manifest.id ?? resolveDependencyId(depId);
          const depStatus = this.pluginStatus.get(canonicalDepId);
          if (!depStatus?.enabled) {
            const depName = depPlugin?.manifest.name || canonicalDepId;

            await this.updateStep(
              id,
              `Waiting for dependency activation: ${depName}`,
            );
            // Recursive call for dependencies
            await this.togglePlugin(canonicalDepId, true, context);
            await this.delay();
          }
        }

        // 3. Before running the onEnable hook, we perform migrations
        if (plugin.migrations?.length) {
          await this.updateStep(id, "Migrating the database...");
          await this.delay();
          await this.migrationRunner.run(id, plugin.migrations as any);
        }

        // 4. Once migrations are complete, run the onEnable hook
        if (plugin.onEnable) {
          await this.updateStep(id, "Running the onEnable hook...");
          await this.delay();
          await this.iocContainer.call(plugin, "onEnable", context);
        }

        // 5. Finally, we turn on the plugin
        await this.updateStatus(id, {
          enabled: true,
          installed: true,
          lastStep: null,
        });
        await this.delay();
      } else {
        // deactivation process

        // 1. Check for plugins that depend on us (automatic deactivation "upwards")
        // We MUST deactivate dependents FIRST, otherwise they would be broken when we disable ourselves
        // Match both the canonical id and the scoped npm-name form
        const dependents = Array.from(this.plugins.values()).filter((p) =>
          p.manifest.dependencies?.some(
            (dep) => resolveDependencyId(dep) === resolveDependencyId(id),
          ),
        );
        for (const dependent of dependents) {
          const depStatus = this.pluginStatus.get(dependent.manifest.id);
          if (
            depStatus?.enabled &&
            !this.processingPlugins.has(dependent.manifest.id)
          ) {
            await this.updateStep(
              id,
              `Deactivating dependent plugin: ${dependent.manifest.name}`,
            );
            await this.togglePlugin(dependent.manifest.id, false, context);
            await this.delay();
          }
        }

        // 2. Run the onDisable hook
        if (plugin.onDisable) {
          await this.updateStep(id, "Running onDisable hook...");
          await this.delay();
          await this.iocContainer.call(plugin, "onDisable");
        }

        // 3. Run the rollback migrations
        if (plugin.migrations?.length) {
          await this.updateStep(id, "Rolling back database migrations...");
          await this.delay();
          try {
            await this.migrationRunner.rollback(id, plugin.migrations as any);
          } catch (e) {
            this.logger.error(
              "PluginRegistry",
              `Rollback failed for ${id}:`,
              e,
            );
          }
        }

        // 4. Disable the plugin itself
        await this.updateStatus(id, { enabled: false, lastStep: null });
        const menuService = await this.resolveMenuService();
        menuService?.clearPlugin(id);
        const widgetService = await this.resolveWidgetService();
        widgetService?.clearPlugin(id);
        const extensionService = await this.resolveExtensionService();
        extensionService?.clearPlugin(id);
        await this.delay();

        // 5. Finally, proceed to deactivate unused dependencies
        const dependencies = plugin.manifest.dependencies || [];
        for (const depId of dependencies) {
          const depPlugin = this.findPlugin(depId);
          const canonicalDepId =
            depPlugin?.manifest.id ?? resolveDependencyId(depId);
          const depStatus = this.pluginStatus.get(canonicalDepId);
          if (depStatus?.enabled) {
            // Check if anyone else is using this dependency (excluding those in the middle of deactivation)
            const otherDependents = Array.from(this.plugins.values()).some(
              (p) =>
                p.manifest.id !== id &&
                this.pluginStatus.get(p.manifest.id)?.enabled &&
                !this.processingPlugins.has(p.manifest.id) &&
                p.manifest.dependencies?.some(
                  (dep) =>
                    resolveDependencyId(dep) ===
                    resolveDependencyId(canonicalDepId),
                ),
            );

            if (!otherDependents) {
              const depName = depPlugin?.manifest.name || canonicalDepId;

              await this.updateStep(
                id,
                `Cleaning up unused dependency: ${depName}`,
              );
              await this.togglePlugin(canonicalDepId, false, context);
              await this.delay();
            }
          }
        }
      }

      // Important: init() is only called if we are ENABLING
      if (enabled && plugin.init) {
        await this.invokePluginInit(plugin);
      }

      // Ensure lastStep is cleared at the end of a SUCCESSFUL toggle
      await this.updateStep(id, null);
    } catch (error) {
      this.logger.warn(
        "veap:plugins",
        `Error toggling plugin ${id}: ${(error as Error).message}`,
      );
      await this.updateStep(id, `Error: ${(error as Error).message}`);
      throw error;
    } finally {
      this.processingPlugins.delete(id);

      // Final safety clear: if we're not in an error state, make sure lastStep is null
      const finalStatus = this.pluginStatus.get(id);
      if (
        finalStatus?.lastStep &&
        !finalStatus.lastStep.startsWith("Error:") &&
        !finalStatus.lastStep.includes("...")
      ) {
        await this.updateStep(id, null);
      }
    }

    await this.eventBus.publish("system:plugin:toggle", {
      pluginId: id,
      isEnabled: enabled,
    });
  }

  public async hasHooks(point: string): Promise<boolean> {
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.hooks?.some((h) => h.point === point)) return true;
    }
    return false;
  }

  public async hasExtension(target: string, point?: string): Promise<boolean> {
    const extensionService = await this.resolveExtensionService();
    if (!extensionService) return false;
    return extensionService.hasExtension(target, point);
  }

  public async getConfig<T>(id: string): Promise<T | null> {
    try {
      const record = await this.repository.findById(id);
      return record?.config ? (JSON.parse(record.config) as T) : null;
    } catch {
      return null;
    }
  }

  public async updateConfig(id: string, config: any) {
    try {
      await this.repository.updateConfig(id, JSON.stringify(config));
    } catch (_e) {}
  }
}

// ─── Backwards-compatible re-exports ─────────────────────────────────────────
// The implementations live in `facade.ts`; this keeps
// `export * from "../application/plugins/registry.js"` in the entry barrels
// working for all module-level helpers.
export {
  applyPluginFilters,
  ensurePluginsInitialized,
  getPluginConfig,
  getPluginStatus,
  getPluginsStatus,
  hasPluginExtension,
  hasPluginHooks,
  registerPlugins,
  togglePluginState,
  updatePluginConfig,
} from "./facade.js";
