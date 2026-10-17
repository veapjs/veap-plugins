/**
 * @module route-tree
 * @description Core route tree engine for the Veap unstable custom router.
 *
 * Implements a tree-based routing structure that mirrors Next.js App Router
 * file conventions. Supports static, dynamic, catch-all, optional catch-all,
 * route group, and parallel route segments.
 *
 * @example
 * ```ts
 * const tree = new RouteTree();
 * tree.addTree({
 *   segment: "",
 *   layout: RootLayout,
 *   children: [
 *     { segment: "blog", page: BlogPage, children: [
 *       { segment: "[slug]", page: BlogPostPage },
 *     ]},
 *   ],
 * });
 *
 * const result = tree.match("/blog/hello-world");
 * // result.params => { slug: "hello-world" }
 * ```
 */

import type { UserPermission, UserRole } from "@veap/auth";
/**
 * Framework-agnostic metadata shape for route nodes.
 * Compatible with Next.js Metadata and standard HTML meta tags.
 */
export interface VeapMetadata {
  title?: string | { default: string; template?: string; absolute?: string };
  description?: string;
  keywords?: string | string[];
  authors?: Array<{ name?: string; url?: string }>;
  creator?: string;
  publisher?: string;
  robots?: any;
  icons?: any;
  openGraph?: any;
  twitter?: any;
  alternates?: any;
  other?: Record<string, string | number | (string | number)[]>;
  [key: string]: any;
}

export type Metadata = VeapMetadata;

import type * as React from "react";
import type {
  ApiMiddleware,
  BreadcrumbValue,
  VeapMiddleware,
} from "../common/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single node in the route tree. Mirrors Next.js App Router file conventions.
 * Each node represents a URL segment and can contain page/layout/loading/error
 * components, metadata generators, middleware pipelines, and auth constraints.
 */
export interface RouteNode {
  /**
   * Segment of the path.
   * - Regular: `"blog"`, `"about"`
   * - Dynamic: `"[id]"`, `"[slug]"`
   * - Catch-all: `"[...path]"`
   * - Optional catch-all: `"[[...path]]"`
   * - Route group: `"(marketing)"` - transparent in URL
   * - Empty string `""` for root/index
   */
  segment: string;

  /** Page component - equivalent to `page.tsx`. */
  page?: React.ComponentType<any>;

  /** Layout wrapping children - equivalent to `layout.tsx`. */
  layout?: React.ComponentType<{
    children: React.ReactNode;
    params?: any;
    [slotName: string]: any;
  }>;

  /** Loading component - equivalent to `loading.tsx`. */
  loading?: React.ComponentType;

  /** Error component - equivalent to `error.tsx` (client component). */
  error?: React.ComponentType<{ error: Error; reset: () => void }>;

  /** Not-found component - equivalent to `not-found.tsx`. */
  notFound?: React.ComponentType;

  /** Default component for parallel route slots - equivalent to `default.tsx`. */
  default?: React.ComponentType<any>;

  /** API route handlers - equivalent to `route.ts`. Contains exported HTTP methods like GET, POST, etc. */
  route?: {
    GET?: Function;
    POST?: Function;
    PUT?: Function;
    DELETE?: Function;
    PATCH?: Function;
    OPTIONS?: Function;
    HEAD?: Function;
    [key: string]: any;
  };

  /**
   * Metadata generator for this route node.
   * Called with params and searchParams to produce `<head>` metadata.
   */
  generateMetadata?: (props: {
    params: Record<string, string>;
    searchParams: Record<string, string>;
  }) => Promise<Metadata> | Metadata;

  /** Middleware pipeline applied when this node is part of the matched chain. */
  middlewares?: (VeapMiddleware | ApiMiddleware)[] | any[];

  /** Whether authentication is required to access this route. */
  auth?: boolean;

  /** Roles required to access this route (RBAC). */
  roles?: UserRole[];

  /** Permissions required to access this route (RBAC). */
  permissions?: UserPermission[];

  /** Breadcrumb configuration for this route node. */
  breadcrumb?: BreadcrumbValue;

  /** Route ID for template overrides and programmatic identification. */
  id?: string;

  /** Child route nodes. */
  children?: RouteNode[];

  /**
   * Parallel route slots: `@slotName` → subtree.
   * Parallel routes are resolved independently against the same URL path.
   */
  parallelRoutes?: Record<string, RouteNode>;
}

/**
 * Represents a single entry in the layout chain collected during route matching.
 * Each entry captures the layout, loading, error, middleware, and auth config
 * from one level of the tree as we walk from root to the matched leaf.
 */
