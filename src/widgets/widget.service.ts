import { authContext } from "@veap/auth";
import { Inject, Injectable } from "@veap/kernel";
import { pluginsContext } from "../common/context.js";
import type { PluginWidget } from "../common/types.js";
import { PluginRegistry } from "../registry/index.js";

interface WidgetEntry {
  pluginId?: string;
  widget: PluginWidget;
}

/**
 * Service for registering and resolving plugin and application dashboard widgets.
 */
@Injectable()
export class WidgetService {
  private activePluginId: string | undefined = undefined;
  private entries: WidgetEntry[] = [];

  constructor(
    @Inject(PluginRegistry) private readonly registry?: PluginRegistry,
  ) {}

  private resolvePluginId(explicitPluginId?: string): string | undefined {
    return explicitPluginId ?? this.activePluginId;
  }

  private isEntryEnabled(pluginId?: string): boolean {
    if (!pluginId || !this.registry) return true;
    const allPlugins = this.registry.getPlugins();
    if (allPlugins.length === 0) return true;
    return this.registry
      .getEnabledPlugins()
      .some((p) => p.manifest.id === pluginId);
  }

  private async getCurrentUserAccess(): Promise<{
    userRoles: string[];
    userPermissions: string[];
  }> {
    try {
      const { user } = await authContext().session.getCurrentSession();
      return {
        userRoles: user?.roles || [],
        userPermissions: user?.permissions || [],
      };
    } catch {
      return { userRoles: [], userPermissions: [] };
    }
  }

  /**
   * Executes a callback (such as `plugin.init()`) with `pluginId` bound as the
   * default owner for all widget registrations made during its execution.
   * Clears any previous widgets registered by `pluginId` first.
   */
  public async runWithPluginContext<T>(
    pluginId: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    this.clearPlugin(pluginId);
    const previous = this.activePluginId;
    this.activePluginId = pluginId;
    try {
      return await fn();
    } finally {
      this.activePluginId = previous;
    }
  }

  /**
   * Removes all widgets registered by a specific plugin.
   */
  public clearPlugin(pluginId: string): void {
    this.entries = this.entries.filter((entry) => entry.pluginId !== pluginId);
  }

  /**
   * Clears all registered widgets across all areas.
   */
  public clear(): void {
    this.entries = [];
  }

  /**
   * Registers a single widget definition.
   * If a widget with the same `id` and `area` is already registered, it is replaced.
   */
  public addWidget(widget: PluginWidget, pluginId?: string): this {
    const ownerId = this.resolvePluginId(pluginId);
    const existingIndex = this.entries.findIndex(
      (entry) =>
        entry.widget.id === widget.id && entry.widget.area === widget.area,
    );

    if (existingIndex !== -1) {
      this.entries[existingIndex] = { pluginId: ownerId, widget };
    } else {
      this.entries.push({ pluginId: ownerId, widget });
    }

    return this;
  }

  /**
   * Registers multiple widget definitions.
   */
  public addWidgets(widgets: PluginWidget[], pluginId?: string): this {
    for (const widget of widgets) {
      this.addWidget(widget, pluginId);
    }
    return this;
  }

  /**
   * Registers a single widget or an array of widgets.
   */
  public register(
    widgetOrWidgets: PluginWidget | PluginWidget[],
    pluginId?: string,
  ): this {
    if (Array.isArray(widgetOrWidgets)) {
      return this.addWidgets(widgetOrWidgets, pluginId);
    }
    return this.addWidget(widgetOrWidgets, pluginId);
  }

  /**
   * Removes a registered widget by `id` (optionally scoped to `area`).
   */
  public removeWidget(id: string, area?: string): this {
    this.entries = this.entries.filter(
      (entry) =>
        !(entry.widget.id === id && (area ? entry.widget.area === area : true)),
    );
    return this;
  }

  /**
   * Resolves all enabled widgets for the given `area`, filtered by role and
   * permission requirements and sorted by `priority` (ascending, default 100).
   */
  public async getWidgets(
    area: string,
    context?: { roles?: string[]; permissions?: string[] },
  ): Promise<PluginWidget[]> {
    const resolvedAccess = context
      ? {
          userRoles: context.roles || [],
          userPermissions: context.permissions || [],
        }
      : await this.getCurrentUserAccess();

    const { userRoles, userPermissions } = resolvedAccess;
    const widgets: PluginWidget[] = [];

    for (const entry of this.entries) {
      if (!this.isEntryEnabled(entry.pluginId)) continue;

      const w = entry.widget;
      if (w.area !== area) continue;

      if (context || userRoles.length > 0 || userPermissions.length > 0) {
        if (w.roles && w.roles.length > 0) {
          if (!w.roles.some((role) => userRoles.includes(role))) {
            continue;
          }
        }
        if (w.permissions && w.permissions.length > 0) {
          if (!w.permissions.every((perm) => userPermissions.includes(perm))) {
            continue;
          }
        }
      } else {
        if (
          (w.roles && w.roles.length > 0) ||
          (w.permissions && w.permissions.length > 0)
        ) {
          continue;
        }
      }

      widgets.push(w);
    }

    return widgets.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Returns all widgets currently registered by enabled plugins.
   */
  public getAllWidgets(): PluginWidget[] {
    return this.entries
      .filter((entry) => this.isEntryEnabled(entry.pluginId))
      .map((entry) => entry.widget)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }
}

export async function getPluginWidgets(
  area: string,
  context?: { roles?: string[]; permissions?: string[] },
): Promise<PluginWidget[]> {
  return pluginsContext().widgets.getWidgets(area, context);
}
