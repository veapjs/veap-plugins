import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { generatePlugin } from "../generate-plugin.js";

/**
 * Scaffolds a new local Veap plugin in `plugins/<name>-plugin` and registers it in the project.
 */
export class MakePluginCommand extends Command {
  static signature =
    "make:plugin {name : Name of the new plugin (e.g. newsletter)} {--dir=plugins : Target directory relative to project root} {--skip-register : Skip registering in package.json and plugins.gen.ts}";
  static description = "Scaffold a new local Veap plugin";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const name = input.argument("name") ?? "";
    const dirOpt = input.option("dir");
    const dir =
      typeof dirOpt === "string" && dirOpt.trim() !== ""
        ? dirOpt.trim()
        : "plugins";
    const skipRegister = input.flag("skip-register");

    await generatePlugin(name, {
      dir,
      skipRegister,
      rootDir: this.context.root,
      output,
    });

    return 0;
  }
}
