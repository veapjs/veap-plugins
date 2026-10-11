import { AppError } from "@veap/kernel";
import type { NavigationService } from "../navigation/navigation.service";
import type { PluginRegistry } from "../registry/registry.service";
import type { RouterService } from "../router/router.service";

/**
 * Typed boundary between the plugins use cases and the modules that consume
 * them (facades, navigation, router, intl, presentation components).
 */
export interface PluginsContext {
  registry: PluginRegistry;
  navigation: NavigationService;
  router?: RouterService;
}

const globalForPluginsContext = globalThis as unknown as {
  __VEAP_PLUGINS_CONTEXT__?: PluginsContext;
};

/**
 * Binds the resolved plugins services. Called once by the composition root.
 */
export function bindPluginsContext(context: PluginsContext): void {
  globalForPluginsContext.__VEAP_PLUGINS_CONTEXT__ = context;
}

/**
 * Returns true if the plugins context has been bound by PluginsServiceProvider.
 */
export function isPluginsContextBound(): boolean {
  return Boolean(globalForPluginsContext.__VEAP_PLUGINS_CONTEXT__);
}

/**
 * Returns the bound plugins services.
 *
 * @throws If the plugins service provider has not booted yet.
 */
export function pluginsContext(): PluginsContext {
  const context = globalForPluginsContext.__VEAP_PLUGINS_CONTEXT__;
  if (!context) {
    throw AppError.Internal(
      "[Plugins] Context is not bound. PluginsServiceProvider must boot before the plugins facades are used.",
    );
  }
  return context;
}
