[![CI](https://github.com/veapjs/veap-plugins/actions/workflows/CI.yml/badge.svg)](https://github.com/veapjs/veap-plugins/actions/workflows/CI.yml)
[![Release](https://github.com/veapjs/veap-plugins/actions/workflows/RELEASE.yml/badge.svg)](https://github.com/veapjs/veap-plugins/actions/workflows/RELEASE.yml)
[![Version](https://img.shields.io/npm/v/@veap/plugins?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@veap/plugins)

# @veap/plugins

Plugin architecture, dynamic extension points, virtual routing, and widget
customization for Veap applications.

## Overview

`@veap/plugins` provides an enterprise-grade modular plugin system. It enables
developers to extend Veap applications dynamically with UI slots, custom
dashboard widgets, virtual routing, navigation items, and event listeners
without modifying core application code.

## Features

- **Standard plugin lifecycle**: Declarative plugin manifests defining
  dependencies, configuration schemas (Zod), migrations, and activation hooks.
- **Extension slots & widgets**: React extension points allowing plugins to
  inject custom UI components into existing pages, sidebars, and headers.
- **Drag-and-drop dashboard widgets**: Built-in support for user-customizable
  widgets with `@dnd-kit` persistence.
- **Virtual router**: Dynamic route interception and virtual page injection
  via the integrated router service.
- **Database persistence**: Storing plugin activation states and user widget
  layouts in database tables managed by `@veap/database`.
- **IoC integration**: `PluginsServiceProvider` boots and registers plugin
  capabilities cleanly into the application container.

## Installation

```bash
# Using bun
bun add @veap/plugins @veap/kernel @veap/database @veap/auth

# Using pnpm
pnpm add @veap/plugins @veap/kernel @veap/database @veap/auth

# Using npm
npm install @veap/plugins @veap/kernel @veap/database @veap/auth
```

## Usage

### Define a Custom Plugin

Create a plugin definition implementing the `IPlugin` contract:

```tsx
import type { IPlugin } from "@veap/plugins";

export const AnalyticsPlugin: IPlugin = {
  manifest: {
    id: "com.example.analytics",
    name: "Analytics Tracker",
    version: "1.0.0",
    description: "Injects telemetry script and admin dashboard widgets",
    enabled: true,
  },

  widgets: [
    {
      id: "analytics-overview",
      name: "Visitor Traffic",
      area: "admin:dashboard",
      component: () => (
        <div className="p-4 border rounded">
          <p className="text-sm font-semibold">Active Visitors: 42</p>
        </div>
      ),
    },
  ],

  async init() {
    console.log("Analytics plugin initialized!");
  },
};
```

### Register Plugins in Application Builder

Pass plugins to `Application.configure()` via `PluginsServiceProvider`:

```ts
import { Application } from "@veap/kernel";
import { PluginsServiceProvider } from "@veap/plugins";
import { AnalyticsPlugin } from "./plugins/analytics";

export const app = Application.configure()
  .use((c) => new PluginsServiceProvider(c, { plugins: [AnalyticsPlugin] }))
  .create();
```

### Render Extension Points in React

Use extension components from `@veap/plugins/client`:

```tsx
"use client";

import { ExtensionPointClient } from "@veap/plugins/client";

export function DashboardHeader() {
  return (
    <header className="flex justify-between items-center p-4">
      <h1>Admin Dashboard</h1>
      {/* External plugins can inject actions here */}
      <ExtensionPointClient target="dashboard:header" point="actions" />
    </header>
  );
}
```

## Subpath Exports

| Export Path                | Content                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `@veap/plugins`            | Core plugin definitions (`IPlugin`), lifecycle, and `PluginsServiceProvider` |
| `@veap/plugins/server`     | Server-side `ExtensionPoint`, `WidgetArea`, and plugin registry utilities    |
| `@veap/plugins/client`     | Client components (`ExtensionPointClient`, `WidgetAreaClient`)               |
| `@veap/plugins/actions`    | Next.js Server Actions for plugin and widget management                      |
| `@veap/plugins/router`     | Virtual router infrastructure (`PluginRouter`)                               |
| `@veap/plugins/models`     | Active Record models (`SystemPlugin`, `SystemUserWidget`)                    |
| `@veap/plugins/migrations` | Knex migrations for plugin persistence                                       |

## Documentation

For full guides and plugin development patterns, visit:

- **Official Website**: [https://veap.pl](https://veap.pl)
- **Documentation**: [https://veap.pl/docs](https://veap.pl/docs)
- **GitHub Repository**: [https://github.com/veapjs/veap-plugins](https://github.com/veapjs/veap-plugins)

## License

MIT
