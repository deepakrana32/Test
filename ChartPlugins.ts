// ChartPlugins.ts
// Manages plugins for chart rendering, events, and lifecycle

import { GPUDevice, GPURenderPassEncoder } from 'webgpu';
import { WebGL2RenderingContext } from 'webgl2';

// Enhanced event interfaces
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

interface PinchEvent {
  scale: number;
  x: number;
  y: number;
}

interface DoubleClickEvent {
  x: number;
  y: number;
}

interface LongTapEvent {
  x: number;
  y: number;
}

interface CrosshairEvent {
  x: number;
  y: number;
  price: number;
  time: number;
}

interface MouseEnterEvent {
  x: number;
  y: number;
}

interface MouseLeaveEvent {
  x: number;
  y: number;
}

type ChartEventData =
  | ZoomEvent
  | PanEvent
  | ClickEvent
  | HoverEvent
  | RightClickEvent
  | PinchEvent
  | DoubleClickEvent
  | LongTapEvent
  | CrosshairEvent
  | MouseEnterEvent
  | MouseLeaveEvent;

type ChartEventType =
  | 'zoom'
  | 'pan'
  | 'click'
  | 'hover'
  | 'rightclick'
  | 'pinch'
  | 'doubleclick'
  | 'longtap'
  | 'crosshair'
  | 'mouseenter'
  | 'mouseleave';

// Plugin configuration interface
interface PluginConfig {
  [key: string]: any;
}

// Plugin dependency interface
interface PluginDependency {
  name: string;
  version?: string;
}

// Shared state interface
interface PluginState {
  [key: string]: any;
}

// Animation frame data
interface AnimationFrameData {
  timestamp: number;
  deltaTime: number;
}

// Screenshot data
interface ScreenshotData {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

interface ChartPlugin {
  name: string;
  version?: string;
  priority?: number;
  config?: PluginConfig;
  dependencies?: PluginDependency[];
  initializeGPU?(device: GPUDevice): Promise<void>;
  renderGPU?(pass: GPURenderPassEncoder): void;
  initializeWebGL?(gl: WebGL2RenderingContext): void;
  renderWebGL?(gl: WebGL2RenderingContext): void;
  initialize2D?(ctx: CanvasRenderingContext2D): void;
  render2D?(ctx: CanvasRenderingContext2D): void;
  onEvent?(event: ChartEventType, data: ChartEventData): void;
  onAnimationFrame?(data: AnimationFrameData): void;
  renderScreenshot?(data: ScreenshotData): void;
  destroy?(): void;
}

export class ChartPlugins {
  private plugins: ChartPlugin[] = [];
  private gpuInitPlugins: ChartPlugin[] = [];
  private gpuRenderPlugins: ChartPlugin[] = [];
  private webglInitPlugins: ChartPlugin[] = [];
  private webglRenderPlugins: ChartPlugin[] = [];
  private canvasInitPlugins: ChartPlugin[] = [];
  private canvasRenderPlugins: ChartPlugin[] = [];
  private animationPlugins: ChartPlugin[] = [];
  private screenshotPlugins: ChartPlugin[] = [];
  private eventPlugins: { [key in ChartEventType]?: ChartPlugin[] } = {};
  private sharedState: PluginState = {};
  private eventQueue: { event: ChartEventType; data: ChartEventData }[] = [];

  constructor() {
    // Initialize event plugin arrays
    [
      'zoom',
      'pan',
      'click',
      'hover',
      'rightclick',
      'pinch',
      'doubleclick',
      'longtap',
      'crosshair',
      'mouseenter',
      'mouseleave',
    ].forEach(event => {
      this.eventPlugins[event as ChartEventType] = [];
    });
  }

  register(plugin: ChartPlugin): void {
    if (!plugin || typeof plugin !== 'object' || !plugin.name) {
      throw new Error('Invalid plugin: must be an object with a unique name');
    }

    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    // Validate dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        const depPlugin = this.plugins.find(p => p.name === dep.name);
        if (!depPlugin) {
          throw new Error(`Dependency "${dep.name}" not found for plugin "${plugin.name}"`);
        }
        if (dep.version && depPlugin.version !== dep.version) {
          throw new Error(`Version mismatch for dependency "${dep.name}" in plugin "${plugin.name}"`);
        }
      }
    }

    // Validate at least one lifecycle/event method
    if (
      !plugin.initializeGPU &&
      !plugin.renderGPU &&
      !plugin.initializeWebGL &&
      !plugin.renderWebGL &&
      !plugin.initialize2D &&
      !plugin.render2D &&
      !plugin.onEvent &&
      !plugin.onAnimationFrame &&
      !plugin.renderScreenshot &&
      !plugin.destroy
    ) {
      throw new Error(`Plugin "${plugin.name}" must implement at least one lifecycle or event method`);
    }

    const pluginWithPriority = { ...plugin, priority: plugin.priority ?? 0 };

