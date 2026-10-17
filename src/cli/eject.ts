import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Output } from "@veap/kernel/cli";
import { AppError } from "@veap/kernel/errors";
import { findProjectRoot, regeneratePluginsRegistry } from "./utils.js";

export interface EjectPluginOptions {
  /** Project root directory (defaults to findProjectRoot(process.cwd())) */
  rootDir?: string;
  /** Skip running package manager install after ejecting */
  skipInstall?: boolean;
  /** Optional CLI output port */
  output?: Output;
}

function normalizeGitUrl(url: string): string {
  if (url.startsWith("git+")) {
    url = url.slice(4);
  }
  if (url.startsWith("git://")) {
    url = `https://${url.slice(6)}`;
  }
  return url;
}

function fail(out: Output | undefined, message: string): boolean {
  if (out) {
    throw AppError.BadRequest(message);
  }
  console.error(message);
  process.exit(1);
  return false;
}

export async function ejectPackage(
  packageName: string,
  options: EjectPluginOptions = {},
): Promise<void> {
  const rootDir = options.rootDir ?? findProjectRoot(process.cwd());
  const out = options.output;

  // Check if root package.json has it
  const rootPkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(rootPkgPath)) {
    fail(out, "Error: Cannot find root package.json.");
    return;
  }

  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
  const deps = {
    ...(rootPkg.dependencies || {}),
    ...(rootPkg.devDependencies || {}),
  };

  if (!deps[packageName]) {
    fail(
      out,
      `Error: Package "${packageName}" is not installed in dependencies.`,
    );
    return;
  }

  // Find installed folder in node_modules
  const nodeModulesDir = path.join(rootDir, "node_modules", packageName);
  const pkgJsonPath = path.join(nodeModulesDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    fail(
      out,
      `Error: Cannot find package.json for installed package at ${pkgJsonPath}`,
    );
    return;
  }

  const installedPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

  const isTemplate =
    installedPkg.veap?.type === "template" ||
    packageName.endsWith("-template") ||
    packageName.includes("template");

  const itemType = isTemplate ? "template" : "plugin";
  const targetSubdir = isTemplate ? "templates" : "plugins";

  if (out) {
    out.info(`Ejecting ${itemType}: ${packageName}...`);
  } else {
    console.log(`\n🚀 Ejecting ${itemType}: ${packageName}...`);
  }

  const repo = installedPkg.repository;

  let gitUrl = "";
  if (typeof repo === "string") {
    gitUrl = repo;
  } else if (repo && typeof repo === "object") {
    gitUrl = repo.url || "";
  }

  if (!gitUrl) {
    // If not found in package.json, try querying registry
    out?.info(`Querying registry for Git repository of ${packageName}...`);
    try {
      const output = execSync(`npm view ${packageName} repository.url`, {
        stdio: "pipe",
      })
        .toString()
        .trim();
      if (output) {
        gitUrl = output;
        out?.info(`Found repository URL: ${gitUrl}`);
      } else {
        fail(
          out,
          "Error: Package package.json does not specify repository URL, and registry query returned nothing.",
        );
        return;
      }
    } catch (_err) {
      fail(
        out,
        "Error: Could not retrieve repository URL from package or registry.",
      );
      return;
    }
  }

  const normalizedUrl = normalizeGitUrl(gitUrl);
  const folderName = packageName.replace(/^@.*\//, "");
  const destDir = path.join(rootDir, targetSubdir, folderName);

  if (fs.existsSync(destDir)) {
    fail(
      out,
      `Error: Local ${itemType} directory already exists at ${destDir}`,
    );
    return;
  }

  // Ensure target parent directory exists (e.g. templates/ or plugins/)
  const targetBaseDir = path.join(rootDir, targetSubdir);
  if (!fs.existsSync(targetBaseDir)) {
    fs.mkdirSync(targetBaseDir, { recursive: true });
  }

  out?.info(
    `Cloning repository ${normalizedUrl} to ${targetSubdir}/${folderName}...`,
  );
  try {
    execSync(`git clone ${normalizedUrl} "${destDir}"`, { stdio: "ignore" });
    out?.info(`Cloned repository to ${targetSubdir}/${folderName}`);
  } catch (_err) {
    fail(out, `Failed to clone repository ${normalizedUrl}`);
    return;
  }

  // Ensure workspace pattern exists in root package.json if workspaces array is defined
  if (Array.isArray(rootPkg.workspaces)) {
    const workspacePattern = `${targetSubdir}/*`;
    if (!rootPkg.workspaces.includes(workspacePattern)) {
      rootPkg.workspaces.push(workspacePattern);
    }
  }

  // Update root package.json dependency to workspace:*
  rootPkg.dependencies = rootPkg.dependencies || {};
  rootPkg.dependencies[packageName] = "workspace:*";
  fs.writeFileSync(
    rootPkgPath,
    `${JSON.stringify(rootPkg, null, 2)}\n`,
    "utf-8",
  );
  if (out) {
    out.info("Updated root package.json dependencies.");
  } else {
    console.log("✅ Updated root package.json dependencies.");
  }

  // Link workspace packages
  if (!options.skipInstall) {
    const { detectPackageManager } = await import("./package-manager.js");
    const pm = detectPackageManager(rootDir);
    out?.info(`Running ${pm} install to link ejected ${itemType}...`);
    try {
      execSync(`${pm} install`, { cwd: rootDir, stdio: "ignore" });
      out?.info(`${isTemplate ? "Template" : "Plugin"} linked successfully.`);
    } catch (_err) {
      out?.warn(`Failed to run ${pm} install automatically.`);
    }
  }

  // Regenerate registry only for plugins
  if (!isTemplate) {
    regeneratePluginsRegistry(rootDir, out);
  }

  if (out) {
    out.success(
      `${isTemplate ? "Template" : "Plugin"} "${packageName}" ejected successfully to local folder ${targetSubdir}/${folderName}!`,
    );
  } else {
    console.log(
      `\n✨ ${isTemplate ? "Template" : "Plugin"} "${packageName}" ejected successfully to local folder ${targetSubdir}/${folderName}!`,
    );
  }
}

export const ejectPlugin = ejectPackage;
