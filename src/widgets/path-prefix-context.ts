"use client";

import { PathPrefixContext } from "@veap/auth/client";
import { useContext } from "react";

export { PathPrefixContext };

/**
 * Hook to get the current Veap path prefix on the client.
 */
export function usePathPrefix(): string {
  return useContext(PathPrefixContext);
}
