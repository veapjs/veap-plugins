import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { PluginRegistry } from "../../registry/registry.service.js";

/**
 * Lists all registered plugins and their status (`id`, `name`, `version`, `enabled`, `installed`, `system`).
 */
export class ListPluginsCommand extends Command {
  static signature = "list-plugins";
  static description = "List all registered plugins and their runtime status";

  async handle(_input: CommandInput, output: Output): Promise<number> {
    if (!this.context.container.has(PluginRegistry)) {
      output.info("No plugins are registered.");
      return 0;
    }

    const registry =
      await this.context.container.resolve<PluginRegistry>(PluginRegistry);
    const plugins = await registry.getPluginsStatus();

    if (plugins.length === 0) {
      output.info("No plugins are registered.");
      return 0;
    }

    output.table(
      ["ID", "Name", "Version", "Enabled", "Installed", "System"],
      plugins.map((p) => [
        p.id,
        p.name,
        p.version,
        p.enabled ? "yes" : "no",
        p.installed ? "yes" : "no",
        p.system ? "yes" : "no",
      ]),
    );

    return 0;
  }
}
