import type { IPlugin } from "../common/index.js";
import { pluginsContext } from "../common/index.js";
import { PluginRegistry } from "./registry.service.js";

/**
 * Module-level helpers over the {@link PluginRegistry}.
 *
 * They read the composition-bound plugins context instead of resolving
 * services from the IoC container themselves.
 */

export const registerPlugins = async (plugins: IPlugin[]) => {
  const registry = pluginsContext().registry;
  for (const plugin of plugins) registry.register(plugin);
};

export const ensurePluginsInitialized = async () => {
  await pluginsContext().registry.init();
};

export const applyPluginFilters = async <T = any>(
  point: string,
  data: T,
  /** Optional context (e.g. { userId }) passed to handlers as 2nd argument. */
  context?: any,
): Promise<T> => {
  const hooks = await pluginsContext().registry.getHooks(point);
  let result = data;
  for (const hook of hooks) {
    const fn = hook.handler ?? (hook as any).callback;
    if (typeof fn === "function") {
      result = await fn(result, context);
    }
  }
  return result;
};

export const togglePluginState = async (
  id: string,
  enabled: boolean,
  context?: any,
) => {
  await pluginsContext().registry.togglePlugin(id, enabled, context);
};

export const hasPluginHooks = async (point: string) => {
  return pluginsContext().registry.hasHooks(point);
};

export const hasPluginExtension = async (target: string, point?: string) => {
  const ctx = pluginsContext();
  if (ctx.extensions?.hasExtension) {
    return ctx.extensions.hasExtension(target, point);
  }
  return ctx.registry.hasExtension(target, point);
};

export const getPluginConfig = async <T = any>(id: string) => {
  return pluginsContext().registry.getConfig<T>(id);
};

export const updatePluginConfig = async (id: string, config: any) => {
  await pluginsContext().registry.updateConfig(id, config);
};

export const getPluginsStatus = async () => {
  return pluginsContext().registry.getPluginsStatus();
};

export const getPluginStatus = async (id: string) => {
  return pluginsContext().registry.getPluginStatus(id);
};
