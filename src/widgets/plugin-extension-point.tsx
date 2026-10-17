import { getCurrentSession } from "@veap/auth";
import type React from "react";
import { isPluginsContextBound, pluginsContext } from "../common/context.js";

export interface PluginExtensionPointProps {
  target: string;
  point: string;
  mode?: "single" | "multiple";
  className?: string;
  props?: any;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
  as?: React.ElementType;
  includeDisabled?: boolean;
}

export async function PluginExtensionPoint({
  target,
  point,
  mode = "multiple",
  className,
  props,
  fallback,
  children,
  as: Container,
  includeDisabled = false,
}: PluginExtensionPointProps) {
  if (!isPluginsContextBound()) {
    const g = globalThis as any;
    if (g.__VEAP_BOOTSTRAPPING_PROMISE__) {
      try {
        await g.__VEAP_BOOTSTRAPPING_PROMISE__;
      } catch {}
    }
  }

  const fallbackContent = (children ?? fallback ?? null) as React.ReactNode;

  if (!isPluginsContextBound()) {
    return fallbackContent;
  }

  let user: any = null;
  try {
    const sessionData = await getCurrentSession();
    user = sessionData?.user ?? null;
  } catch {
    user = null;
  }

  const userRoles = user?.roles || [];
  const userPermissions = user?.permissions || [];

  const ctx = pluginsContext();
  const extensions = ctx.extensions?.getExtensions
    ? await ctx.extensions.getExtensions(target, point, includeDisabled, {
        roles: userRoles,
        permissions: userPermissions,
      })
    : await ctx.registry.getExtensions(target, point, includeDisabled, {
        roles: userRoles,
        permissions: userPermissions,
      });

  if (extensions.length === 0) return fallbackContent;

  if (mode === "single") {
    const ext = extensions[0];
    const Component = ext?.component;
    if (!Component) return fallbackContent;

    if (Container || className) {
      const Wrapper = Container || "div";
      return (
        <Wrapper className={className}>
          <Component key={ext.id} {...props} />
        </Wrapper>
      );
    }

    return <Component key={ext.id} {...props} />;
  }

  const Wrapper = Container || "div";
  return (
    <Wrapper className={className}>
      {extensions.map((ext) => {
        const Component = ext.component;
        if (!Component) return null;
        return <Component key={ext.id} {...props} />;
      })}
    </Wrapper>
  );
}
export { PluginExtensionPoint as ExtensionPoint };
