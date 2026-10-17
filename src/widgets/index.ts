export { ExtensionService, getPluginExtensions } from "./extension.service.js";
export {
  PathPrefixContext,
  usePathPrefix,
} from "./path-prefix-context.js";
export {
  ExtensionPoint,
  PluginExtensionPoint,
  type PluginExtensionPointProps,
} from "./plugin-extension-point.js";
export {
  ExtensionPointClient,
  PluginExtensionPointClient,
  type PluginExtensionPointClientProps,
  usePluginExtensions,
} from "./plugin-extension-point-client.js";
export {
  PluginWidgetArea,
  WidgetArea,
} from "./plugin-widget-area.js";
export {
  PluginWidgetAreaClient,
  usePluginWidgets,
  WidgetAreaClient,
} from "./plugin-widget-area-client.js";
export {
  type ConfirmOptions,
  type ConfirmResult,
  useConfirmAction,
} from "./use-confirm-action.js";
export { getPluginWidgets, WidgetService } from "./widget.service.js";
export { WidgetComposer } from "./widget-composer.js";
export { WidgetComposerClient } from "./widget-composer-client.js";
