/**
 * @module router
 * @description Virtual Router API for Veap Plugin system.
 */

export { ROUTER_SERVICE, SITE_LAYOUT } from "../common/tokens.js";
export {
  addRouteRewrite,
  buildRouteTree,
  getModulesWithHomepage,
  getPluginsWithHomepage,
  getRouteRewrites,
  matchRoute,
} from "./discovery.js";
export { handleVeapApiRequest } from "./handler.js";
export { matchRoute as matchVirtualRoute } from "./matcher.js";
export {
  ApiEnsuredAuth,
  ApiSameOrigin,
  EnsuredAuth,
  EnsuredGuest,
  EnsuredUser,
  runApiPipeline,
  runPipeline,
  SameOrigin,
  SkipSecurity,
} from "./middlewares.js";
export {
  RouterErrorBoundary,
  SoftNavigationInterceptor,
  VeapRouter,
  type WithRouterConfig,
  withRouter,
} from "./react/index.js";
export {
  extractParamName,
  isCatchAllSegment,
  isDynamicSegment,
  isGroupSegment,
  isOptionalCatchAllSegment,
  isParallelSlot,
  type LayoutChainEntry,
  type MatchResult,
  type RouteNode,
  RouteTree,
  resolveMagicPrefix,
  segmentMatchesUrlPart,
} from "./route-tree.js";
export { RouterService } from "./router.service.js";
export {
  discoverRoutes,
  generateRouteManifest,
  globToTree,
} from "./scanner.js";
export {
  collectApiMiddlewares,
  collectAuthRequirements,
  collectMiddlewares,
} from "./utils.js";
