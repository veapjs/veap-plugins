import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { regeneratePluginsRegistry } from "../utils.js";

/**
 * Scans `package.json` for installed Veap plugins and regenerates `lib/plugins.gen.ts`.
 */
export class PluginsSyncCommand extends Command {
  static signature = "plugins:sync";
  static description =
    "Scan package.json for Veap plugins and regenerate lib/plugins.gen.ts";

  async handle(_input: CommandInput, output: Output): Promise<number> {
    regeneratePluginsRegistry(this.context.root, output);
    return 0;
  }
}