export interface LayoutChainEntry {
  /** Layout component at this level. */
  layout?: React.ComponentType<any>;

  /** Loading component at this level. */
  loading?: React.ComponentType;

  /** Error component at this level. */
  error?: React.ComponentType<{ error: Error; reset: () => void }>;

  /** NotFound component at this level. */
  notFound?: React.ComponentType;

  /** Middleware pipeline at this level. */
  middlewares?: (VeapMiddleware | ApiMiddleware)[] | any[];

  /** Whether authentication is required at this level. */
  auth?: boolean;

  /** Roles required at this level. */
  roles?: UserRole[];

  /** Permissions required at this level. */
  permissions?: UserPermission[];

  /** Resolved parallel slot contents for this layout level. */
  parallelSlots?: Record<string, RouteNode>;

  /** The path segments consumed up to this layout level. Used for parallel route matching. */
  consumedPath?: string;

  /** Route ID for template overrides. */
  id?: string;
}

/**
 * Result of matching a URL path against the route tree.
 */
export interface MatchResult {
  /** The matched leaf node (has a `page` component). */
  node: RouteNode;

  /** Extracted URL parameters (dynamic segments, catch-all, etc.). */
  params: Record<string, string>;

  /** Chain of layouts from root to the matched node. */
  layoutChain: LayoutChainEntry[];

  /** Path segments that were matched (for debugging/breadcrumbs). */
  matchedSegments: string[];

