```typescript
// ChartEngineCore.ts
import { ChartGPUBackend } from './ChartGPUBackend';
import { Chart2DCanvasFallback } from './Chart2DCanvasFallback';
import { ChartEventManager } from './ChartEventManager';
import { ChartPlugins } from './ChartPlugins';

// Interface for chart engine options
interface ChartEngineOptions {
  /** The HTML canvas element to render on */
  canvas: HTMLCanvasElement;
  /** Whether to attempt GPU rendering (default: true) */
  useGPU?: boolean;
  /** Canvas width in CSS pixels */
  width: number;
  /** Canvas height in CSS pixels */
  height: number;
  /** Device pixel ratio for high-DPI displays (default: window.devicePixelRatio) */
  dpr?: number;
}

// Interface for plugins to ensure type safety
interface Plugin {
  initialize2D?(ctx: CanvasRenderingContext2D): void;
  render2D?(ctx: CanvasRenderingContext2D): void;
  destroy?(): void;
}

/**
 * Core charting engine managing GPU or CPU rendering, events, and plugins.
 */
export class ChartEngineCore {
  private readonly canvas: HTMLCanvasElement;
  private readonly plugins: ChartPlugins;
  private readonly events: ChartEventManager;
  private width: number;
  private height: number;
  private dpr: number;
  private useGPU: boolean;
  private backend: ChartGPUBackend | Chart2DCanvasFallback | null = null;
  private animationFrame: number = 0;
  private isInitialized: boolean = false;
  private isPaused: boolean = false;

  /**
   * Creates a new ChartEngineCore instance.
   * @param options Configuration options for the chart engine.
   * @throws Error if options are invalid.
   */
  constructor(options: ChartEngineOptions) {
    if (!(options.canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    }
    if (!Number.isFinite(options.width) || options.width <= 0) {
      throw new Error('Invalid width: must be a positive number');
    }
    if (!Number.isFinite(options.height) || options.height <= 0) {
      throw new Error('Invalid height: must be a positive number');
    }
    if (options.dpr !== undefined && (!Number.isFinite(options.dpr) || options.dpr <= 0)) {
      throw new Error('Invalid dpr: must be a positive number');
    }

    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.dpr = options.dpr ?? window.devicePixelRatio ?? 1;
    this.useGPU = options.useGPU ?? true;
    this.plugins = new ChartPlugins();
    this.events = new ChartEventManager(this.canvas);
  }

  /**
   * Initializes the chart engine with the appropriate backend (GPU or CPU).
   * @throws Error if initialization fails.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('ChartEngineCore already initialized');
      return;
    }

    // Set canvas dimensions
    this.updateCanvasDimensions();

    // Initialize backend
    try {
      if (this.useGPU && navigator.gpu) {
        this.backend = new ChartGPUBackend(this.canvas, this.plugins);
        await this.backend.initialize();
      } else {
        this.backend = new Chart2DCanvasFallback(this.canvas, this.plugins, {
          pixelRatio: this.dpr,
          preserveContextState: true,
        });
        this.backend.initialize();
      }
      this.isInitialized = true;
    } catch (error) {
      this.backend = null;
      throw new Error(`Backend initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Start animation loop
    this.startLoop();
  }

  /**
   * Updates canvas dimensions based on width, height, and dpr.
   */
  private updateCanvasDimensions(): void {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  /**
   * Starts the animation loop for continuous rendering.
   */
  private startLoop(): void {
    const loop = () => {
      if (!this.isPaused && this.isInitialized) {
        this.render();
      }
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Renders the chart using the active backend.
   */
  private render(): void {
    if (!this.isInitialized || !this.backend) {
      console.warn('Cannot render: ChartEngineCore not initialized or no backend available');
      return;
    }

    try {
      this.backend.render();
    } catch (error) {
      console.error(`Render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Registers a plugin with the chart engine.
   * @param plugin The plugin to register.
   * @throws Error if plugin is invalid.
   */
  public addPlugin(plugin: Plugin): void {
    if (!plugin || (typeof plugin.initialize2D !== 'function' && typeof plugin.render2D !== 'function')) {
      throw new Error('Invalid plugin: must implement at least one of initialize2D or render2D');
    }
    try {
      this.plugins.register(plugin);
    } catch (error) {
      throw new Error(`Plugin registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates chart engine options dynamically.
   * @param options Partial options to update.
   */
  public updateOptions(options: Partial<ChartEngineOptions>): void {
    let needsReinitialize = false;

    if (options.canvas && options.canvas !== this.canvas) {
      if (!(options.canvas instanceof HTMLCanvasElement)) {
        throw new Error('Invalid canvas: must be an HTMLCanvasElement');
      }
      this.canvas = options.canvas;
      this.events.detach();
      this.events = new ChartEventManager(this.canvas);
      needsReinitialize = true;
    }

    if (options.width !== undefined) {
      if (!Number.isFinite(options.width) || options.width <= 0) {
        throw new Error('Invalid width: must be a positive number');
      }
      this.width = options.width;
      needsReinitialize = true;
    }

    if (options.height !== undefined) {
      if (!Number.isFinite(options.height) || options.height <= 0) {
        throw new Error('Invalid height: must be a positive number');
      }
      this.height = options.height;
      needsReinitialize = true;
    }

    if (options.dpr !== undefined) {
      if (!Number.isFinite(options.dpr) || options.dpr <= 0) {
        throw new Error('Invalid dpr: must be a positive number');
      }
      this.dpr = options.dpr;
      needsReinitialize = true;
    }

    if (options.useGPU !== undefined && options.useGPU !== this.useGPU) {
      this.useGPU = options.useGPU;
      needsReinitialize = true;
    }

    if (needsReinitialize && this.isInitialized) {
      this.destroy();
      this.initialize().catch(error => {
        console.error(`Reinitialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    } else if (needsReinitialize) {
      this.updateCanvasDimensions();
    }
  }

  /**
   * Pauses the animation loop.
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * Resumes the animation loop.
   */
  public resume(): void {
    this.isPaused = false;
  }

  /**
   * Cleans up resources and stops the chart engine.
   */
  public destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;

    try {
      this.events.detach();
    } catch (error) {
      console.warn(`Event manager cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      if (this.backend) {
        this.backend.destroy();
        this.backend = null;
      }
    } catch (error) {
      console.warn(`Backend cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      if (typeof (this.plugins as any).destroy === 'function') {
        (this.plugins as any).destroy();
      }
    } catch (error) {
      console.warn(`Plugin cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.canvas.width = 0;
    this.canvas.height = 0;
    this.isInitialized = false;
    this.isPaused = false;
  }
}
```