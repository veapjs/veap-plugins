process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZg==";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiMiddleware,
  VeapMiddleware,
  VeapMiddlewareContext,
} from "../src/common";
import {
  ApiEnsuredAuth,
  ApiSameOrigin,
  EnsuredAuth,
  EnsuredGuest,
  EnsuredUser,
  runApiPipeline,
  runPipeline,
  SameOrigin,
  SkipSecurity,
} from "../src/router/middlewares";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const mockGetCurrentSession = vi.fn();
const mockCheckSecurity = vi.fn();
const mockGetAuthRoutes = vi.fn().mockReturnValue({
  signIn: "/auth/signin",
  signUp: "/auth/signup",
});

vi.mock("@veap/auth", () => ({
  getCurrentSession: () => mockGetCurrentSession(),
  checkSecurity: (...args: any[]) => mockCheckSecurity(...args),
  getAuthRoutes: () => mockGetAuthRoutes(),
}));

describe("Pipeline Execution", () => {
  it("executes middlewares in sequence and returns final result", async () => {
    const executionOrder: string[] = [];

    const m1: VeapMiddleware = async (_ctx, next) => {
      executionOrder.push("m1-start");
      const res = await next();
      executionOrder.push("m1-end");
      return res;
    };

    const m2: VeapMiddleware = async (_ctx, next) => {
      executionOrder.push("m2-start");
      const res = await next();
      executionOrder.push("m2-end");
      return res;
    };

    const result = await runPipeline(
      [m1, m2],
      { path: "/", searchParams: null, params: null },
      async () => {
        executionOrder.push("final");
        return "PAGE_CONTENT";
      },
    );

    expect(result).toBe("PAGE_CONTENT");
    expect(executionOrder).toEqual([
      "m1-start",
      "m2-start",
      "final",
      "m2-end",
      "m1-end",
    ]);
  });

  it("short-circuits pipeline if a middleware returns early without next()", async () => {
    const m1: VeapMiddleware = async () => {
      return "SHORT_CIRCUIT";
    };

    const m2: VeapMiddleware = vi.fn();
    const final = vi.fn();

    const result = await runPipeline(
      [m1, m2],
      { path: "/", searchParams: null, params: null },
      final,
    );

    expect(result).toBe("SHORT_CIRCUIT");
    expect(m2).not.toHaveBeenCalled();
    expect(final).not.toHaveBeenCalled();
  });
});

describe("EnsuredGuest Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls next() when user is not logged in", async () => {
    mockGetCurrentSession.mockResolvedValue({ user: null, session: null });
    const next = vi.fn().mockResolvedValue("OK");

    const result = await EnsuredGuest(
      { path: "/login", searchParams: null, params: null },
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(result).toBe("OK");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to referer or / when user is logged in", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: { id: "1" },
      session: { id: "s1" },
    });
    mockHeaders.mockResolvedValue(new Headers());

    const next = vi.fn();

    await EnsuredGuest(
      { path: "/login", searchParams: null, params: null },
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});

describe("EnsuredUser Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to signIn when user is not logged in", async () => {
    mockGetCurrentSession.mockResolvedValue({ user: null, session: null });
    const next = vi.fn();

    await EnsuredUser(
      { path: "/dashboard", searchParams: null, params: null },
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin");
  });

  it("calls next() when user is logged in", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: { id: "1" },
      session: { id: "s1" },
    });
    const next = vi.fn().mockResolvedValue("DASHBOARD");

    const result = await EnsuredUser(
      {
        path: "/dashboard",
        searchParams: null,
        params: null,
      },
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(result).toBe("DASHBOARD");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("EnsuredAuth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks RBAC security and redirects if not satisfied", async () => {
    const user = { id: "1", roles: ["user"] };
    const session = { id: "s1" };
    mockGetCurrentSession.mockResolvedValue({ user, session });
    mockCheckSecurity.mockResolvedValue({
      satisfied: false,
      redirect: "/forbidden",
    });

    const next = vi.fn();
    const ctx: VeapMiddlewareContext = {
      path: "/admin",
      roles: ["admin"],
      searchParams: null,
      params: null,
    };

    await EnsuredAuth(ctx, next);

    expect(mockCheckSecurity).toHaveBeenCalledWith(
      session,
      user,
      ["admin"],
      undefined,
      undefined,
      "/admin",
    );
    expect(next).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/forbidden");
  });

  it("calls next() when security check is satisfied", async () => {
    const user = { id: "1", roles: ["admin"] };
    const session = { id: "s1" };
    mockGetCurrentSession.mockResolvedValue({ user, session });
    mockCheckSecurity.mockResolvedValue({
      satisfied: true,
    });

    const next = vi.fn().mockResolvedValue("ADMIN_PANEL");
    const ctx: VeapMiddlewareContext = {
      path: "/admin",
      roles: ["admin"],
      searchParams: null,
      params: null,
    };

    const result = await EnsuredAuth(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(result).toBe("ADMIN_PANEL");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("SkipSecurity Middleware", () => {
  it("marks context with __skipSecurity and calls next()", async () => {
    const ctx: any = { path: "/setup-2fa" };
    const next = vi.fn().mockResolvedValue("DONE");

    const res = await SkipSecurity(ctx, next);

    expect(ctx.__skipSecurity).toBe(true);
    expect(next).toHaveBeenCalled();
    expect(res).toBe("DONE");
  });
});

describe("ApiEnsuredAuth Middleware", () => {
  it("returns 401 Response if unauthenticated", async () => {
    mockGetCurrentSession.mockResolvedValue({ user: null, session: null });
    const next = vi.fn();

    const req = new Request("http://localhost/api/test");
    const res = await ApiEnsuredAuth(req, { path: "/api/test" }, next);

    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() if authenticated and security passes", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: { id: "1" },
      session: { id: "s1" },
    });
    mockCheckSecurity.mockResolvedValue({ satisfied: true });

    const next = vi.fn().mockResolvedValue(new Response("API_OK"));
    const req = new Request("http://localhost/api/test");
    const res = await ApiEnsuredAuth(req, { path: "/api/test" }, next);

    expect(next).toHaveBeenCalled();
    expect(await res.text()).toBe("API_OK");
  });
});
