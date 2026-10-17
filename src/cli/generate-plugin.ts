import fs from "node:fs";
import path from "node:path";
import type { Output } from "@veap/kernel/cli";
import { AppError } from "@veap/kernel/errors";
import { regeneratePluginsRegistry } from "./utils.js";

export interface GeneratePluginOptions {
  /** Target base directory relative to rootDir (default: "plugins") */
  dir?: string;
  /** Project root directory (defaults to process.cwd()) */
  rootDir?: string;
  /** Skip adding to root package.json and regenerating plugins.gen.ts */
  skipRegister?: boolean;
  /** Legacy alias for skipRegister */
  skipInstall?: boolean;
  /** Optional CLI output port */
  output?: Output;
}

function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/^@[^/]+\//, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toTitleCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generatePlugin(
  rawName: string,
  options: GeneratePluginOptions = {},
): Promise<{ pluginDir: string; packageName: string; pluginId: string }> {
  const out = options.output;
  const rootDir = options.rootDir ?? process.cwd();
  const baseSubdir = options.dir ?? "plugins";

  const cleanKebab = toKebabCase(rawName);
  if (!cleanKebab || !/^[a-z0-9][a-z0-9-]*$/.test(cleanKebab)) {
    throw AppError.BadRequest(
      `Invalid plugin name: "${rawName}". Use letters, numbers, and hyphens (e.g. "newsletter" or "blog-plugin").`,
    );
  }

  const folderName = cleanKebab.endsWith("-plugin")
    ? cleanKebab
    : `${cleanKebab}-plugin`;
  const pluginId = cleanKebab.replace(/-plugin$/, "");
  const packageName = rawName.startsWith("@") ? rawName : `@veap/${folderName}`;
  const pascalName = toPascalCase(pluginId);
  const titleName = toTitleCase(pluginId);

  const pluginDir = path.resolve(rootDir, baseSubdir, folderName);

  if (fs.existsSync(pluginDir)) {
    if (out) {
      throw AppError.Conflict(
        `Plugin directory already exists: ${path.relative(rootDir, pluginDir)}`,
      );
    }
    console.error(`Error: Plugin "${rawName}" already exists in ${pluginDir}`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });

  const pluginPkgJson = {
    name: packageName,
    version: "0.1.0",
    description: `${titleName} plugin for Veap`,
    type: "module",
    main: "./src/index.ts",
    types: "./src/index.ts",
    exports: {
      "./package.json": "./package.json",
      ".": "./src/index.ts",
    },
    veap: {
      type: "plugin",
      id: pluginId,
      name: titleName,
      description: `${titleName} plugin for Veap`,
      enabled: true,
      system: false,
      hasSetup: false,
    },
    peerDependencies: {
      "@veap/kernel": ">=0.2.0",
      "@veap/plugins": ">=0.1.7",
    },
  };

  fs.writeFileSync(
    path.join(pluginDir, "package.json"),
    `${JSON.stringify(pluginPkgJson, null, 2)}\n`,
    "utf-8",
  );

  const tsconfigJson = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      declaration: true,
      jsx: "react-jsx",
      types: ["node"],
    },
    include: ["src/**/*"],
  };

  fs.writeFileSync(
    path.join(pluginDir, "tsconfig.json"),
    `${JSON.stringify(tsconfigJson, null, 2)}\n`,
    "utf-8",
  );

  const indexTsContent = `import type { IPlugin } from "@veap/plugins";
import { createManifestFromPackageJson } from "@veap/plugins";
import pkg from "../package.json" with { type: "json" };

export class ${pascalName}Plugin implements IPlugin {
	manifest = createManifestFromPackageJson(pkg);

	async init(): Promise<void> {
		// Initialize plugin when the registry boots
	}

	async onEnable(): Promise<void> {
		// Called when the plugin is enabled
	}

	async onDisable(): Promise<void> {
		// Called when the plugin is disabled
	}
}

export default new ${pascalName}Plugin();
`;

  fs.writeFileSync(
    path.join(pluginDir, "src", "index.ts"),
    indexTsContent,
    "utf-8",
  );

  out?.success(
    `Scaffolded plugin "${packageName}" in ${path.relative(rootDir, pluginDir)}`,
  );

  const skipReg = options.skipRegister ?? options.skipInstall ?? false;
  const rootPkgPath = path.join(rootDir, "package.json");

  if (!skipReg && fs.existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
    rootPkg.dependencies = rootPkg.dependencies || {};
    rootPkg.dependencies[packageName] = "workspace:*";

    if (Array.isArray(rootPkg.workspaces)) {
      const pattern = `${baseSubdir}/*`;
      if (!rootPkg.workspaces.includes(pattern)) {
        rootPkg.workspaces.push(pattern);
      }
    }

    fs.writeFileSync(
      rootPkgPath,
      `${JSON.stringify(rootPkg, null, 2)}\n`,
      "utf-8",
    );
    out?.info(`Added "${packageName}": "workspace:*" to package.json.`);
    regeneratePluginsRegistry(rootDir, out);
  }

  return { pluginDir, packageName, pluginId };
}
