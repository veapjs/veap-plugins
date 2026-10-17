import { getCurrentSession } from "@veap/auth";
import type React from "react";
import { getUserWidgetsState } from "../actions/index";
import { pluginsContext } from "../common/context";
import { WidgetComposerClient } from "./widget-composer-client";

interface WidgetComposerProps {
  slot: string;
  columns?: number;
  fallback?: React.ReactNode;
}

export async function WidgetComposer({
  slot,
  columns = 4,
  fallback,
}: WidgetComposerProps) {
  const { user } = await getCurrentSession();
  const userRoles = user?.roles || [];
  const userPermissions = user?.permissions || [];

  const defaultWidgetsRaw = await pluginsContext().widgets.getWidgets(slot, {
    roles: userRoles,
    permissions: userPermissions,
  });
  if (defaultWidgetsRaw.length === 0) return fallback || null;

  const userState = await getUserWidgetsState(slot);

  const defaultWidgets = defaultWidgetsRaw.map((w) => {
    const Component = w.component;
    return {
      id: w.id,
      name: w.name,
      component: <Component />,
      defaultColSpan: w.defaultColSpan,
      defaultRowSpan: w.defaultRowSpan,
    };
  });

  return (
    <WidgetComposerClient
      slot={slot}
      defaultWidgets={defaultWidgets}
      userState={userState as any}
      columns={columns}
    />
  );
}
