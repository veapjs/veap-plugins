# @veap/plugins

## 0.1.3

### Patch Changes

- Fully decouple `@veap/plugins` from Next.js runtime dependencies:
  
  - Decoupled router middlewares (`SameOrigin`, `EnsuredGuest`, `EnsuredUser`, `EnsuredAuth`) and `withRouter` HOC from `next/headers` and `next/navigation` in favor of `@veap/kernel`'s `REQUEST_CONTEXT` port (`IHttpRequestContext`).
  - Removed `useRouter` from `SoftNavigationInterceptor` in favor of framework-agnostic HTML5 navigation with an optional `onNavigate` handler.
  - Replaced `next` `Metadata` type in `route-tree.ts` with a framework-agnostic `VeapMetadata` interface.
  - Removed `next` from `peerDependencies` in `package.json`.
  - Preserved virtual router file conventions and `NEXT_RUNTIME` environment handling.

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @veap/intl@0.1.2
  - @veap/kernel@0.1.2

## 0.1.1

### Patch Changes

- Augment VeapConfig with privatePath, declare local APP_PLUGINS, ROUTER_SERVICE and SITE_LAYOUT tokens, augment ApplicationBuilder with withPlugins, and ensure full ESM compliance:
  - Augment `VeapConfig` from `@veap/kernel` via TypeScript Module Augmentation to declare the `privatePath?: string` configuration schema.
  - Augment `ApplicationBuilder` from `@veap/kernel` via TypeScript Module Augmentation with `.withPlugins(plugins: any[])` and configure `PluginsConfigProvider` and `PluginsServiceProvider`.
  - Define and export `APP_PLUGINS` (`Token<any[]>`), `ROUTER_SERVICE` (`Token<RouterService>`), and `SITE_LAYOUT` (`Token<any>`) IoC tokens within `@veap/plugins` (`src/common/tokens.ts`, `src/common/index.ts`, `src/router/index.ts`), decoupling them from `@veap/kernel`.
  - Update `PluginsServiceProvider` to bind the local `APP_PLUGINS`, `ROUTER_SERVICE`, and `SITE_LAYOUT` tokens.
- Updated dependencies []:
  - @veap/auth@0.1.1
  - @veap/database@0.1.1
  - @veap/intl@0.1.1
  - @veap/kernel@0.1.1

## 0.1.0

### Minor Changes

- Initial public scaffold of the Veap plugins.
