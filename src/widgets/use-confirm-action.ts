"use client";

import { eventBus } from "@veap/kernel/events";
import { useCallback, useEffect, useRef } from "react";

export type ConfirmOptions = {
  action?: string;
  title?: string;
  description?: string;
  preferredMethod?: string;
  rememberMinutes?: number;
  metadata?: Record<string, any>;
};

export type ConfirmResult = {
  confirmed: boolean;
  method?: string;
};

type PendingEntry = {
  resolve: (result: ConfirmResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/**
 * Hook for confirming sensitive actions via password/passkey.
 *
 * If the action-confirm plugin is enabled, shows an action verification dialog.
 * If it's disabled, falls back to the native browser confirm().
 */
export function useConfirmAction() {
  const pendingRequests = useRef<Map<string, PendingEntry>>(new Map());

  const subscriberId = useRef(
    `use-confirm-action-${Math.random().toString(36).slice(2, 9)}`,
  ).current;

  useEffect(() => {
    const responseHandler = (event: any) => {
      const { requestId, confirmed, method } = event.payload;
      const pending = pendingRequests.current.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingRequests.current.delete(requestId);
        pending.resolve({ confirmed, method });
      }
    };

    eventBus.subscribe(
      "action:confirm:response",
      subscriberId,
      responseHandler,
    );

    return () => {
      eventBus.unsubscribe("action:confirm:response", subscriberId);
      for (const [, pending] of pendingRequests.current) {
        clearTimeout(pending.timeout);
      }
      pendingRequests.current.clear();
    };
  }, [subscriberId]);

  const confirmAction = useCallback(
    (options: ConfirmOptions): Promise<ConfirmResult> => {
      return new Promise((resolve) => {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const ackSubId = `${subscriberId}-ack-${requestId}`;

        const fallbackTimeout = setTimeout(() => {
          eventBus.unsubscribe("action:confirm:ack", ackSubId);

          const confirmed = window.confirm(
            options.description || options.title || "Confirm action?",
          );
          resolve({ confirmed });
        }, 500);

        const ackHandler = (event: any) => {
          if (event.payload?.requestId !== requestId) return;

          eventBus.unsubscribe("action:confirm:ack", ackSubId);
          clearTimeout(fallbackTimeout);

          const responseTimeout = setTimeout(
            () => {
              pendingRequests.current.delete(requestId);
              resolve({ confirmed: false });
            },
            5 * 60 * 1000,
          );

          pendingRequests.current.set(requestId, {
            resolve,
            timeout: responseTimeout,
          });
        };

        eventBus.subscribe("action:confirm:ack", ackSubId, ackHandler);

        eventBus.publish("action:confirm:request", {
          requestId,
          action: options.action ?? "confirm",
          title: options.title ?? "Confirm action",
          description: options.description,
          preferredMethod: options.preferredMethod,
          rememberMinutes: options.rememberMinutes,
          metadata: options.metadata,
        });
      });
    },
    [subscriberId],
  );

  return confirmAction;
}
