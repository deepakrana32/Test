// ChartPlugins.ts
interface ZoomEvent {
  delta: number;
  x: number;
}

interface PanEvent {
  dx: number;
}

interface ClickEvent {
  x: number;
  y: number;
}

interface HoverEvent {
  x: number;
  y: number;
}

interface RightClickEvent {
  x: number;
  y: number;
}

type ChartEventData = ZoomEvent | PanEvent | ClickEvent | HoverEvent | RightClickEvent;

type ChartEventType = 'zoom' | 'pan' | 'click' | 'hover' | 'rightclick';

interface ChartPlugin {
  name: string;
  priority?: number;
  initializeGPU?(device: GPUDevice): Promise<void>;
  renderGPU?(pass: GPURenderPassEncoder): void;
  initialize2D?(ctx: CanvasRenderingContext2D): void;
  render2D?(ctx: CanvasRenderingContext2D): void;
  onEvent?(event: ChartEventType, data: ChartEventData): void;
  destroy?(): void;
}

export class ChartPlugins {
  private plugins: ChartPlugin[] = [];
  private gpuInitPlugins: ChartPlugin[] = [];
  private gpuRenderPlugins: ChartPlugin[] = [];
  private canvasInitPlugins: ChartPlugin[] = [];
  private canvasRenderPlugins: ChartPlugin[] = [];
  private eventPlugins: { [key in ChartEventType]?: ChartPlugin[] } = {};

  register(plugin: ChartPlugin): void {
    if (!plugin || typeof plugin !== 'object' || !plugin.name) {
      throw new Error('Invalid plugin: must be an object with a unique name');
    }

    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    if (
      !plugin.initializeGPU &&
      !plugin.renderGPU &&
      !plugin.initialize2D &&
      !plugin.render2D &&
      !plugin.onEvent &&
      !plugin.destroy
    ) {
      throw new Error(`Plugin "${plugin.name}" must implement at least one lifecycle or event method`);
    }

    const pluginWithPriority = { ...plugin, priority: plugin.priority ?? 0 };

    this.plugins.push(pluginWithPriority);
    this.plugins.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    if (pluginWithPriority.initializeGPU) {
      this.gpuInitPlugins.push(pluginWithPriority);
    }
    if (pluginWithPriority.renderGPU) {
      this.gpuRenderPlugins.push(pluginWithPriority);
    }
    if (pluginWithPriority.initialize2D) {
      this.canvasInitPlugins.push(pluginWithPriority);
    }
    if (pluginWithPriority.render2D) {
      this.canvasRenderPlugins.push(pluginWithPriority);
    }
    if (pluginWithPriority.onEvent) {
      ['zoom', 'pan', 'click', 'hover', 'rightclick'].forEach(event => {
        if (!this.eventPlugins[event as ChartEventType]) {
          this.eventPlugins[event as ChartEventType] = [];
        }
        this.eventPlugins[event as ChartEventType]!.push(pluginWithPriority);
      });
    }
  }

  removePlugin(name: string): void {
    const plugin = this.plugins.find(p => p.name === name);
    if (plugin?.destroy) {
      try {
        plugin.destroy();
      } catch (error) {
        console.warn(`Plugin "${name}" cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    this.plugins = this.plugins.filter(p => p.name !== name);
    this.gpuInitPlugins = this.gpuInitPlugins.filter(p => p.name !== name);
    this.gpuRenderPlugins = this.gpuRenderPlugins.filter(p => p.name !== name);
    this.canvasInitPlugins = this.canvasInitPlugins.filter(p => p.name !== name);
    this.canvasRenderPlugins = this.canvasRenderPlugins.filter(p => p.name !== name);
    for (const event in this.eventPlugins) {
      this.eventPlugins[event as ChartEventType] = this.eventPlugins[event as ChartEventType]?.filter(
        p => p.name !== name
      );
      if (this.eventPlugins[event as ChartEventType]?.length === 0) {
        delete this.eventPlugins[event as ChartEventType];
      }
    }
  }

  async initializeGPU(device: GPUDevice): Promise<void> {
    for (const plugin of this.gpuInitPlugins) {
      try {
        if (plugin.initializeGPU) {
          await plugin.initializeGPU(device);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" GPU initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  renderGPU(pass: GPURenderPassEncoder): void {
    for (const plugin of this.gpuRenderPlugins) {
      try {
        if (plugin.renderGPU) {
          plugin.renderGPU(pass);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" GPU render failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  initialize2D(ctx: CanvasRenderingContext2D): void {
    for (const plugin of this.canvasInitPlugins) {
      try {
        if (plugin.initialize2D) {
          plugin.initialize2D(ctx);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" 2D initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  render2D(ctx: CanvasRenderingContext2D): void {
    for (const plugin of this.canvasRenderPlugins) {
      try {
        if (plugin.render2D) {
          plugin.render2D(ctx);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" 2D render failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  dispatchEvent(event: ChartEventType, data: ChartEventData): void {
    const plugins = this.eventPlugins[event] || [];
    for (const plugin of plugins) {
      try {
        if (plugin.onEvent) {
          plugin.onEvent(event, data);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" event "${event}" failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  destroy(): void {
    for (const plugin of this.plugins) {
      if (plugin.destroy) {
        try {
          plugin.destroy();
        } catch (error) {
          console.warn(
            `Plugin "${plugin.name}" cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
    this.plugins = [];
    this.gpuInitPlugins = [];
    this.gpuRenderPlugins = [];
    this.canvasInitPlugins = [];
    this.canvasRenderPlugins = [];
    this.eventPlugins = {};
  }
}
