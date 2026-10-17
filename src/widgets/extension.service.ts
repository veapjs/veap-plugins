import { Inject, Injectable } from "@veap/kernel";
import { pluginsContext } from "../common/context.js";
import type { PluginExtension } from "../common/types.js";
import { PluginRegistry } from "../registry/index.js";

interface ExtensionEntry {
  pluginId?: string;
  extension: PluginExtension;
}

/**
 * Service for registering and resolving plugin and application UI extension points.
 */
@Injectable()
export class ExtensionService {
  private activePluginId: string | undefined = undefined;
  private entries: ExtensionEntry[] = [];

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

  /**
   * Executes a callback (such as `plugin.init()`) with `pluginId` bound as the
   * default owner for all extension registrations made during its execution.
   * Clears any previous extensions registered by `pluginId` first.
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
   * Removes all extensions registered by a specific plugin.
   */
  public clearPlugin(pluginId: string): void {
    this.entries = this.entries.filter((entry) => entry.pluginId !== pluginId);
  }

  /**
   * Clears all registered extensions across all targets and points.
   */
  public clear(): void {
    this.entries = [];
  }

  /**
   * Registers a single extension definition.
   * If an extension with the same `id`, `target`, and `point` is already registered, it is replaced.
   */
  public addExtension(extension: PluginExtension, pluginId?: string): this {
    const ownerId = this.resolvePluginId(pluginId);
    const existingIndex = this.entries.findIndex(
      (entry) =>
        entry.extension.id === extension.id &&
        entry.extension.target === extension.target &&
        entry.extension.point === extension.point,
    );

    if (existingIndex !== -1) {
      this.entries[existingIndex] = { pluginId: ownerId, extension };
    } else {
      this.entries.push({ pluginId: ownerId, extension });
    }

    return this;
  }

  /**
   * Registers multiple extension definitions.
   */
  public addExtensions(extensions: PluginExtension[], pluginId?: string): this {
    for (const extension of extensions) {
      this.addExtension(extension, pluginId);
    }
    return this;
  }

  /**
   * Registers a single extension or an array of extensions.
   */
  public register(
    extensionOrExtensions: PluginExtension | PluginExtension[],
    pluginId?: string,
  ): this {
    if (Array.isArray(extensionOrExtensions)) {
      return this.addExtensions(extensionOrExtensions, pluginId);
    }
    return this.addExtension(extensionOrExtensions, pluginId);
  }

  /**
   * Removes a registered extension by `id` (optionally scoped to `target` and `point`).
   */
  public removeExtension(id: string, target?: string, point?: string): this {
    this.entries = this.entries.filter(
      (entry) =>
        !(
          entry.extension.id === id &&
          (target ? entry.extension.target === target : true) &&
          (point ? entry.extension.point === point : true)
        ),
    );
    return this;
  }

  /**
   * Resolves all extensions for the given `target` and `point`, filtered by
   * plugin enabled status (unless `includeDisabled` is true), role and permission
   * requirements, and sorted by `priority` (ascending, default 100).
   */
  public async getExtensions(
    target: string,
    point: string,
    includeDisabled = false,
    context?: { roles?: string[]; permissions?: string[] },
  ): Promise<PluginExtension[]> {
    const extensions: PluginExtension[] = [];

    for (const entry of this.entries) {
      if (!includeDisabled && !this.isEntryEnabled(entry.pluginId)) {
        continue;
      }

      const e = entry.extension;
      if (e.target !== target || e.point !== point) continue;

      if (context) {
        const userRoles = context.roles || [];
        const userPermissions = context.permissions || [];
        if (e.roles && e.roles.length > 0) {
          if (!e.roles.some((role) => userRoles.includes(role))) {
            continue;
          }
        }
        if (e.permissions && e.permissions.length > 0) {
          if (!e.permissions.every((perm) => userPermissions.includes(perm))) {
            continue;
          }
        }
      }

      extensions.push(e);
    }

    return extensions.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Checks whether at least one extension is registered for `target` (and optional `point`).
   */
  public async hasExtension(
    target: string,
    point?: string,
    includeDisabled = false,
  ): Promise<boolean> {
    return this.entries.some((entry) => {
      if (!includeDisabled && !this.isEntryEnabled(entry.pluginId)) {
        return false;
      }
      const e = entry.extension;
      return e.target === target && (point ? e.point === point : true);
    });
  }
}

export async function getPluginExtensions(
  target: string,
  point: string,
  includeDisabled = false,
  context?: { roles?: string[]; permissions?: string[] },
): Promise<PluginExtension[]> {
  return pluginsContext().extensions.getExtensions(
    target,
    point,
    includeDisabled,
    context,
  );
}
