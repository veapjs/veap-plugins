import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { AppError } from "@veap/kernel";
import type { Output } from "@veap/kernel/cli";
import { detectPackageManager } from "./package-manager.js";
import { findProjectRoot, regeneratePluginsRegistry } from "./utils.js";

export interface AddPluginOptions {
  rootDir?: string;
  local?: boolean;
  skipInstall?: boolean;
  output?: Output;
}

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

function logInfo(output: Output | undefined, message: string): void {
  if (output) {
    output.info(message);
  } else {
    console.log(message);
  }
}

function logSuccess(output: Output | undefined, message: string): void {
  if (output) {
    output.success(message);
  } else {
    console.log(message);
  }
}

function fail(output: Output | undefined, message: string): never | void {
  if (output) {
    throw AppError.BadRequest(message);
  }
  console.error(`Error: ${message}`);
  process.exit(1);
}

function resolveCandidatePluginDir(
  rootDir: string,
  pluginArg: string,
): string | null {
  const cleanFolder = pluginArg.replace(/^@[^/]+\//, "");
  const candidates = [
    path.join(rootDir, "plugins", cleanFolder),
    path.join(rootDir, "node_modules", pluginArg),
    path.join(rootDir, "node_modules", `@veap/${cleanFolder}`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

function linkWorkspaceDependency(
  rootDir: string,
  pluginName: string,
  versionSpec = "workspace:*",
): void {
  const rootPkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(rootPkgPath)) return;

  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
  if (versionSpec === "workspace:*" && Array.isArray(rootPkg.workspaces)) {
    if (!rootPkg.workspaces.includes("plugins/*")) {
      rootPkg.workspaces.push("plugins/*");
    }
  }
  rootPkg.dependencies = rootPkg.dependencies || {};
  rootPkg.dependencies[pluginName] = versionSpec;
  fs.writeFileSync(
    rootPkgPath,
    `${JSON.stringify(rootPkg, null, 2)}\n`,
    "utf-8",
  );
}

export async function addPlugin(
  pluginArg: string,
  options?: AddPluginOptions,
): Promise<void> {
  const output = options?.output;
  const trimmedArg = (pluginArg ?? "").trim();
  if (!trimmedArg) {
    return fail(output, "A plugin package name or Git URL is required.");
  }

  const rootDir = options?.rootDir ?? findProjectRoot(process.cwd());
  logInfo(output, `Adding plugin: ${trimmedArg}...`);

  let pluginDir = "";
  let pluginPkgJsonPath = "";

  if (options?.local) {
    const existingDir = resolveCandidatePluginDir(rootDir, trimmedArg);
    if (existingDir) {
      pluginDir = existingDir;
      pluginPkgJsonPath = path.join(pluginDir, "package.json");
      const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgJsonPath, "utf-8"));
      const pluginName =
        pluginPkg.name ||
        (trimmedArg.startsWith("@") ? trimmedArg : `@veap/${trimmedArg}`);
      linkWorkspaceDependency(rootDir, pluginName, "workspace:*");
    } else {
      // Local installation from Git URL or npm package
      let gitUrl = trimmedArg;
      const isGitUrl =
        /^(git|http|https|github):/.test(trimmedArg) ||
        trimmedArg.endsWith(".git");

      if (!isGitUrl) {
        logInfo(
          output,
          `Fetching Git repository URL for package ${trimmedArg}...`,
        );
        try {
          const repoUrl = execSync(`npm view ${trimmedArg} repository.url`, {
            stdio: "pipe",
          })
            .toString()
            .trim();
          if (repoUrl) {
            gitUrl = repoUrl;
            logInfo(output, `Found repository URL: ${gitUrl}`);
          } else {
            return fail(
              output,
              `Could not find repository URL for ${trimmedArg}.`,
            );
          }
        } catch (_err) {
          return fail(
            output,
            `Failed to fetch package details for ${trimmedArg}.`,
          );
        }
      }

      // Normalize git URL
      if (gitUrl.startsWith("git+")) {
        gitUrl = gitUrl.slice(4);
      }
      if (gitUrl.startsWith("git://")) {
        gitUrl = `https://${gitUrl.slice(6)}`;
      }

      const repoName =
        gitUrl
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") || "custom-plugin";
      pluginDir = path.join(rootDir, "plugins", repoName);

      if (fs.existsSync(pluginDir)) {
        return fail(output, `Local plugin already exists in ${pluginDir}.`);
      }

      const pluginsBaseDir = path.join(rootDir, "plugins");
      if (!fs.existsSync(pluginsBaseDir)) {
        fs.mkdirSync(pluginsBaseDir, { recursive: true });
      }

      logInfo(output, `Cloning repository ${gitUrl} to plugins/${repoName}...`);
      try {
        execSync(`git clone ${gitUrl} "${pluginDir}"`, { stdio: "ignore" });
        logSuccess(output, `Cloned repository to plugins/${repoName}`);
      } catch (_err) {
        return fail(output, `Failed to clone repository ${gitUrl}.`);
      }

      pluginPkgJsonPath = path.join(pluginDir, "package.json");

      if (fs.existsSync(pluginPkgJsonPath)) {
        try {
          const pluginPkg = JSON.parse(
            fs.readFileSync(pluginPkgJsonPath, "utf-8"),
          );
          const pluginName = pluginPkg.name || repoName;
          linkWorkspaceDependency(rootDir, pluginName, "workspace:*");
        } catch (_) {}
      }
    }

    // Run install to link the workspace package
    if (!options?.skipInstall) {
      const pm = detectPackageManager(rootDir);
      logInfo(output, `Linking local plugin with ${pm} install...`);
      try {
        execSync(`${pm} install`, { cwd: rootDir, stdio: "ignore" });
        logSuccess(output, "Plugin linked successfully.");
      } catch (_err) {
        if (output) {
          output.warn(`Failed to run ${pm} install automatically.`);
        } else {
          console.warn(`Failed to run ${pm} install automatically.`);
        }
      }
    }
  } else {
    // NPM installation via package manager
    if (!options?.skipInstall) {
      const pm = detectPackageManager(rootDir);
      const installCmd = pm === "npm" ? "install" : "add";
      const workspaceFlag = pm === "npm" ? "" : "-w";

      logInfo(output, `Installing npm package ${trimmedArg}...`);
      try {
        execSync(`${pm} ${installCmd} ${trimmedArg} ${workspaceFlag}`.trim(), {
          cwd: rootDir,
          stdio: output ? "pipe" : "inherit",
        });
        logSuccess(output, `Package ${trimmedArg} installed.`);
      } catch (_err) {
        return fail(output, `Failed to install package ${trimmedArg}.`);
      }
    }

    const candidateDir = resolveCandidatePluginDir(rootDir, trimmedArg);
    if (candidateDir) {
      pluginDir = candidateDir;
      pluginPkgJsonPath = path.join(pluginDir, "package.json");
      const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgJsonPath, "utf-8"));
      if (pluginPkg.name) {
        linkWorkspaceDependency(
          rootDir,
          pluginPkg.name,
          pluginPkg.version ? `^${pluginPkg.version}` : "latest",
        );
      }
    } else {
      // Resolve where it is installed in node_modules
      const projectPkgPath = path.join(rootDir, "package.json");
      let resolvedPkgName = trimmedArg;
      if (fs.existsSync(projectPkgPath)) {
        const projectPkg = JSON.parse(fs.readFileSync(projectPkgPath, "utf-8"));
        const deps = {
          ...(projectPkg.dependencies || {}),
          ...(projectPkg.devDependencies || {}),
        };
        for (const [name, val] of Object.entries(deps)) {
          if (
            val === trimmedArg ||
            (typeof val === "string" && val.includes(trimmedArg)) ||
            name === trimmedArg
          ) {
            resolvedPkgName = name;
            break;
          }
        }
      }

      pluginDir = path.join(rootDir, "node_modules", resolvedPkgName);
      pluginPkgJsonPath = path.join(pluginDir, "package.json");
    }
  }

  if (!fs.existsSync(pluginPkgJsonPath)) {
    return fail(
      output,
      `Cannot find package.json for plugin at ${pluginPkgJsonPath}`,
    );
  }

  const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgJsonPath, "utf-8"));
  const veapMeta = pluginPkg.veap || {};

  // 1. Configure environment variables (.env)
  if (veapMeta.env) {
    const envPath = path.join(rootDir, ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    logInfo(
      output,
      `Configuring environment variables for ${pluginPkg.name || trimmedArg}:`,
    );

    const envEntries: Array<{
      key: string;
      description?: string;
      required?: boolean;
    }> = Array.isArray(veapMeta.env)
      ? veapMeta.env.map((item: any) => ({
          key: item.key || item.name,
          description: item.description,
          required: item.required,
        }))
      : Object.entries(veapMeta.env).map(
          ([varName, varConfig]: [string, any]) => ({
            key: varName,
            description: varConfig?.description,
            required: varConfig?.required,
          }),
        );

    for (const entry of envEntries) {
      const varName = entry.key;
      if (!varName) continue;

      const regex = new RegExp(`^${varName}=`, "m");
      if (regex.test(envContent)) {
        logInfo(output, `${varName} is already configured in .env`);
        continue;
      }

      const desc = entry.description || "No description provided";
      const reqStr = entry.required ? " (required)" : " (optional)";
      const promptText = `Enter value for ${varName} - ${desc}${reqStr}:`;
      let value = "";

      while (true) {
        if (output) {
          value = await output.ask(promptText, {
            default: entry.required ? undefined : "",
          });
        } else {
          value = await askQuestion(`? ${promptText} `);
        }
        if (entry.required && !value.trim()) {
          if (output) {
            output.warn(`${varName} is required.`);
          } else {
            console.log(`  Error: ${varName} is required.`);
          }
          continue;
        }
        break;
      }

      envContent += `\n# Added by Veap CLI for ${pluginPkg.name}\n${varName}=${value}\n`;
    }
    fs.writeFileSync(envPath, envContent, "utf-8");
    logSuccess(output, "Environment variables saved to .env");
  }

  // 2. Install dependencies recursively
  if (veapMeta.dependencies && Array.isArray(veapMeta.dependencies)) {
    logInfo(
      output,
      `Installing dependencies for ${pluginPkg.name || trimmedArg}...`,
    );
    for (const dep of veapMeta.dependencies) {
      await addPlugin(dep, options);
    }
  }

  // 3. Regenerate plugins.gen.ts
  regeneratePluginsRegistry(rootDir, output);

  logSuccess(output, `Plugin "${pluginPkg.name || trimmedArg}" is ready!`);
}
