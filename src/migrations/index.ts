import { runMigrations } from "@veap/database";
import * as m0001 from "./0001_create_plugins_tables.js";

export const pluginMigrations = [m0001];

export async function runPluginMigrations(): Promise<void> {
  await runMigrations("plugins", pluginMigrations);
}

export default pluginMigrations;
