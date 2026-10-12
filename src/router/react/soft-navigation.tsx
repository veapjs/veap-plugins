"use client";

import * as React from "react";

export interface SoftNavigationInterceptorProps {
  children: React.ReactNode;
  onNavigate?: (href: string) => void;
}

export function SoftNavigationInterceptor({
  children,
  onNavigate,
}: SoftNavigationInterceptorProps) {
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignore clicks with modifiers
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      // Find the closest anchor tag
      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }

      if (!target) return;

      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute("href");

      // Only intercept internal links
      if (
        href?.startsWith("/") &&
        !href.startsWith("//") &&
        anchor.target !== "_blank" &&
        !anchor.hasAttribute("download") &&
        anchor.getAttribute("rel") !== "external"
      ) {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(href);
        } else if (typeof window !== "undefined") {
          e.preventDefault();
          window.history.pushState(null, "", href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onNavigate]);

  return <>{children}</>;
}