    this.plugins.push(pluginWithPriority);
    this.plugins.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    if (pluginWithPriority.initializeGPU) this.gpuInitPlugins.push(pluginWithPriority);
    if (pluginWithPriority.renderGPU) this.gpuRenderPlugins.push(pluginWithPriority);
    if (pluginWithPriority.initializeWebGL) this.webglInitPlugins.push(pluginWithPriority);
    if (pluginWithPriority.renderWebGL) this.webglRenderPlugins.push(pluginWithPriority);
    if (pluginWithPriority.initialize2D) this.canvasInitPlugins.push(pluginWithPriority);
    if (pluginWithPriority.render2D) this.canvasRenderPlugins.push(pluginWithPriority);
    if (pluginWithPriority.onAnimationFrame) this.animationPlugins.push(pluginWithPriority);
    if (pluginWithPriority.renderScreenshot) this.screenshotPlugins.push(pluginWithPriority);
    if (pluginWithPriority.onEvent) {
      [
        'zoom',
        'pan',
        'click',
        'hover',
        'rightclick',
        'pinch',
        'doubleclick',
        'longtap',
        'crosshair',
        'mouseenter',
        'mouseleave',
      ].forEach(event => {
        this.eventPlugins[event as ChartEventType]!.push(pluginWithPriority);
      });
    }

    // Apply initial config
    if (plugin.config) {
      this.updatePluginConfig(plugin.name, plugin.config);
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
    this.webglInitPlugins = this.webglInitPlugins.filter(p => p.name !== name);
    this.webglRenderPlugins = this.webglRenderPlugins.filter(p => p.name !== name);
    this.canvasInitPlugins = this.canvasInitPlugins.filter(p => p.name !== name);
    this.canvasRenderPlugins = this.canvasRenderPlugins.filter(p => p.name !== name);
    this.animationPlugins = this.animationPlugins.filter(p => p.name !== name);
    this.screenshotPlugins = this.screenshotPlugins.filter(p => p.name !== name);
    for (const event in this.eventPlugins) {
      this.eventPlugins[event as ChartEventType] = this.eventPlugins[event as ChartEventType]?.filter(
        p => p.name !== name
      );
      if (this.eventPlugins[event as ChartEventType]?.length === 0) {
        delete this.eventPlugins[event as ChartEventType];
      }
    }
    delete this.sharedState[name];
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

  initializeWebGL(gl: WebGL2RenderingContext): void {
    for (const plugin of this.webglInitPlugins) {
      try {
        if (plugin.initializeWebGL) {
          plugin.initializeWebGL(gl);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" WebGL initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  renderWebGL(gl: WebGL2RenderingContext): void {
    for (const plugin of this.webglRenderPlugins) {
      try {
        if (plugin.renderWebGL) {
          plugin.renderWebGL(gl);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" WebGL render failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    ctx.save();
    for (const plugin of this.canvasRenderPlugins) {
      try {
        if (plugin.render2D) {
          ctx.save();
          plugin.render2D(ctx);
          ctx.restore();
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" 2D render failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    ctx.restore();
  }

  async dispatchEvent(event: ChartEventType, data: ChartEventData): Promise<void> {
    this.eventQueue.push({ event, data });
    while (this.eventQueue.length > 0) {
      const { event: queuedEvent, data: queuedData } = this.eventQueue.shift()!;
      const plugins = this.eventPlugins[queuedEvent] || [];
      for (const plugin of plugins) {
        try {
          if (plugin.onEvent) {
            await plugin.onEvent(queuedEvent, queuedData);
          }
        } catch (error) {
          console.error(
            `Plugin "${plugin.name}" event "${queuedEvent}" failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  }

  onAnimationFrame(timestamp: number, deltaTime: number): void {
    const frameData: AnimationFrameData = { timestamp, deltaTime };
    for (const plugin of this.animationPlugins) {
      try {
        if (plugin.onAnimationFrame) {
          plugin.onAnimationFrame(frameData);
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" animation frame failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  renderScreenshot(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    const screenshotData: ScreenshotData = { ctx, width, height };
    for (const plugin of this.screenshotPlugins) {
      try {
        if (plugin.renderScreenshot) {
          ctx.save();
          plugin.renderScreenshot(screenshotData);
          ctx.restore();
        }
      } catch (error) {
        console.error(
          `Plugin "${plugin.name}" screenshot render failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    ctx.restore();
  }

  updatePluginConfig(name: string, config: PluginConfig): void {
    const plugin = this.plugins.find(p => p.name === name);
    if (plugin) {
      plugin.config = { ...plugin.config, ...config };
    }
  }

  getPluginConfig(name: string): PluginConfig | null {
    const plugin = this.plugins.find(p => p.name === name);
    return plugin?.config || null;
  }

  setSharedState(key: string, value: any): void {
    this.sharedState[key] = value;
  }

  getSharedState(key: string): any {
    return this.sharedState[key];
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
    this.webglInitPlugins = [];
    this.webglRenderPlugins = [];
    this.canvasInitPlugins = [];
    this.canvasRenderPlugins = [];
    this.animationPlugins = [];
    this.screenshotPlugins = [];
    this.eventPlugins = {};
    this.sharedState = {};
    this.eventQueue = [];
  }
}
