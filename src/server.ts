// Server Navigation & Breadcrumbs

// Server Actions
export * from "./actions";
export { PluginManifestSchema as ModuleManifestSchema } from "./common/types";
export * from "./index";
export * from "./navigation";
export {
  getPathPrefix,
  getPluginBreadcrumbs as getBreadcrumbs,
  getPluginNavigation as getPublicNavigation,
  getVeapPluginNavigationGrouped as getVeapModuleNavigationGrouped,
} from "./navigation";
// Core: Registry
export * from "./registry";
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
} from "./registry";
// Router Server
export * from "./router";
// UI (Server versions)
export {
  ExtensionPoint,
  PluginExtensionPoint,
} from "./widgets/plugin-extension-point";
export {
  PluginWidgetArea,
  WidgetArea,
} from "./widgets/plugin-widget-area";
export { WidgetComposer } from "./widgets/widget-composer";
