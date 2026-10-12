process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZg==";

import { app, type IHttpRequestContext, REQUEST_CONTEXT } from "@veap/kernel";
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
const mockGetHeader = vi.fn();

const mockRequestContext: IHttpRequestContext = {
  getHeader: (name: string) => mockGetHeader(name),
  redirect: ((url: string) => mockRedirect(url)) as any,
};

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
    app().clear();
    app().register({
      token: REQUEST_CONTEXT,
      useValue: mockRequestContext,
      singleton: true,
    });
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
    mockGetHeader.mockResolvedValue(null);

    const next = vi.fn();

    await EnsuredGuest(
      { path: "/login", searchParams: null, params: null },
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to referer when referer is outside current path", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: { id: "1" },
      session: { id: "s1" },
    });
    mockGetHeader.mockImplementation(async (name: string) => {
      if (name.toLowerCase() === "referer") return "/dashboard";
      return null;
    });

    const next = vi.fn();

    await EnsuredGuest(
      { path: "/login", searchParams: null, params: null },
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("EnsuredUser Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app().clear();
    app().register({
      token: REQUEST_CONTEXT,
      useValue: mockRequestContext,
      singleton: true,
    });
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
    app().clear();
    app().register({
      token: REQUEST_CONTEXT,
      useValue: mockRequestContext,
      singleton: true,
    });
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

describe("SameOrigin Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app().clear();
    app().register({
      token: REQUEST_CONTEXT,
      useValue: mockRequestContext,
      singleton: true,
    });
  });

  it("calls next() for simple GET navigation without origin header", async () => {
    mockGetHeader.mockResolvedValue(null);
    const next = vi.fn().mockResolvedValue("OK");

    const result = await SameOrigin(
      { path: "/profile", searchParams: null, params: null },
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(result).toBe("OK");
  });

  it("throws AppError.Forbidden when origin does not match host", async () => {
    mockGetHeader.mockImplementation(async (name: string) => {
      switch (name.toLowerCase()) {
        case "origin":
          return "http://evil.com";
        case "host":
          return "localhost:3000";
        default:
          return null;
      }
    });

    const next = vi.fn();

    await expect(
      SameOrigin(
        { path: "/api/action", searchParams: null, params: null },
        next,
      ),
    ).rejects.toThrow("Cross-origin request rejected");

    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when origin matches host", async () => {
    mockGetHeader.mockImplementation(async (name: string) => {
      switch (name.toLowerCase()) {
        case "origin":
          return "http://localhost:3000";
        case "host":
          return "localhost:3000";
        default:
          return null;
      }
    });

    const next = vi.fn().mockResolvedValue("SAME_ORIGIN_OK");

    const result = await SameOrigin(
      { path: "/api/action", searchParams: null, params: null },
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(result).toBe("SAME_ORIGIN_OK");
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

describe("ApiSameOrigin Middleware", () => {
  it("returns 403 response on cross-origin request", async () => {
    const req = new Request("http://localhost:3000/api/mutation", {
      method: "POST",
      headers: {
        origin: "http://malicious.com",
        host: "localhost:3000",
      },
    });
    const next = vi.fn();

    const res = await ApiSameOrigin(req, { path: "/api/mutation" }, next);

    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.error).toContain("Cross-origin request rejected");
  });

  it("calls next() on same-origin request", async () => {
    const req = new Request("http://localhost:3000/api/mutation", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
    });
    const next = vi.fn().mockResolvedValue(new Response("OK"));

    const res = await ApiSameOrigin(req, { path: "/api/mutation" }, next);

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
  });
});
