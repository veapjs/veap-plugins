import { Command, type CommandInput, type Output } from "@veap/kernel/cli";
import { ejectPackage } from "../eject.js";

/**
 * Ejects an installed plugin or template into local `plugins/` or `templates/` directory
 * for direct customization and links it via `workspace:*`.
 */
export class EjectPluginCommand extends Command {
  static signature =
    "eject {package : Installed plugin or template package name (e.g. @veap/blog-plugin)} {--skip-install : Skip running package manager install}";
  static description =
    "Eject an installed plugin or template into the local project directory";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const pkgName = input.argument("package") ?? "";
    const skipInstall = input.flag("skip-install");

    await ejectPackage(pkgName, {
      skipInstall,
      rootDir: this.context.root,
      output,
    });

    return 0;
  }
}