  /** True if the path was fully consumed and matched a leaf node (page). False for partial matches. */
  isExact: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment classification helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isGroupSegment(segment: string): boolean {
  return /^\(.+\)$/.test(segment);
}

export function isDynamicSegment(segment: string): boolean {
  return /^\[[^[\].]+\]$/.test(segment);
}

export function isCatchAllSegment(segment: string): boolean {
  return /^\[\.\.\..+\]$/.test(segment);
}

export function isOptionalCatchAllSegment(segment: string): boolean {
  return /^\[\[\.\.\..+\]\]$/.test(segment);
}

export function isParallelSlot(segment: string): boolean {
  return /^@.+$/.test(segment);
}

export function extractParamName(segment: string): string {
  if (isOptionalCatchAllSegment(segment)) {
    return segment.slice(5, -2);
  }
  if (isCatchAllSegment(segment)) {
    return segment.slice(4, -1);
  }
  if (isDynamicSegment(segment)) {
    return segment.slice(1, -1);
  }
  return segment;
}

export function segmentMatchesUrlPart(
  segment: string,
  urlPart: string,
): boolean {
  if (isGroupSegment(segment)) {
    return false;
  }
  if (isDynamicSegment(segment)) {
    return urlPart.length > 0;
  }
  if (isCatchAllSegment(segment) || isOptionalCatchAllSegment(segment)) {
    return false;
  }
  return segment === urlPart;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function createRootNode(): RouteNode {
  return { segment: "", children: [] };
}

function hasLayoutChainContent(node: RouteNode): boolean {
  return !!(
    node.layout ||
    node.loading ||
    node.error ||
    node.notFound ||
    (node.middlewares && node.middlewares.length > 0) ||
    node.auth !== undefined ||
    (node.roles && node.roles.length > 0) ||
    (node.permissions && node.permissions.length > 0) ||
    (node.parallelRoutes && Object.keys(node.parallelRoutes).length > 0) ||
    isGroupSegment(node.segment)
  );
}

function buildChainEntry(
  node: RouteNode,
  consumedSegments: string[],
): LayoutChainEntry {
  const entry: LayoutChainEntry = {};

  if (node.layout) entry.layout = node.layout;
  if (node.loading) entry.loading = node.loading;
  if (node.error) entry.error = node.error;
  if (node.notFound) entry.notFound = node.notFound;
  if (node.middlewares?.length) entry.middlewares = node.middlewares;
  if (node.id !== undefined) entry.id = node.id;
  if (node.auth !== undefined) entry.auth = node.auth;
  if (node.roles?.length) entry.roles = node.roles;
  if (node.permissions?.length) entry.permissions = node.permissions;
  if (node.parallelRoutes && Object.keys(node.parallelRoutes).length > 0) {
    entry.parallelSlots = node.parallelRoutes;
  }

  entry.consumedPath = consumedSegments.join("/");

  return entry;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function ensureChild(parent: RouteNode, segment: string): RouteNode {
  if (!parent.children) {
    parent.children = [];
  }

  const existing = parent.children.find((c) => c.segment === segment);
  if (existing) {
    return existing;
  }

  const child: RouteNode = { segment, children: [] };
  parent.children.push(child);
  return child;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive matching
// ─────────────────────────────────────────────────────────────────────────────

interface InternalMatchResult {
  node: RouteNode;
  params: Record<string, string>;
  layoutChain: LayoutChainEntry[];
  matchedSegments: string[];
}

function matchRecursive(
  node: RouteNode,
  remainingSegments: string[],
  currentParams: Record<string, string>,
  currentChain: LayoutChainEntry[],
  currentMatched: string[],
  bestPartialMatch?: { depth: number; result: InternalMatchResult | null },
): InternalMatchResult | null {
  if (bestPartialMatch && currentMatched.length > bestPartialMatch.depth) {
    bestPartialMatch.depth = currentMatched.length;
    bestPartialMatch.result = {
      node,
      params: { ...currentParams },
      layoutChain: [...currentChain],
      matchedSegments: [...currentMatched],
    };
  }

  const children = node.children ?? [];

  if (remainingSegments.length === 0) {
    if (node.page || node.route) {
      return {
        node,
        params: { ...currentParams },
        layoutChain: [...currentChain],
        matchedSegments: [...currentMatched],
      };
    }

    for (const child of children) {
      if (child.segment === "" && (child.page || child.route)) {
        const entry = buildChainEntry(child, currentMatched);
        return {
          node: child,
          params: { ...currentParams },
          layoutChain: [...currentChain, entry],
          matchedSegments: [...currentMatched],
        };
      }
    }

    for (const child of children) {
      if (isGroupSegment(child.segment)) {
        const groupEntry = buildChainEntry(child, currentMatched);
        const groupResult = matchRecursive(
          child,
          [],
          currentParams,
          [...currentChain, groupEntry],
          currentMatched,
          bestPartialMatch,
        );
        if (groupResult) return groupResult;
      }
    }

    for (const child of children) {
      if (
        isOptionalCatchAllSegment(child.segment) &&
        (child.page || child.route)
      ) {
        const paramName = extractParamName(child.segment);
        const entry = buildChainEntry(child, currentMatched);
        return {
          node: child,
          params: { ...currentParams, [paramName]: "" },
          layoutChain: [...currentChain, entry],
          matchedSegments: [...currentMatched],
        };
      }
    }

    return null;
  }

  const [currentSegment, ...rest] = remainingSegments;

  for (const child of children) {
    if (
      !isGroupSegment(child.segment) &&
      !isDynamicSegment(child.segment) &&
      !isCatchAllSegment(child.segment) &&
      !isOptionalCatchAllSegment(child.segment) &&
      child.segment === currentSegment
    ) {
      const nextChain = hasLayoutChainContent(child)
        ? [
            ...currentChain,
            buildChainEntry(child, [...currentMatched, currentSegment]),
          ]
        : currentChain;
      const result = matchRecursive(
        child,
        rest,
        currentParams,
        nextChain,
        [...currentMatched, currentSegment],
        bestPartialMatch,
      );
      if (result) return result;
    }
  }

  for (const child of children) {
    if (isGroupSegment(child.segment)) {
      const groupEntry = buildChainEntry(child, currentMatched);
      const result = matchRecursive(
        child,
        remainingSegments,
        currentParams,
        [...currentChain, groupEntry],
        currentMatched,
        bestPartialMatch,
      );
      if (result) return result;
    }
  }

  for (const child of children) {
    if (isDynamicSegment(child.segment)) {
      const paramName = extractParamName(child.segment);
      const nextChain = hasLayoutChainContent(child)
        ? [
            ...currentChain,
            buildChainEntry(child, [...currentMatched, currentSegment]),
          ]
        : currentChain;
      const result = matchRecursive(
        child,
        rest,
        { ...currentParams, [paramName]: currentSegment },
        nextChain,
        [...currentMatched, currentSegment],
        bestPartialMatch,
      );
      if (result) return result;
    }
  }

  for (const child of children) {
    if (isCatchAllSegment(child.segment) && (child.page || child.route)) {
      const paramName = extractParamName(child.segment);
      const caughtSegments = remainingSegments;
      const entry = buildChainEntry(child, [
        ...currentMatched,
        ...caughtSegments,
      ]);
      return {
        node: child,
        params: {
          ...currentParams,
          [paramName]: caughtSegments.join("/"),
        },
        layoutChain: [...currentChain, entry],
        matchedSegments: [...currentMatched, ...caughtSegments],
      };
    }
  }

  for (const child of children) {
    if (
      isOptionalCatchAllSegment(child.segment) &&
      (child.page || child.route)
    ) {
      const paramName = extractParamName(child.segment);
      const caughtSegments = remainingSegments;
      const entry = buildChainEntry(child, [
        ...currentMatched,
        ...caughtSegments,
      ]);
      return {
        node: child,
        params: {
          ...currentParams,
          [paramName]: caughtSegments.join("/"),
        },
        layoutChain: [...currentChain, entry],
        matchedSegments: [...currentMatched, ...caughtSegments],
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RouteTree class
// ─────────────────────────────────────────────────────────────────────────────

function cloneNode(node: RouteNode): RouteNode {
  const clone: RouteNode = { ...node };

  if (node.children) {
    clone.children = node.children.map(cloneNode);
  }

  if (node.parallelRoutes) {
    clone.parallelRoutes = {};
    for (const [slot, slotTree] of Object.entries(node.parallelRoutes)) {
      clone.parallelRoutes[slot] = cloneNode(slotTree);
    }
  }

  return clone;
}

export function resolveMagicPrefix(
  node: RouteNode,
  prefixPath: string,
): RouteNode {
  const clone: RouteNode = { ...node };

  if (clone.children) {
    clone.children = clone.children.flatMap((child) => {
      if (child.segment === "[prefix]") {
        const segments = prefixPath.split("/").filter(Boolean);

        const resolvedChild = resolveMagicPrefix(child, prefixPath);

        if (segments.length === 0) {
          resolvedChild.segment = "(prefix)";
          return [resolvedChild];
        } else {
          resolvedChild.segment = segments[segments.length - 1];

          let current = resolvedChild;
          for (let i = segments.length - 2; i >= 0; i--) {
            current = { segment: segments[i], children: [current] };
          }
          return [current];
        }
      } else {
        return [resolveMagicPrefix(child, prefixPath)];
      }
    });
  }

  if (clone.parallelRoutes) {
    clone.parallelRoutes = {};
    for (const [slot, slotTree] of Object.entries(node.parallelRoutes!)) {
      clone.parallelRoutes[slot] = resolveMagicPrefix(slotTree, prefixPath);
    }
  }

  return clone;
}

export class RouteTree {
  private root: RouteNode;
  private rewrites: Map<string, string> = new Map();

  constructor(
    initialRoot?: RouteNode,
    initialRewrites?: Map<string, string> | Record<string, string>,
  ) {
    this.root = initialRoot ? cloneNode(initialRoot) : createRootNode();
    if (initialRewrites) {
      if (initialRewrites instanceof Map) {
        for (const [from, to] of initialRewrites) {
          this.addRewrite(from, to);
        }
      } else {
        for (const [from, to] of Object.entries(initialRewrites)) {
          this.addRewrite(from, to);
        }
      }
    }
  }

  private normalizeRewritePath(p: string): string {
    let norm = p.trim();
    if (!norm.startsWith("/")) norm = "/" + norm;
    if (norm.length > 1 && norm.endsWith("/")) norm = norm.slice(0, -1);
    return norm;
  }

  addRewrite(from: string, to: string): this {
    this.rewrites.set(
      this.normalizeRewritePath(from),
      this.normalizeRewritePath(to),
    );
    return this;
  }

  setRewrites(rewrites: Map<string, string> | Record<string, string>): this {
    if (rewrites instanceof Map) {
      for (const [from, to] of rewrites) {
        this.addRewrite(from, to);
      }
    } else {
      for (const [from, to] of Object.entries(rewrites)) {
        this.addRewrite(from, to);
      }
    }
    return this;
  }

  getRewrites(): Map<string, string> {
    return new Map(this.rewrites);
  }

  resolveRewrite(path: string): string {
    const norm = this.normalizeRewritePath(path);
    const exact = this.rewrites.get(norm);
    if (exact) return exact;

    for (const [from, to] of this.rewrites.entries()) {
      const match = this.matchRewritePattern(from, norm);
      if (match) {
        return this.applyRewritePattern(to, match);
      }
    }

    return path;
  }

  private matchRewritePattern(
    fromPattern: string,
    path: string,
  ): Record<string, string> | null {
    if (
      !fromPattern.includes(":") &&
      !fromPattern.includes("[") &&
      !fromPattern.includes("*")
    ) {
      return null;
    }

    const fromParts = fromPattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);
    const params: Record<string, string> = {};

    for (let i = 0; i < fromParts.length; i++) {
      const fromPart = fromParts[i];

      if (
        fromPart === "*" ||
        fromPart.startsWith(":path*") ||
        fromPart.startsWith("[...")
      ) {
        const remaining = pathParts.slice(i).join("/");
        params["path"] = remaining;
        params["*"] = remaining;
        return params;
      }

      if (i >= pathParts.length) {
        return null;
      }

      const pathPart = pathParts[i];

      if (fromPart.startsWith(":") && !fromPart.endsWith("*")) {
        params[fromPart.slice(1)] = pathPart;
      } else if (
        fromPart.startsWith("[") &&
        fromPart.endsWith("]") &&
        !fromPart.startsWith("[...")
      ) {
        params[fromPart.slice(1, -1)] = pathPart;
      } else if (fromPart !== pathPart) {
        return null;
      }
    }

    if (pathParts.length !== fromParts.length) {
      return null;
    }

    return params;
  }

  private applyRewritePattern(
    toPattern: string,
    params: Record<string, string>,
  ): string {
    let result = toPattern;

    for (const [key, value] of Object.entries(params)) {
      if (key === "*" || key === "path") continue;
      result = result.replaceAll(`:${key}`, value);
      result = result.replaceAll(`[${key}]`, value);
      result = result.replaceAll(`[...${key}]`, value);
      result = result.replaceAll(`[[...${key}]]`, value);
    }

    if (params["path"] !== undefined) {
      result = result.replaceAll(":path*", params["path"]);
      result = result.replaceAll("[...path]", params["path"]);
      result = result.replaceAll("*", params["path"]);
    }

    return this.normalizeRewritePath(result);
  }

  getRoot(): RouteNode {
    return this.root;
  }

  addTree(source: RouteNode | RouteTree, prefix?: string): void {
    if (source instanceof RouteTree) {
      for (const [from, to] of source.getRewrites()) {
        const fullFrom = prefix && prefix !== "/" ? `${prefix}${from}` : from;
        const fullTo = prefix && prefix !== "/" ? `${prefix}${to}` : to;
        this.addRewrite(fullFrom, fullTo);
      }
    }

    const treeNode = source instanceof RouteTree ? source.getRoot() : source;

    if (!prefix || prefix === "/") {
      this.mergeNode(this.root, treeNode);
      return;
    }

    const segments = splitPath(prefix);
    let current = this.root;

    for (const seg of segments) {
      current = ensureChild(current, seg);
    }

    this.mergeNode(current, treeNode);
  }

  mergeNode(target: RouteNode, source: RouteNode): void {
    if (source.page) target.page = source.page;
    if (source.layout) target.layout = source.layout;
    if (source.loading) target.loading = source.loading;
    if (source.error) target.error = source.error;
    if (source.notFound) target.notFound = source.notFound;
    if (source.default) target.default = source.default;
    if (source.route) target.route = source.route;
    if (source.generateMetadata)
      target.generateMetadata = source.generateMetadata;
    if (source.breadcrumb !== undefined) target.breadcrumb = source.breadcrumb;
    if (source.id !== undefined) target.id = source.id;
    if (source.auth !== undefined) target.auth = source.auth;

    if (source.middlewares?.length) {
      target.middlewares = [
        ...(target.middlewares ?? []),
        ...source.middlewares,
      ];
    }

    if (source.roles?.length) {
      const existing = new Set(target.roles ?? []);
      for (const role of source.roles) existing.add(role);
      target.roles = [...existing];
    }

    if (source.permissions?.length) {
      const existing = new Set(target.permissions ?? []);
      for (const perm of source.permissions) existing.add(perm);
      target.permissions = [...existing];
    }

    if (source.children?.length) {
      if (!target.children) target.children = [];

      for (const sourceChild of source.children) {
        const existingChild = target.children.find(
          (c) => c.segment === sourceChild.segment,
        );
        if (existingChild) {
          this.mergeNode(existingChild, sourceChild);
        } else {
          target.children.push(cloneNode(sourceChild));
        }
      }
    }

    if (source.parallelRoutes) {
      if (!target.parallelRoutes) target.parallelRoutes = {};

      for (const [slotName, slotTree] of Object.entries(
        source.parallelRoutes,
      )) {
        if (target.parallelRoutes[slotName]) {
          this.mergeNode(target.parallelRoutes[slotName], slotTree);
        } else {
          target.parallelRoutes[slotName] = cloneNode(slotTree);
        }
      }
    }
  }

  match(path: string): MatchResult | null {
    const resolvedPath = this.resolveRewrite(path);
    const segments = splitPath(resolvedPath);

    const rootEntry = buildChainEntry(this.root, []);

    const bestPartialMatch = {
      depth: -1,
      result: null as InternalMatchResult | null,
    };

    const result = matchRecursive(
      this.root,
      segments,
      {},
      [rootEntry],
      [],
      bestPartialMatch,
    );

    if (result) {
      return {
        node: result.node,
        params: result.params,
        layoutChain: result.layoutChain,
        matchedSegments: result.matchedSegments,
        isExact: true,
      };
    }

    if (bestPartialMatch.result && bestPartialMatch.depth > 0) {
      return {
        node: bestPartialMatch.result.node,
        params: bestPartialMatch.result.params,
        layoutChain: bestPartialMatch.result.layoutChain,
        matchedSegments: bestPartialMatch.result.matchedSegments,
        isExact: false,
      };
    }

    return null;
  }

  async generateMetadata(
    path: string,
    searchParams: Record<string, string> = {},
  ): Promise<Metadata> {
    const resolvedPath = this.resolveRewrite(path);
    const matchResult = this.match(resolvedPath);
    if (!matchResult) return {};

    const { params, node } = matchResult;
    let mergedMetadata: Metadata = {};

    const generators = this.collectMetadataGenerators(resolvedPath);

    for (const generator of generators) {
      const metadata = await generator({ params, searchParams });
      mergedMetadata = { ...mergedMetadata, ...metadata };
    }

    if (node.generateMetadata) {
      const leafMetadata = await node.generateMetadata({
        params,
        searchParams,
      });
      mergedMetadata = { ...mergedMetadata, ...leafMetadata };
    }

    return mergedMetadata;
  }

  private collectMetadataGenerators(
    path: string,
  ): Array<
    (props: {
      params: Record<string, string>;
      searchParams: Record<string, string>;
    }) => Promise<Metadata> | Metadata
  > {
    const segments = splitPath(path);
    const generators: Array<
      (props: {
        params: Record<string, string>;
        searchParams: Record<string, string>;
      }) => Promise<Metadata> | Metadata
    > = [];

    if (this.root.generateMetadata) {
      generators.push(this.root.generateMetadata);
    }

    this.collectGeneratorsRecursive(this.root, segments, generators);

    return generators;
  }

  private collectGeneratorsRecursive(
    node: RouteNode,
    remainingSegments: string[],
    generators: Array<
      (props: {
        params: Record<string, string>;
        searchParams: Record<string, string>;
      }) => Promise<Metadata> | Metadata
    >,
  ): boolean {
    const children = node.children ?? [];

    if (remainingSegments.length === 0) {
      for (const child of children) {
        if (child.segment === "" && child.page) {
          if (child.generateMetadata) generators.push(child.generateMetadata);
          return true;
        }
      }
      return !!node.page;
    }

    const [currentSegment, ...rest] = remainingSegments;

    for (const child of children) {
      if (
        !isGroupSegment(child.segment) &&
        !isDynamicSegment(child.segment) &&
        !isCatchAllSegment(child.segment) &&
        !isOptionalCatchAllSegment(child.segment) &&
        child.segment === currentSegment
      ) {
        if (child.generateMetadata) generators.push(child.generateMetadata);
        if (this.collectGeneratorsRecursive(child, rest, generators))
          return true;
        if (child.generateMetadata) generators.pop();
      }
    }

    for (const child of children) {
      if (isGroupSegment(child.segment)) {
        if (child.generateMetadata) generators.push(child.generateMetadata);
        if (
          this.collectGeneratorsRecursive(child, remainingSegments, generators)
        )
          return true;
        if (child.generateMetadata) generators.pop();
      }
    }

    for (const child of children) {
      if (isDynamicSegment(child.segment)) {
        if (child.generateMetadata) generators.push(child.generateMetadata);
        if (this.collectGeneratorsRecursive(child, rest, generators))
          return true;
        if (child.generateMetadata) generators.pop();
      }
    }

    for (const child of children) {
      if (isCatchAllSegment(child.segment) && child.page) {
        if (child.generateMetadata) generators.push(child.generateMetadata);
        return true;
      }
    }

    for (const child of children) {
      if (isOptionalCatchAllSegment(child.segment) && child.page) {
        if (child.generateMetadata) generators.push(child.generateMetadata);
        return true;
      }
    }

    return false;
  }
}
