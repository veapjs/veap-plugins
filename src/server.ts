// Server Navigation & Breadcrumbs

// Server Actions
export * from "./actions.js";
export { PluginManifestSchema as ModuleManifestSchema } from "./common/types.js";
export * from "./index.js";
export * from "./navigation/index.js";
export {
  getPathPrefix,
  getPluginBreadcrumbs as getBreadcrumbs,
  getPluginNavigation as getPublicNavigation,
  getVeapPluginNavigationGrouped as getVeapModuleNavigationGrouped,
} from "./navigation/index.js";
// Core: Registry
export * from "./registry/index.js";
// Core: Compatibility Aliases
export {
  applyPluginFilters as applyFilters,
  getPluginConfig as getModuleConfig,
  getPluginStatus as getModule,
  getPluginStatus as getModuleStatus,
  getPluginsStatus as getModules,
  hasPluginExtension as hasExtension,
  hasPluginHooks as hasHooks,
  togglePluginState as toggleModuleState,
  updatePluginConfig as updateModuleConfig,
} from "./registry/index.js";
// Router Server
export * from "./router.js";
// UI (Server versions)
export {
  ExtensionService,
  getPluginExtensions,
} from "./widgets/extension.service.js";
export {
  ExtensionPoint,
  PluginExtensionPoint,
} from "./widgets/plugin-extension-point.js";
export {
  PluginWidgetArea,
  WidgetArea,
} from "./widgets/plugin-widget-area.js";
export { getPluginWidgets, WidgetService } from "./widgets/widget.service.js";
export { WidgetComposer } from "./widgets/widget-composer.js";
