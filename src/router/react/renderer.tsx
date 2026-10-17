import { eventBus } from "@veap/kernel/events";

import * as React from "react";
import type { VeapMiddlewareContext } from "../../common/types.js";
import { EnsuredAuth, runPipeline, SkipSecurity } from "../middlewares.js";
import type { MatchResult, RouteNode, RouteTree } from "../route-tree.js";
import { collectAuthRequirements, collectMiddlewares } from "../utils.js";
import { RouterErrorBoundary } from "./error-boundary.js";
import { SoftNavigationInterceptor } from "./soft-navigation.js";

// ---------------------------------------------------------------------------
// Parallel slot resolution
// ---------------------------------------------------------------------------

async function resolveParallelSlot(
  slotTree: RouteNode,
  path: string,
  searchParams: Record<string, any>,
  params: Record<string, string>,
  _slotName: string,
  context: VeapMiddlewareContext,
): Promise<React.ReactNode> {
  const { RouteTree: RouteTreeClass } = await import("../route-tree");
  const tempTree = new RouteTreeClass(slotTree);
  const slotMatch = tempTree.match(path);

  if (slotMatch?.node.page) {
    const SlotPage = slotMatch.node.page;
    const mergedParams = { ...params, ...slotMatch.params };
    return (
      <SlotPage
        params={mergedParams}
        searchParams={searchParams}
        context={context}
      />
    );
  }

  if (slotTree.default) {
    const DefaultComponent = slotTree.default;
    return (
      <DefaultComponent
        params={params}
        searchParams={searchParams}
        context={context}
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parallel slots resolver (all slots for a layout entry)
// ---------------------------------------------------------------------------

async function resolveAllParallelSlots(
  parallelSlots: Record<string, RouteNode> | undefined,
  path: string,
  searchParams: Record<string, any>,
  params: Record<string, string>,
  context: VeapMiddlewareContext,
): Promise<Record<string, React.ReactNode>> {
  if (!parallelSlots || Object.keys(parallelSlots).length === 0) {
    return {};
  }

  const entries = await Promise.all(
    Object.entries(parallelSlots).map(async ([slotName, slotNode]) => {
      const rendered = await resolveParallelSlot(
        slotNode,
        path,
        searchParams,
        params,
        slotName,
        context,
      );
      return [slotName, rendered] as const;
    }),
  );

  const result: Record<string, React.ReactNode> = {};
  for (const [name, node] of entries) {
    result[name] = node;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export async function VeapRouter({
  tree,
  path,
  searchParams,
  CustomPageComponent,
  customConfig,
}: {
  tree: RouteTree;
  path: string;
  searchParams: Record<string, any>;
  CustomPageComponent?: React.ComponentType<any>;
  customConfig?: {
    roles?: string[];
    permissions?: string[];
    middlewares?: any[];
  };
}): Promise<React.ReactNode> {
  const match = tree.match(path);

  if (process.env.NODE_ENV !== "production") {
    eventBus
      .publish("router:request", {
        path,
        searchParams,
        params: match?.params || {},
        matchedNode: match?.node?.segment || "/",
        timestamp: Date.now(),
      })
      .catch(() => {});
  }

  if (!match) {
    console.warn("[veap:Router] [renderer] match should never be null");
    throw new Error(
      `[VeapRouter] Invariant failed: match should never be null`,
    );
  }

  const allMiddlewares = collectMiddlewares(match.layoutChain, match.node);
  const auth = collectAuthRequirements(match.layoutChain, match.node);

  if (customConfig) {
    if (customConfig.roles?.length) {
      auth.roles.push(...customConfig.roles);
      auth.needsAuth = true;
    }
    if (customConfig.permissions?.length) {
      auth.permissions.push(...customConfig.permissions);
      auth.needsAuth = true;
    }
    if (customConfig.middlewares?.length) {
      allMiddlewares.push(...customConfig.middlewares);
    }
  }

  if (auth.needsAuth && !allMiddlewares.includes(SkipSecurity)) {
    allMiddlewares.unshift(EnsuredAuth);
  }

  const context: VeapMiddlewareContext = {
    params: match.params,
    searchParams,
    path,
    roles: auth.roles.length > 0 ? auth.roles : undefined,
    permissions: auth.permissions.length > 0 ? auth.permissions : undefined,
  };

  return runPipeline(allMiddlewares, context, async (ctx) => {
    return buildLayoutTree(match, searchParams, path, ctx, CustomPageComponent);
  });
}

// ---------------------------------------------------------------------------
// Layout tree builder
// ---------------------------------------------------------------------------

async function buildLayoutTree(
  match: MatchResult,
  searchParams: Record<string, any>,
  path: string,
  context: VeapMiddlewareContext,
  CustomPageComponent?: React.ComponentType<any>,
): Promise<React.ReactNode> {
  const { node, params, layoutChain } = match;

  const { getPluginBreadcrumbs: getBreadcrumbs } = await import(
    "../../navigation/breadcrumbs"
  );

  const breadcrumbs = await getBreadcrumbs(path, searchParams);

  let content: React.ReactNode;

  if (CustomPageComponent) {
    content = (
      <CustomPageComponent
        params={params}
        searchParams={searchParams}
        breadcrumbs={breadcrumbs}
        context={context}
      />
    );
  } else if (match.isExact && node.page) {
    const Page = node.page;
    content = (
      <Page
        params={params}
        searchParams={searchParams}
        breadcrumbs={breadcrumbs}
        context={context}
      />
    );
  } else {
    let NotFound = node.notFound;

    if (!NotFound) {
      for (let i = layoutChain.length - 1; i >= 0; i--) {
        if (layoutChain[i].notFound) {
          NotFound = layoutChain[i].notFound;
          break;
        }
      }
    }

    if (NotFound) {
      content = <NotFound />;
    } else {
      content = (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h1
              style={{ fontSize: "3rem", fontWeight: 700, margin: "0 0 1rem" }}
            >
              404
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#6b7280" }}>
              Page not found:{" "}
              <code
                style={{
                  padding: "0.125rem 0.375rem",
                  borderRadius: "0.25rem",
                  backgroundColor: "#f3f4f6",
                  fontSize: "0.875rem",
                }}
              >
                {path}
              </code>
            </p>
          </div>
        </div>
      );
    }
  }

  if (node.error) {
    content = <RouterErrorBoundary>{content}</RouterErrorBoundary>;
  }

  const reversedChain = [...layoutChain].reverse();

  for (const entry of reversedChain) {
    if (entry.error) {
      content = (
        <RouterErrorBoundary
          key={`error-${entry.consumedPath || entry.id || "root"}`}
        >
          {content}
        </RouterErrorBoundary>
      );
    }

    if (entry.loading) {
      const Loading = entry.loading;
      content = (
        <React.Suspense
          key={`suspense-${entry.consumedPath || entry.id || "root"}`}
          fallback={<Loading />}
        >
          {content}
        </React.Suspense>
      );
    }

    if (entry.layout) {
      const Layout = entry.layout;

      const consumedCount = entry.consumedPath
        ? entry.consumedPath.split("/").filter(Boolean).length
        : 0;
      const remainingSegments = match.matchedSegments.slice(consumedCount);
      const remainingPath = remainingSegments.join("/") || "/";

      const resolvedSlots = await resolveAllParallelSlots(
        entry.parallelSlots,
        remainingPath,
        searchParams,
        params,
        context,
      );

      content = (
        <Layout params={params} context={context} {...resolvedSlots}>
          {content}
        </Layout>
      );
    }
  }

  return <SoftNavigationInterceptor>{content}</SoftNavigationInterceptor>;
}
