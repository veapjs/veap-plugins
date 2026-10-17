import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { removePlugin } from "../remove.js";

/**
 * Removes an installed Veap plugin from `package.json`, runs package manager install,
 * and regenerates `lib/plugins.gen.ts`.
 */
export class RemovePluginCommand extends Command {
  static signature =
    "remove {plugin : Plugin name (e.g. blog-plugin or @veap/blog-plugin)} {--skip-install : Skip running package manager install}";
  static description =
    "Remove an installed Veap plugin and regenerate the plugin registry";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const plugin = input.argument("plugin") ?? "";
    const skipInstall = input.flag("skip-install");

    await removePlugin(plugin, {
      skipInstall,
      rootDir: this.context.root,
      output,
    });

    return 0;
  }
}
