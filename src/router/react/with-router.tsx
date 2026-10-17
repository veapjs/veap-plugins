import { app, type IHttpRequestContext, REQUEST_CONTEXT } from "@veap/kernel";
import * as React from "react";
import { buildRouteTree } from "../discovery.js";
import { VeapRouter } from "./renderer.js";

/**
 * A Higher-Order Component (HOC) that wraps a physical Next.js page component
 * with the Veap Virtual Router. This allows physical pages to inherit virtual layouts,
 * parallel slots (like @sidebar), and middleware protection from plugins.
 *
 * @example
 * ```tsx
 * import { withRouter } from "@veap/plugins/router";
 *
 * export default withRouter(async function CustomPage() {
 *    return <div>My Custom Physical Page</div>;
 * }, "/app/custom");
 * ```
 */
export interface WithRouterConfig {
  path?: string;
  roles?: string[];
  permissions?: string[];
  middlewares?: any[];
}

export function withRouter(
  Component: React.ComponentType<any>,
  configOrPath?: WithRouterConfig | string,
) {
  return async function WrappedPage(props: any) {
    const searchParams = (await props.searchParams) || {};

    const config: WithRouterConfig =
      typeof configOrPath === "string"
        ? { path: configOrPath }
        : configOrPath || {};

    let routePath = config.path;

    if (!routePath) {
      try {
        const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
        routePath = (await requestContext.getHeader("x-invoke-path")) || "/";
      } catch (_e) {
        routePath = "/";
      }
    }

    const tree = await buildRouteTree(true);

    return (
      <VeapRouter
        tree={tree}
        path={routePath || "/"}
        searchParams={searchParams}
        CustomPageComponent={Component}
        customConfig={config}
      />
    );
  };
}
