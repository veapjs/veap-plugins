import { checkSecurity, getAuthRoutes, getCurrentSession } from "@veap/auth";
import {
  AppError,
  app,
  type IHttpRequestContext,
  REQUEST_CONTEXT,
  verifySameOrigin,
} from "@veap/kernel";
import type {
  ApiMiddleware,
  VeapMiddleware,
  VeapMiddlewareContext,
} from "../common/types.js";

export const EnsuredGuest: VeapMiddleware = async (ctx, next) => {
  const { user, session } = await getCurrentSession();

  if (user && session) {
    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    const referer = await requestContext.getHeader("referer");

    if (referer && !referer.includes(ctx.path)) {
      return requestContext.redirect(referer);
    }

    return requestContext.redirect("/");
  }

  return await next();
};

export const EnsuredUser: VeapMiddleware = async (_ctx, next) => {
  const { user, session } = await getCurrentSession();

  if (!user || !session) {
    const authRoutes = getAuthRoutes();
    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    return requestContext.redirect(authRoutes.signIn);
  }

  return await next();
};

/**
 * Page-level opt-out from modular security requirements (2FA challenges,
 * onboarding gates, ...). Append it AFTER EnsuredAuth in a page's
 * `middlewares` export. Its marker propagates to the renderer, which skips
 * EnsuredAuth entirely for this route, while explicit auth/roles/permissions
 * (from the page itself) are still enforced by the pipeline below.
 */
export const SkipSecurity: VeapMiddleware = async (ctx, next) => {
  (ctx as VeapMiddlewareContext & { __skipSecurity?: boolean }).__skipSecurity =
    true;
  return await next();
};

export const EnsuredAuth: VeapMiddleware = async (ctx, next) => {
  const { user, session } = await getCurrentSession();
  const authRoutes = getAuthRoutes();

  if (!user || !session) {
    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    return requestContext.redirect(authRoutes.signIn);
  }

  const security = await checkSecurity(
    session,
    user,
    ctx.roles,
    ctx.permissions,
    undefined,
    ctx.path,
  );

  if (!security.satisfied) {
    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    return requestContext.redirect(security.redirect || authRoutes.signIn);
  }

  return await next();
};

export const ApiEnsuredAuth: ApiMiddleware = async (
  _request,
  context,
  next,
) => {
  const { user, session } = await getCurrentSession();

  if (!user || !session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const security = await checkSecurity(
    session,
    user,
    context.roles,
    context.permissions,
    undefined,
    context.path,
  );

  if (!security.satisfied) {
    return new Response(
      JSON.stringify({
        error: "Security requirement not met",
        redirect: security.redirect,
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return await next();
};

/**
 * Route middleware enforcing same-origin requests for state-changing operations.
 * Throws AppError.Forbidden if request originates from an untrusted origin.
 */
export const SameOrigin: VeapMiddleware = async (_ctx, next) => {
  const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
  const origin = await requestContext.getHeader("origin");
  const secFetchSite = await requestContext.getHeader("sec-fetch-site");
  const secFetchMode = await requestContext.getHeader("sec-fetch-mode");

  if (origin || (secFetchSite && secFetchMode !== "navigate")) {
    const host = await requestContext.getHeader("host");
    const xForwardedHost = await requestContext.getHeader("x-forwarded-host");
    const headersMap = new Map<string, string | null>([
      ["origin", origin],
      ["sec-fetch-site", secFetchSite],
      ["sec-fetch-mode", secFetchMode],
      ["host", host],
      ["x-forwarded-host", xForwardedHost],
    ]);

    const requestLike = {
      headers: {
        get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
      },
      method: "POST",
    };

    if (!verifySameOrigin(requestLike)) {
      throw AppError.Forbidden("Cross-origin request rejected");
    }
  }

  return await next();
};

/**
 * API route middleware enforcing same-origin requests for state-changing operations.
 * Returns a 403 JSON Response if request originates from an untrusted origin.
 */
export const ApiSameOrigin: ApiMiddleware = async (request, _context, next) => {
  if (!verifySameOrigin(request)) {
    return new Response(
      JSON.stringify({ error: "Forbidden: Cross-origin request rejected" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return await next();
};

export async function runPipeline(
  middlewares: VeapMiddleware[],
  context: VeapMiddlewareContext,
  final: (context: VeapMiddlewareContext) => Promise<React.ReactNode>,
): Promise<React.ReactNode> {
  let index = 0;

  async function next(): Promise<React.ReactNode> {
    if (index < middlewares.length) {
      const middleware = middlewares[index++];
      return await middleware(context, next);
    }
    return await final(context);
  }

  return await next();
}

export async function runApiPipeline(
  middlewares: ApiMiddleware[],
  request: Request,
  context: any,
  final: (request: Request, context: any) => Promise<Response>,
): Promise<Response> {
  let index = 0;

  async function next(): Promise<Response> {
    if (index < middlewares.length) {
      const middleware = middlewares[index++];
      return await middleware(request, context, next);
    }
    return await final(request, context);
  }

  return await next();
}
