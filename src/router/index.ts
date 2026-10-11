/**
 * @module router
 * @description Virtual Router API for Veap Plugin system.
 */

export {
  addRouteRewrite,
  buildRouteTree,
  getModulesWithHomepage,
  getPluginsWithHomepage,
  getRouteRewrites,
  matchRoute,
} from "./discovery";
export { handleVeapApiRequest } from "./handler";
export { matchRoute as matchVirtualRoute } from "./matcher";
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
} from "./middlewares";
export {
  RouterErrorBoundary,
  SoftNavigationInterceptor,
  VeapRouter,
  type WithRouterConfig,
  withRouter,
} from "./react";
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
} from "./route-tree";
export { RouterService } from "./router.service";
export {
  discoverRoutes,
  generateRouteManifest,
  globToTree,
} from "./scanner";
export {
  collectApiMiddlewares,
  collectAuthRequirements,
  collectMiddlewares,
} from "./utils";
