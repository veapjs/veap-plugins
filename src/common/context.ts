import { AppError } from "@veap/kernel";
import type { MenuService } from "../navigation/navigation.service.js";
import type { PluginRegistry } from "../registry/registry.service.js";
import type { RouterService } from "../router/router.service.js";
import type { ExtensionService } from "../widgets/extension.service.js";
import type { WidgetService } from "../widgets/widget.service.js";

/**
 * Typed boundary between the plugins use cases and the modules that consume
 * them (facades, menu/navigation, widgets, extensions, router, intl, presentation components).
 */
export interface PluginsContext {
  registry: PluginRegistry;
  menu: MenuService;
  navigation: MenuService;
  widgets: WidgetService;
  extensions: ExtensionService;
  router?: RouterService;
}

const globalForPluginsContext = globalThis as unknown as {
  __VEAP_PLUGINS_CONTEXT__?: PluginsContext;
};

/**
 * Binds the resolved plugins services. Called once by the composition root.
 */
export function bindPluginsContext(
  context: Omit<
    PluginsContext,
    "menu" | "navigation" | "widgets" | "extensions"
  > & {
    menu?: MenuService;
    navigation?: MenuService;
    widgets?: WidgetService;
    extensions?: ExtensionService;
  },
): void {
  const menu = (context.menu ?? context.navigation) as MenuService;
  const widgets = (context.widgets ?? ({} as WidgetService)) as WidgetService;
  const extensions = (context.extensions ??
    ({} as ExtensionService)) as ExtensionService;
  globalForPluginsContext.__VEAP_PLUGINS_CONTEXT__ = {
    ...context,
    menu,
    navigation: menu,
    widgets,
    extensions,
  };
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
