// Chart2DCanvasFallback.ts
import { ChartPlugins } from './ChartPlugins';

interface Chart2DConfig {
  pixelRatio?: number;
  preserveContextState?: boolean;
  backgroundColor?: string;
}

export class Chart2DCanvasFallback {
  private readonly canvas: HTMLCanvasElement;
  private readonly plugins: ChartPlugins;
  private readonly config: Chart2DConfig;
  private ctx: CanvasRenderingContext2D | null = null;
  private isInitialized: boolean = false;

  constructor(canvas: HTMLCanvasElement, plugins: ChartPlugins, config: Chart2DConfig = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    }

    this.canvas = canvas;
    this.plugins = plugins;
    this.config = {
      pixelRatio: config.pixelRatio ?? window.devicePixelRatio ?? 1,
      preserveContextState: config.preserveContextState ?? true,
      backgroundColor: config.backgroundColor,
    };
  }

  initialize(width: number, height: number): void {
    if (this.isInitialized) {
      console.warn('Chart2DCanvasFallback already initialized');
      return;
    }

    const ctx = this.canvas.getContext('2d', { alpha: !!this.config.backgroundColor });
    if (!ctx) {
      throw new Error('2D context not supported or canvas is invalid');
    }

    this.ctx = ctx;

    const dpr = this.config.pixelRatio;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);

    try {
      this.plugins.initialize2D(this.ctx);
      this.isInitialized = true;
    } catch (error) {
      this.ctx = null;
      throw new Error(`Plugin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  render(): void {
    if (!this.isInitialized || !this.ctx) {
      console.warn('Cannot render: Chart2DCanvasFallback not initialized');
      return;
    }

    const { ctx, canvas } = this;
    const { preserveContextState, backgroundColor } = this.config;

    if (preserveContextState) {
      ctx.save();
    }

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width / this.config.pixelRatio, canvas.height / this.config.pixelRatio);
    } else {
      ctx.clearRect(0, 0, canvas.width / this.config.pixelRatio, canvas.height / this.config.pixelRatio);
    }

    try {
      this.plugins.render2D(ctx);
    } catch (error) {
      console.error(`Plugin render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (preserveContextState) {
        ctx.restore();
      }
    }
  }

  destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      this.plugins.destroy();
    } catch (error) {
      console.warn(`Plugin cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width / this.config.pixelRatio, this.canvas.height / this.config.pixelRatio);
      this.ctx = null;
    }

    this.canvas.width = 0;
    this.canvas.height = 0;
    this.isInitialized = false;
  }

  getContext(): CanvasRenderingContext2D | null {
    return this.ctx;
  }

  updateConfig(config: Partial<Chart2DConfig>): void {
    this.config.pixelRatio = config.pixelRatio ?? this.config.pixelRatio;
    this.config.preserveContextState = config.preserveContextState ?? this.config.preserveContextState;
    this.config.backgroundColor = config.backgroundColor ?? this.config.backgroundColor;

    if (config.pixelRatio && this.isInitialized) {
      this.destroy();
      this.initialize(this.canvas.width / this.config.pixelRatio, this.canvas.height / this.config.pixelRatio);
    }
  }
}
