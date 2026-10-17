import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Application, container } from "@veap/kernel";
import { BufferedOutput, ConsoleApplication, commands } from "@veap/kernel/cli";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/composition.js";
import type { IPlugin } from "../src/common/index.js";
import { PluginsServiceProvider } from "../src/providers/plugins.provider.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

let root: string;

function buildApp(plugins: IPlugin[] = [], onEnableSpy?: () => void) {
  const testPlugins =
    onEnableSpy && plugins.length > 0
      ? plugins.map((p) => ({ ...p, onEnable: onEnableSpy }))
      : plugins;

  return Application.configure()
    .use(
      (c) =>
        new PluginsServiceProvider(c, {
          plugins: testPlugins,
          autoMigrate: false,
        }),
    )
    .create();
}

interface RunOptions {
  application?: ReturnType<typeof buildApp>;
  output?: BufferedOutput;
}

function run(argv: string[], options: RunOptions = {}) {
  const output = options.output ?? new BufferedOutput();

  return {
    output,
    code: new ConsoleApplication({
      root,
      argv,
      output,
      application: options.application ?? buildApp(),
      chdir: false,
      shutdown: true,
    }).run(),
  };
}

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>;
  delete globals.__VEAP_BOOTSTRAPPED__;
  delete globals.__VEAP_BOOTSTRAPPING_PROMISE__;
  globals.__VEAP_ACTIVE_PROVIDERS__ = [];

  container.reset();
  commands.clear();
  vi.clearAllMocks();

  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-plugins-cli-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "plugins-cli-fixture",
        workspaces: ["packages/*"],
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("@veap/plugins CLI integration with @veap/kernel/cli", () => {
  it("registers all 6 plugin commands via PluginsServiceProvider.commands()", async () => {
    const { code, output } = run(["list"]);
    expect(await code).toBe(0);

    const text = output.text();
    expect(text).toContain("list-plugins");
    expect(text).toContain("add");
    expect(text).toContain("remove");
    expect(text).toContain("eject");
    expect(text).toContain("make:plugin");
    expect(text).toContain("plugins:sync");
  });

  it("skips automatic plugin initialization side effects when VEAP_CLI=1", async () => {
    const onEnableSpy = vi.fn();
    const samplePlugin: IPlugin = {
      manifest: {
        id: "blog",
        name: "Blog Plugin",
        version: "0.1.7",
        description: "Blog",
        system: true,
      },
    };

    const app = buildApp([samplePlugin], onEnableSpy);
    const { code, output } = run(["list-plugins"], { application: app });

    expect(await code).toBe(0);
    expect(onEnableSpy).not.toHaveBeenCalled();
    expect(output.text()).toContain("blog");
    expect(output.text()).toContain("Blog Plugin");
  });

  it("list-plugins outputs a message when no plugins are registered", async () => {
    const { code, output } = run(["list-plugins"], {
      application: buildApp([]),
    });

    expect(await code).toBe(0);
    expect(output.text()).toContain("No plugins are registered.");
  });

  it("make:plugin scaffolds a new local plugin and updates package.json + plugins.gen.ts", async () => {
    const { code } = run(["make:plugin", "newsletter"]);
    expect(await code).toBe(0);

    const pluginDir = path.join(root, "plugins", "newsletter-plugin");
    expect(fs.existsSync(path.join(pluginDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "src", "index.ts"))).toBe(true);

    const indexContent = fs.readFileSync(
      path.join(pluginDir, "src", "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain(
      "export class NewsletterPlugin implements IPlugin",
    );
    expect(indexContent).toContain(
      "manifest = createManifestFromPackageJson(pkg)",
    );
    expect(indexContent).toContain("async init()");
    expect(indexContent).toContain("async onEnable()");
    expect(indexContent).toContain("async onDisable()");
    expect(indexContent).toContain("export default new NewsletterPlugin()");
    expect(indexContent).not.toContain("register(");
    expect(indexContent).not.toContain("boot(");

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    expect(rootPkg.dependencies["@veap/newsletter-plugin"]).toBe("workspace:*");
    expect(rootPkg.workspaces).toContain("plugins/*");

    const genFile = path.join(root, "lib", "plugins.gen.ts");
    expect(fs.existsSync(genFile)).toBe(true);
    expect(fs.readFileSync(genFile, "utf-8")).toContain(
      "@veap/newsletter-plugin",
    );
  });

  it("make:plugin respects --dir and --skip-register", async () => {
    const { code } = run([
      "make:plugin",
      "analytics",
      "--dir=custom-plugins",
      "--skip-register",
    ]);
    expect(await code).toBe(0);

    const pluginDir = path.join(root, "custom-plugins", "analytics-plugin");
    expect(fs.existsSync(path.join(pluginDir, "src", "index.ts"))).toBe(true);

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    expect(rootPkg.dependencies["@veap/analytics-plugin"]).toBeUndefined();
  });

  it("make:plugin fails with exit code 1 if plugin directory already exists", async () => {
    await run(["make:plugin", "dup"]).code;
    const { code, output } = run(["make:plugin", "dup"]);

    expect(await code).toBe(1);
    expect(output.text()).toContain("dup-plugin");
  });

  it("add installs a plugin, prompts for required env vars, and regenerates plugins.gen.ts", async () => {
    const nmPluginDir = path.join(root, "node_modules", "@veap", "blog-plugin");
    fs.mkdirSync(nmPluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(nmPluginDir, "package.json"),
      JSON.stringify({
        name: "@veap/blog-plugin",
        version: "0.1.7",
        veap: {
          type: "plugin",
          env: [
            {
              key: "BLOG_API_KEY",
              description: "API Key for blog",
              required: true,
            },
          ],
        },
      }),
    );

    const output = new BufferedOutput();
    output.queueAnswer("secret-123");

    const { code } = run(["add", "blog-plugin", "--local", "--skip-install"], {
      output,
    });
    expect(await code).toBe(0);

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    expect(rootPkg.dependencies["@veap/blog-plugin"]).toBe("workspace:*");

    const envContent = fs.readFileSync(path.join(root, ".env"), "utf-8");
    expect(envContent).toContain("BLOG_API_KEY=secret-123");

    const genContent = fs.readFileSync(
      path.join(root, "lib", "plugins.gen.ts"),
      "utf-8",
    );
    expect(genContent).toContain("@veap/blog-plugin");
  });

  it("remove deletes a plugin from package.json and updates plugins.gen.ts", async () => {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(
        {
          name: "plugins-cli-fixture",
          dependencies: {
            "@veap/blog-plugin": "workspace:*",
          },
        },
        null,
        2,
      ),
    );

    const { code } = run(["remove", "blog-plugin", "--skip-install"]);
    expect(await code).toBe(0);

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    expect(rootPkg.dependencies["@veap/blog-plugin"]).toBeUndefined();

    const genContent = fs.readFileSync(
      path.join(root, "lib", "plugins.gen.ts"),
      "utf-8",
    );
    expect(genContent).not.toContain("@veap/blog-plugin");
  });

  it("eject clones plugin repository and links it as workspace:*", async () => {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(
        {
          name: "plugins-cli-fixture",
          workspaces: ["packages/*"],
          dependencies: {
            "@veap/media-plugin": "^0.1.7",
          },
        },
        null,
        2,
      ),
    );

    const nmDir = path.join(root, "node_modules", "@veap", "media-plugin");
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(
      path.join(nmDir, "package.json"),
      JSON.stringify({
        name: "@veap/media-plugin",
        repository: {
          url: "https://github.com/veapjs/media-plugin.git",
        },
      }),
    );

    const { code } = run(["eject", "@veap/media-plugin", "--skip-install"]);
    expect(await code).toBe(0);

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining(
        "git clone https://github.com/veapjs/media-plugin.git",
      ),
      expect.anything(),
    );

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    expect(rootPkg.dependencies["@veap/media-plugin"]).toBe("workspace:*");
    expect(rootPkg.workspaces).toContain("plugins/*");
  });

  it("plugins:sync scans package.json and regenerates lib/plugins.gen.ts", async () => {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(
        {
          name: "plugins-cli-fixture",
          dependencies: {
            "@veap/panel-plugin": "^0.1.7",
          },
        },
        null,
        2,
      ),
    );

    const { code } = run(["plugins:sync"]);
    expect(await code).toBe(0);

    const genContent = fs.readFileSync(
      path.join(root, "lib", "plugins.gen.ts"),
      "utf-8",
    );
    expect(genContent).toContain("@veap/panel-plugin");
  });
});
