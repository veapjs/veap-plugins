import { ApplicationBuilder, ServiceProvider } from "@veap/kernel";
import { APP_PLUGINS } from "./common/tokens.js";
import { PluginsServiceProvider } from "./providers/plugins.provider.js";

declare module "@veap/kernel" {
  interface ApplicationBuilder {
    /**
     * Registers plugins with the application IoC container and configures PluginsServiceProvider.
     */
    withPlugins(plugins: any[]): this;
  }
}

class PluginsConfigProvider extends ServiceProvider {
  private plugins: any[];

  constructor(container: any, plugins: any[] = []) {
    super(container);
    this.plugins = plugins;
  }

  register(): void {
    this.container.register({ token: APP_PLUGINS, useValue: this.plugins });
    this.container.register({ token: "AppPlugins", useValue: this.plugins });
  }
}

if (!(ApplicationBuilder.prototype as any).withPlugins) {
  ApplicationBuilder.prototype.withPlugins = function (plugins: any[]) {
    return this.use((c) => new PluginsConfigProvider(c, plugins)).use(
      PluginsServiceProvider,
    );
  };
}

export { PluginsConfigProvider };
