"use client";

export { notifyPluginsChanged, onPluginsChanged } from "./common/events";
export {
  PathPrefixContext,
  usePathPrefix,
} from "./widgets/path-prefix-context";
// Compatibility Aliases & Client Widgets
export {
  ExtensionPointClient,
  PluginExtensionPointClient,
  usePluginExtensions,
} from "./widgets/plugin-extension-point-client";
export {
  PluginWidgetAreaClient,
  usePluginWidgets,
  WidgetAreaClient,
} from "./widgets/plugin-widget-area-client";
export {
  type ConfirmOptions,
  type ConfirmResult,
  useConfirmAction,
} from "./widgets/use-confirm-action";
export { WidgetComposerClient } from "./widgets/widget-composer-client";
