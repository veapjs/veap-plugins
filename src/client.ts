"use client";

export { notifyPluginsChanged, onPluginsChanged } from "./common/events.js";
export {
  PathPrefixContext,
  usePathPrefix,
} from "./widgets/path-prefix-context.js";
// Compatibility Aliases & Client Widgets
export {
  ExtensionPointClient,
  PluginExtensionPointClient,
  usePluginExtensions,
} from "./widgets/plugin-extension-point-client.js";
export {
  PluginWidgetAreaClient,
  usePluginWidgets,
  WidgetAreaClient,
} from "./widgets/plugin-widget-area-client.js";
export {
  type ConfirmOptions,
  type ConfirmResult,
  useConfirmAction,
} from "./widgets/use-confirm-action.js";
export { WidgetComposerClient } from "./widgets/widget-composer-client.js";
