import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Output } from "@veap/kernel/cli";
import { AppError } from "@veap/kernel/errors";
import { regeneratePluginsRegistry } from "./utils.js";

export interface RemovePluginOptions {
  /** Skip running package manager install/uninstall */
  skipInstall?: boolean;
  /** Project root directory (defaults to process.cwd()) */
  rootDir?: string;
  /** Optional CLI output port */
  output?: Output;
}

export async function removePlugin(
  pluginArg: string,
  options: RemovePluginOptions = {},
): Promise<void> {
  const rootDir = options.rootDir ?? process.cwd();
  const out = options.output;
  const pkgJsonPath = path.join(rootDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    if (out) {
      throw AppError.BadRequest(
        "Cannot find package.json in the current directory.",
      );
    }
    console.error("Cannot find package.json in the current directory.");
    process.exit(1);
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const deps: Record<string, string> = pkgJson.dependencies ?? {};
  const devDeps: Record<string, string> = pkgJson.devDependencies ?? {};

  // Match exact package name or suffix (e.g. "blog-plugin" -> "@veap/blog-plugin")
  let targetPkgName: string | undefined;
  if (deps[pluginArg] || devDeps[pluginArg]) {
    targetPkgName = pluginArg;
  } else {
    const allKeys = [...Object.keys(deps), ...Object.keys(devDeps)];
    targetPkgName = allKeys.find(
      (key) =>
        key === `@veap/${pluginArg}` ||
        key.endsWith(`/${pluginArg}`) ||
        key === `veap-plugin-${pluginArg}`,
    );
  }

  if (!targetPkgName) {
    if (out) {
      throw AppError.NotFound(
        `Plugin '${pluginArg}' is not installed in package.json.`,
      );
    }
    console.error(`Plugin '${pluginArg}' is not installed in package.json.`);
    process.exit(1);
  }

  if (deps[targetPkgName]) {
    delete deps[targetPkgName];
  }
  if (devDeps[targetPkgName]) {
    delete devDeps[targetPkgName];
  }

  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  out?.info(`Removed '${targetPkgName}' from package.json.`);

  if (!options.skipInstall) {
    const isBun =
      fs.existsSync(path.join(rootDir, "bun.lockb")) ||
      fs.existsSync(path.join(rootDir, "bun.lock"));
    const isPnpm = fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"));
    const isYarn = fs.existsSync(path.join(rootDir, "yarn.lock"));

    const installCmd = isBun
      ? "bun install"
      : isPnpm
        ? "pnpm install"
        : isYarn
          ? "yarn install"
          : "npm install";

    out?.info(`Updating dependencies (${installCmd})...`);
    execSync(installCmd, { cwd: rootDir, stdio: out ? "pipe" : "inherit" });
  }

  regeneratePluginsRegistry(rootDir, out);
  out?.success(`Plugin '${targetPkgName}' removed successfully.`);
}
