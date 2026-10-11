import { describe, expect, it } from "vitest";
import { matchRoute } from "../src/router/matcher";
import {
  extractParamName,
  isCatchAllSegment,
  isDynamicSegment,
  isGroupSegment,
  isOptionalCatchAllSegment,
  isParallelSlot,
  RouteTree,
  resolveMagicPrefix,
} from "../src/router/route-tree";

describe("Route Segment Utils", () => {
  it("detects route group segments", () => {
    expect(isGroupSegment("(marketing)")).toBe(true);
    expect(isGroupSegment("(auth)")).toBe(true);
    expect(isGroupSegment("marketing")).toBe(false);
    expect(isGroupSegment("[id]")).toBe(false);
  });

  it("detects dynamic parameter segments", () => {
    expect(isDynamicSegment("[id]")).toBe(true);
    expect(isDynamicSegment("[slug]")).toBe(true);
    expect(isDynamicSegment("[...path]")).toBe(false);
    expect(isDynamicSegment("[[...path]]")).toBe(false);
    expect(isDynamicSegment("id")).toBe(false);
  });

  it("detects catch-all segments", () => {
    expect(isCatchAllSegment("[...path]")).toBe(true);
    expect(isCatchAllSegment("[...slug]")).toBe(true);
    expect(isCatchAllSegment("[[...path]]")).toBe(false);
    expect(isCatchAllSegment("[id]")).toBe(false);
  });

  it("detects optional catch-all segments", () => {
    expect(isOptionalCatchAllSegment("[[...path]]")).toBe(true);
    expect(isOptionalCatchAllSegment("[[...slug]]")).toBe(true);
    expect(isOptionalCatchAllSegment("[...path]")).toBe(false);
    expect(isOptionalCatchAllSegment("[id]")).toBe(false);
  });

  it("detects parallel route slots", () => {
    expect(isParallelSlot("@modal")).toBe(true);
    expect(isParallelSlot("@sidebar")).toBe(true);
    expect(isParallelSlot("modal")).toBe(false);
    expect(isParallelSlot("[id]")).toBe(false);
  });

  it("extracts param names from dynamic, catch-all, and optional catch-all", () => {
    expect(extractParamName("[id]")).toBe("id");
    expect(extractParamName("[slug]")).toBe("slug");
    expect(extractParamName("[...path]")).toBe("path");
    expect(extractParamName("[[...filters]]")).toBe("filters");
    expect(extractParamName("static")).toBe("static");
  });
});

describe("matchRoute legacy utility", () => {
  it("matches static routes", () => {
    const params = matchRoute("/blog", "/blog");
    expect(params).toEqual({});
  });

  it("matches single parameter routes", () => {
    const params = matchRoute("/blog/:slug", "/blog/hello-world");
    expect(params).toEqual({ slug: "hello-world" });
  });

  it("matches multiple parameter routes", () => {
    const params = matchRoute(
      "/users/:userId/posts/:postId",
      "/users/42/posts/99",
    );
    expect(params).toEqual({ userId: "42", postId: "99" });
  });

  it("matches catch-all routes (:path(.*))", () => {
    const params = matchRoute(
      "/docs/:path(.*)",
      "/docs/getting-started/installation",
    );
    expect(params).toEqual({ path: "getting-started/installation" });
  });

  it("returns null when pattern does not match", () => {
    const params = matchRoute("/blog/:slug", "/shop/item-1");
    expect(params).toBeNull();
  });
});

describe("RouteTree Engine", () => {
  it("matches static paths exactly", () => {
    const tree = new RouteTree({
      segment: "",
      children: [
        { segment: "blog", page: () => "Blog Page" as any },
        { segment: "about", page: () => "About Page" as any },
      ],
    });

    const match = tree.match("/blog");
    expect(match).not.toBeNull();
    expect(match?.node.segment).toBe("blog");
    expect(match?.params).toEqual({});
    expect(match?.isExact).toBe(true);

    const nonMatch = tree.match("/contact");
    expect(nonMatch).toBeNull();
  });

  it("extracts dynamic parameters", () => {
    const tree = new RouteTree({
      segment: "",
      children: [
        {
          segment: "posts",
          children: [{ segment: "[id]", page: () => "Post Page" as any }],
        },
      ],
    });

    const match = tree.match("/posts/123");
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: "123" });
    expect(match?.isExact).toBe(true);
  });

  it("supports route groups transparently", () => {
    const tree = new RouteTree({
      segment: "",
      children: [
        {
          segment: "(marketing)",
          layout: () => "Marketing Layout" as any,
          children: [{ segment: "pricing", page: () => "Pricing Page" as any }],
        },
      ],
    });

    const match = tree.match("/pricing");
    expect(match).not.toBeNull();
    expect(match?.node.segment).toBe("pricing");
    expect(match?.layoutChain).toHaveLength(2); // root + (marketing)
  });

  it("matches catch-all routes [...slug]", () => {
    const tree = new RouteTree({
      segment: "",
      children: [
        {
          segment: "docs",
          children: [{ segment: "[...slug]", page: () => "Docs Page" as any }],
        },
      ],
    });

    const match = tree.match("/docs/a/b/c");
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ slug: "a/b/c" });
  });

  it("supports route rewrites", () => {
    const tree = new RouteTree({
      segment: "",
      children: [{ segment: "signin", page: () => "Sign In Page" as any }],
    });

    tree.addRewrite("/logowanie", "/signin");

    const match = tree.match("/logowanie");
    expect(match).not.toBeNull();
    expect(match?.node.segment).toBe("signin");
  });

  it("supports parameterized route rewrites", () => {
    const tree = new RouteTree({
      segment: "",
      children: [
        {
          segment: "blog",
          children: [{ segment: "[slug]", page: () => "Blog Post" as any }],
        },
      ],
    });

    tree.addRewrite("/artykuly/:slug", "/blog/:slug");

    const match = tree.match("/artykuly/moj-post");
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ slug: "moj-post" });
  });

  it("supports magic prefix resolution", () => {
    const baseNode = {
      segment: "",
      children: [
        {
          segment: "[prefix]",
          children: [
            { segment: "dashboard", page: () => "Dashboard Page" as any },
          ],
        },
      ],
    };

    const resolved = resolveMagicPrefix(baseNode, "/panel/admin");
    const tree = new RouteTree(resolved);

    const match = tree.match("/panel/admin/dashboard");
    expect(match).not.toBeNull();
    expect(match?.node.segment).toBe("dashboard");
  });
});
