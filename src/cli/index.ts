export { type AddPluginOptions, addPlugin } from "./add.js";
export { AddPluginCommand } from "./commands/add-plugin.js";
export { EjectPluginCommand } from "./commands/eject-plugin.js";
export { ListPluginsCommand } from "./commands/list-plugins.js";
export { MakePluginCommand } from "./commands/make-plugin.js";
export { PluginsSyncCommand } from "./commands/plugins-sync.js";
export { RemovePluginCommand } from "./commands/remove-plugin.js";
export {
  type EjectPluginOptions,
  ejectPackage,
  ejectPlugin,
} from "./eject.js";
export {
  type GeneratePluginOptions,
  generatePlugin,
} from "./generate-plugin.js";
export {
  applyDockerfileForPackageManager,
  detectPackageManager,
  type PackageManager,
} from "./package-manager.js";
export { type RemovePluginOptions, removePlugin } from "./remove.js";
export { findStubsDir, stubPath } from "./stubs.js";
export {
  findProjectRoot,
  processStubs,
  regeneratePluginsRegistry,
} from "./utils.js";
