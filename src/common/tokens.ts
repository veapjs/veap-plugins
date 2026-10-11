import type { Token } from "@veap/kernel";
import type { RouterService } from "../router/router.service.js";

/**
 * IoC Token for the application plugins array.
 */
export const APP_PLUGINS: Token<any[]> = Symbol.for("veap:kernel:app-plugins");

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
