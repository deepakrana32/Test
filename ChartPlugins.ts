```typescript
// ChartPlugins.ts

// Event data types from ChartEventManager
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

type ChartEventData = ZoomEvent | PanEvent | ClickEvent;

// Supported event types
type ChartEventType = 'zoom' | 'pan' | 'click';

// Interface for chart plugins
interface ChartPlugin {
  /** Unique plugin name */
  name: string;
  /** Optional priority for execution order (lower runs first) */
  priority?: number;
  /** Initializes plugin for WebGPU rendering */
  initializeGPU?(device: GPUDevice): Promise<void>;
  /** Renders plugin content for WebGPU */
  renderGPU?(pass: GPURenderPassEncoder): void;
  /** Initializes plugin for 2D canvas rendering */
  initialize2D?(ctx: CanvasRenderingContext2D): void;
  /** Renders plugin content for 2D canvas */
  render2D?(ctx: CanvasRenderingContext2D): void;
  /** Handles zoom events */
  onEvent?(event: ChartEventType, data: ChartEventData): void;
  /** Cleans up plugin resources */
  destroy?(): void;
}

/**
 * Manages a collection of chart plugins for rendering and event handling.
 */
export class ChartPlugins {
  private plugins: ChartPlugin[] = [];
  private gpuInitPlugins: ChartPlugin[] = [];
  private gpuRenderPlugins: ChartPlugin[] = [];
  private canvasInitPlugins: ChartPlugin[] = [];
  private canvasRenderPlugins: ChartPlugin[] = [];
  private eventPlugins: { [key in ChartEventType]?: ChartPlugin[] } = {};

  /**
   * Registers a new plugin.
   * @param plugin The plugin to register.
   * @throws Error if plugin is invalid or already registered.
   */
  register(plugin: ChartPlugin): void {
    if (!plugin || typeof plugin !== 'object' || !plugin.name) {
      throw new Error('Invalid plugin: must be an object with a unique name');
    }

    // Check for duplicate plugin
    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    // Validate that plugin implements at least one method
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

    // Assign default priority if not provided
    const pluginWithPriority = { ...plugin, priority: plugin.priority ?? 0 };

    // Add to main plugin list (sorted by priority)
    this.plugins.push(pluginWithPriority);
    this.plugins.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    // Cache plugins for specific methods
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
      ['zoom', 'pan', 'click'].forEach(event => {
        if (!this.eventPlugins[event as ChartEventType]) {
          this.eventPlugins[event as ChartEventType] = [];
        }
        this.eventPlugins[event as ChartEventType]!.push(pluginWithPriority);
      });
    }
  }

  /**
   * Removes a plugin by name.
   * @param name The name of the plugin to remove.
   */
  removePlugin(name: string): void {
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

    // Notify plugin of removal
    const plugin = this.plugins.find(p => p.name === name);
    if (plugin?.destroy) {
      try {
        plugin.destroy();
      } catch (error) {
        console.warn(`Plugin "${name}" cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Initializes plugins for WebGPU rendering.
   * @param device The GPU device.
   */
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

  /**
   * Renders plugins for WebGPU.
   * @param pass The render pass encoder.
   */
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

  /**
   * Initializes plugins for 2D canvas rendering.
   * @param ctx The 2D canvas context.
   */
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

  /**
   * Renders plugins for 2D canvas.
   * @param ctx The 2D canvas context.
   */
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

  /**
   * Dispatches an event to plugins.
   * @param event The event type (e.g., 'zoom', 'pan', 'click').
   * @param data The event data.
   */
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

  /**
   * Cleans up all plugins and clears the plugin list.
   */
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
```