import { ChartPlugins } from './ChartPlugins';
import { ErrorHandler } from './ErrorHandler';

interface Plugin {
  id: string;
  init: (chartPlugins: ChartPlugins) => void;
  destroy: () => void;
}

export class PluginManager {
  private chartPlugins: ChartPlugins;
  private errorHandler: ErrorHandler;
  private plugins: Plugin[];

  constructor(chartPlugins: ChartPlugins, errorHandler: ErrorHandler) {
    if (!chartPlugins || !errorHandler) throw new Error('Missing dependencies');
    this.chartPlugins = chartPlugins;
    this.errorHandler = errorHandler;
    this.plugins = [];
  }

  loadPlugin(plugin: Plugin) {
    try {
      plugin.init(this.chartPlugins);
      this.plugins.push(plugin);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  unloadPlugin(id: string) {
    const plugin = this.plugins.find(p => p.id === id);
    if (plugin) {
      try {
        plugin.destroy();
        this.plugins = this.plugins.filter(p => p.id !== id);
      } catch (error) {
        this.errorHandler.handleError(error as Error);
      }
    }
  }

  getPlugins(): Plugin[] {
    return this.plugins;
  }

  destroy() {
    this.plugins.forEach(plugin => {
      try {
        plugin.destroy();
      } catch (error) {
        this.errorHandler.handleError(error as Error);
      }
    });
    this.plugins = [];
  }
}
