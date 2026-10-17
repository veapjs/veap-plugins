import type { Token } from "@veap/kernel";
import type { MenuService } from "../navigation/navigation.service.js";
import type { RouterService } from "../router/router.service.js";
import type { ExtensionService } from "../widgets/extension.service.js";
import type { WidgetService } from "../widgets/widget.service.js";

/**
 * IoC Token for the application plugins array.
 */
export const APP_PLUGINS: Token<any[]> = Symbol.for("veap:kernel:app-plugins");

/**
 * IoC Token for the MenuService.
 */
export const MENU_SERVICE: Token<MenuService> = Symbol.for(
  "veap:plugins:menu-service",
);

/**
 * IoC Token for the WidgetService.
 */
export const WIDGET_SERVICE: Token<WidgetService> = Symbol.for(
  "veap:plugins:widget-service",
);

/**
 * IoC Token for the ExtensionService.
 */
export const EXTENSION_SERVICE: Token<ExtensionService> = Symbol.for(
  "veap:plugins:extension-service",
);

/**
 * IoC Token for the virtual RouterService.
 */
export const ROUTER_SERVICE: Token<RouterService> = Symbol.for(
  "veap:router:service",
);

/**
 * IoC Token for the main site layout component.
 */
export const SITE_LAYOUT: Token<any> = Symbol.for("veap:router:site-layout");
