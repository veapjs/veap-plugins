import { authContext } from "@veap/auth";
import {
  Inject,
  Injectable,
  type IVeapConfigProvider,
  VEAP_CONFIG,
} from "@veap/kernel";
import { pluginsContext } from "../common/context.js";
import type {
  PluginNavElement,
  PluginNavigation,
  PluginNavigationGroupDefinition,
  PluginNavigationGroupMap,
} from "../common/types.js";
import { PluginRegistry } from "../registry/index.js";

function filterNavItem(
  item: PluginNavElement,
  userRoles: string[],
  userPermissions: string[],
): PluginNavElement | null {
  if (item.roles && item.roles.length > 0) {
    if (!item.roles.some((role) => userRoles.includes(role))) {
      return null;
    }
  }

  if (item.permissions && item.permissions.length > 0) {
    if (!item.permissions.every((perm) => userPermissions.includes(perm))) {
      return null;
    }
  }

  if (item.items && item.items.length > 0) {
    const filteredSubItems = item.items
      .map((subItem) =>
        filterNavItem(subItem as any, userRoles, userPermissions),
      )
      .filter((subItem: any): subItem is PluginNavElement => subItem !== null);

    return {
      ...item,
      items: filteredSubItems as any,
    };
  }

  return item;
}

interface PublicMenuEntry {
  pluginId?: string;
  item: PluginNavElement;
}

interface GroupedMenuEntry {
  pluginId?: string;
  groupName: string;
  priority?: number;
  items: PluginNavElement[];
}

/**
 * Service for registering and resolving plugin and application navigation menus
 * across `"public"`, `"admin"`, and `"settings"` areas.
 */
@Injectable()
export class MenuService {
  private activePluginId: string | undefined = undefined;
  private publicEntries: PublicMenuEntry[] = [];
  private groupedEntries: Record<"admin" | "settings", GroupedMenuEntry[]> = {
    admin: [],
    settings: [],
  };

