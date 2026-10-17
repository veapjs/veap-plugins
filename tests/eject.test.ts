import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ejectPackage } from "../src/cli/eject";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("ejectPackage CLI", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veap-eject-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails if root package.json is missing", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ejectPackage("@veap/auth-plugin");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot find root package.json"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("fails if package is not listed in root dependencies", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: {} }),
    );

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ejectPackage("@veap/auth-plugin");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not installed in dependencies"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("ejects plugin repository correctly", async () => {
    // 1. Setup root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "@veap/auth-plugin": "^0.1.0",
        },
      }),
    );

    // 2. Setup installed package in node_modules
    const nodeModulesPkg = path.join(
      tmpDir,
      "node_modules",
      "@veap",
      "auth-plugin",
    );
    fs.mkdirSync(nodeModulesPkg, { recursive: true });
    fs.writeFileSync(
      path.join(nodeModulesPkg, "package.json"),
      JSON.stringify({
        name: "@veap/auth-plugin",
        repository: {
          url: "https://github.com/veap/auth-plugin.git",
        },
      }),
    );

    await ejectPackage("@veap/auth-plugin");

    // Check if git clone was called
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining(
        "git clone https://github.com/veap/auth-plugin.git",
      ),
      expect.anything(),
    );

    // Check if package.json dependency was updated to workspace:*
    const updatedPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(updatedPkg.dependencies["@veap/auth-plugin"]).toBe("workspace:*");
  });

  it("ejects template into templates/ directory", async () => {
    // 1. Setup root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "admin-template": "^0.1.0",
        },
      }),
    );

    // 2. Setup installed template package
    const nodeModulesPkg = path.join(tmpDir, "node_modules", "admin-template");
    fs.mkdirSync(nodeModulesPkg, { recursive: true });
    fs.writeFileSync(
      path.join(nodeModulesPkg, "package.json"),
      JSON.stringify({
        name: "admin-template",
        veap: { type: "template" },
        repository: "https://github.com/veap/admin-template.git",
      }),
    );

    await ejectPackage("admin-template");

    // Check git clone into templates/
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining(
        "git clone https://github.com/veap/admin-template.git",
      ),
      expect.anything(),
    );
  });
});
