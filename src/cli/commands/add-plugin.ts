import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { addPlugin } from "../add.js";

/**
 * Installs a Veap plugin package, configures its required environment variables,
 * installs transitive plugin dependencies, and regenerates `lib/plugins.gen.ts`.
 */
export class AddPluginCommand extends Command {
  static signature =
    "add {plugin : Plugin name (e.g. blog-plugin or @veap/blog-plugin)} {--local : Link as workspace:* dependency} {--skip-install : Skip running package manager install}";
  static description =
    "Install a Veap plugin and regenerate the plugin registry";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const plugin = input.argument("plugin") ?? "";
    const local = input.flag("local");
    const skipInstall = input.flag("skip-install");

    await addPlugin(plugin, {
      local,
      skipInstall,
      rootDir: this.context.root,
      output,
    });

    return 0;
  }
}