  constructor(
    @Inject(PluginRegistry) private readonly registry?: PluginRegistry,
    @Inject(VEAP_CONFIG) private readonly config?: IVeapConfigProvider,
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
   * default owner for all menu registrations made during its execution.
   * Clears any previous menu items registered by `pluginId` first.
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
   * Removes all menu items registered by a specific plugin.
   */
  public clearPlugin(pluginId: string): void {
    this.publicEntries = this.publicEntries.filter(
      (entry) => entry.pluginId !== pluginId,
    );
    this.groupedEntries.admin = this.groupedEntries.admin.filter(
      (entry) => entry.pluginId !== pluginId,
    );
    this.groupedEntries.settings = this.groupedEntries.settings.filter(
      (entry) => entry.pluginId !== pluginId,
    );
  }

  /**
   * Clears all registered menu items across all areas.
   */
  public clear(): void {
    this.publicEntries = [];
    this.groupedEntries = { admin: [], settings: [] };
  }

  /**
   * Registers a single navigation item in the public menu.
   */
  public addPublicItem(item: PluginNavElement, pluginId?: string): this {
    this.publicEntries.push({
      pluginId: this.resolvePluginId(pluginId),
      item,
    });
    return this;
  }

  /**
   * Registers multiple navigation items in the public menu.
   */
  public addPublicItems(items: PluginNavElement[], pluginId?: string): this {
    for (const item of items) {
      this.addPublicItem(item, pluginId);
    }
    return this;
  }

  /**
   * Registers a navigation group (or appends items to an existing group) in the `"admin"` or `"settings"` menu.
   */
  public addGroup(
    area: "admin" | "settings",
    groupName: string,
    definition: PluginNavigationGroupDefinition | PluginNavElement[],
    pluginId?: string,
  ): this {
    const ownerId = this.resolvePluginId(pluginId);
    const items = Array.isArray(definition) ? definition : definition.items;
    const priority = Array.isArray(definition)
      ? undefined
      : definition.priority;

    this.groupedEntries[area].push({
      pluginId: ownerId,
      groupName,
      priority,
      items,
    });
    return this;
  }

  /**
   * Registers a group in the `"admin"` sidebar menu.
   */
  public addAdminGroup(
    groupName: string,
    definition: PluginNavigationGroupDefinition | PluginNavElement[],
    pluginId?: string,
  ): this {
    return this.addGroup("admin", groupName, definition, pluginId);
  }

  /**
   * Registers a group in the `"settings"` sidebar menu.
   */
  public addSettingsGroup(
    groupName: string,
    definition: PluginNavigationGroupDefinition | PluginNavElement[],
    pluginId?: string,
  ): this {
    return this.addGroup("settings", groupName, definition, pluginId);
  }

  /**
   * Registers a single navigation item under a group in the `"admin"` menu.
   */
  public addAdminItem(
    groupName: string,
    item: PluginNavElement,
    options?: { groupPriority?: number; pluginId?: string },
  ): this {
    return this.addGroup(
      "admin",
      groupName,
      {
        priority: options?.groupPriority,
        items: [item],
      },
      options?.pluginId,
    );
  }

  /**
   * Registers a single navigation item under a group in the `"settings"` menu.
   */
  public addSettingsItem(
    groupName: string,
    item: PluginNavElement,
    options?: { groupPriority?: number; pluginId?: string },
  ): this {
    return this.addGroup(
      "settings",
      groupName,
      {
        priority: options?.groupPriority,
        items: [item],
      },
      options?.pluginId,
    );
  }

  /**
   * Registers a complete `PluginNavigation` structure (`public`, `admin`, `settings`).
   */
  public register(navigation: PluginNavigation, pluginId?: string): this {
    const ownerId = this.resolvePluginId(pluginId);

    if (navigation.public) {
      this.addPublicItems(navigation.public, ownerId);
    }

    if (navigation.admin) {
      for (const [groupName, groupDef] of Object.entries(
        navigation.admin as PluginNavigationGroupMap,
      )) {
        this.addGroup("admin", groupName, groupDef, ownerId);
      }
    }

    if (navigation.settings) {
      for (const [groupName, groupDef] of Object.entries(
        navigation.settings as PluginNavigationGroupMap,
      )) {
        this.addGroup("settings", groupName, groupDef, ownerId);
      }
    }

    return this;
  }

  /**
   * Alias for `register(navigation, pluginId)`.
   */
  public registerNavigation(
    navigation: PluginNavigation,
    pluginId?: string,
  ): this {
    return this.register(navigation, pluginId);
  }

  public async getPathPrefix(): Promise<string> {
    try {
      const config = await this.config?.get();
      return config?.privatePath ?? "/app";
    } catch {
      return "/app";
    }
  }

  public async getNavigationGrouped(type: "admin" | "settings") {
    const { userRoles, userPermissions } = await this.getCurrentUserAccess();

    const groups: Record<string, PluginNavElement[]> = {};
    const groupPriorities: Record<string, number> = {};

    for (const entry of this.groupedEntries[type]) {
      if (!this.isEntryEnabled(entry.pluginId)) continue;

      const { groupName, priority, items } = entry;
      if (!groups[groupName]) groups[groupName] = [];

      if (
        priority !== undefined &&
        (groupPriorities[groupName] === undefined ||
          priority < groupPriorities[groupName])
      ) {
        groupPriorities[groupName] = priority;
      }

      for (const rawItem of items) {
        const item = filterNavItem(rawItem, userRoles, userPermissions);
        if (
          item &&
          !groups[groupName].some((existing) => existing.url === item.url)
        ) {
          groups[groupName].push(item);
        }
      }
    }

    const sortNavItems = (items: PluginNavElement[]) => {
      items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

      for (const item of items) {
        if (item.items && item.items.length > 0) {
          sortNavItems(item.items as PluginNavElement[]);
        }
      }
    };

    for (const groupName in groups) {
      sortNavItems(groups[groupName]);
    }

    return { groups, groupPriorities };
  }

  public async getVeapNavigationGrouped(type: "admin" | "settings") {
    const { groups, groupPriorities } = await this.getNavigationGrouped(type);
    const prefix = await this.getPathPrefix();

    const prefixUrl = (url: string) => {
      if (url.startsWith(prefix)) return url;
      return url === "/" ? prefix : `${prefix}${url}`;
    };

    const processItems = (items: PluginNavElement[]): PluginNavElement[] => {
      return items.map((item) => ({
        ...item,
        url: prefixUrl(item.url),
        items: item.items
          ? processItems(item.items as PluginNavElement[])
          : undefined,
      })) as PluginNavElement[];
    };

    const transformedGroups: Record<string, PluginNavElement[]> = {};

    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      const prioA = groupPriorities[a] ?? 1000;
      const prioB = groupPriorities[b] ?? 1000;
      if (prioA !== prioB) return prioA - prioB;
      return a.localeCompare(b);
    });

    for (const groupName of sortedGroupNames) {
      transformedGroups[groupName] = processItems(groups[groupName]);
    }

    return transformedGroups;
  }

  public async getPublicNavigation(): Promise<PluginNavElement[]> {
    const { userRoles, userPermissions } = await this.getCurrentUserAccess();
    const all: PluginNavElement[] = [];

    for (const entry of this.publicEntries) {
      if (!this.isEntryEnabled(entry.pluginId)) continue;
      const item = filterNavItem(entry.item, userRoles, userPermissions);
      if (item && !all.some((existing) => existing.url === item.url)) {
        all.push(item);
      }
    }

    all.sort((a, b) => {
      const prioDiff = (a.priority ?? 100) - (b.priority ?? 100);
      if (prioDiff !== 0) return prioDiff;
      return a.title.localeCompare(b.title);
    });

    return all;
  }
}

export { MenuService as NavigationService };

// ─── Module-level API (composition-bound) ───────────────────────────

export async function getPathPrefix(): Promise<string> {
  return pluginsContext().menu.getPathPrefix();
}

export async function getPluginPathPrefix(): Promise<string> {
  return pluginsContext().menu.getPathPrefix();
}

export async function getPluginNavigationGrouped(type: "admin" | "settings") {
  return pluginsContext().menu.getNavigationGrouped(type);
}

export async function getVeapPluginNavigationGrouped(
  type: "admin" | "settings",
) {
  return pluginsContext().menu.getVeapNavigationGrouped(type);
}

export async function getPluginNavigation(
  _type: "public" = "public",
): Promise<PluginNavElement[]> {
  return pluginsContext().menu.getPublicNavigation();
}
