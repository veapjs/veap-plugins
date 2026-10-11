export { addPlugin } from "./add";
export { ejectPackage, ejectPlugin } from "./eject";
export { generatePlugin } from "./generate-plugin";
export {
  applyDockerfileForPackageManager,
  detectPackageManager,
  type PackageManager,
} from "./package-manager";
export { findStubsDir, stubPath } from "./stubs";
export {
  findProjectRoot,
  processStubs,
  regeneratePluginsRegistry,
} from "./utils";
