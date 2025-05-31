import { ChartPlugins } from './ChartPlugins';
import { ChartEventManager, ChartEventType } from './ChartEventManager';
import { CrosshairManager } from './CrosshairManager';
import { PaneWidget } from './PaneWidget';
import { PriceAxisWidget } from './PriceAxisWidget';
import { TimeAxisWidget } from './TimeAxisWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { ChartRenderer } from './ChartRenderer';
import { DrawingToolManager } from './DrawingToolManager';
import { KineticAnimation } from './KineticAnimation';
import { Candle, Tick, CrosshairParams, ChartOptions } from './ChartTypes';

export class ChartWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private plugins: ChartPlugins;
  private eventManager: ChartEventManager;
  private crosshairManager: CrosshairManager;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private renderer: ChartRenderer;
  private drawingToolManager: DrawingToolManager;
  private panes: PaneWidget[];
  private priceAxis: PriceAxisWidget;
  private timeAxis: TimeAxisWidget;
  private kineticAnimation: KineticAnimation;
  private options: ChartOptions;
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private needsRender: boolean;
  private animationFrameId: number | null;

  constructor(
    canvas: HTMLCanvasElement,
    options: Partial<ChartOptions> = {}
  ) {
    if (!canvas) throw new Error('Canvas is required');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.gl = canvas.getContext('webgl2');
    this.options = {
      width: canvas.width,
      height: canvas.height,
      locale: 'en-US',
      timezone: 'UTC',
      ...options,
    };
    this.canvas.width = this.options.width * devicePixelRatio;
    this.canvas.height = this.options.height * devicePixelRatio;
    this.canvas.style.width = `${this.options.width}px`;
    this.canvas.style.height = `${this.options.height}px`;

    this.plugins = new ChartPlugins();
    this.eventManager = new ChartEventManager(this.canvas);
    this.priceScale = new PriceScaleEngine();
    this.timeScale = new TimeScaleEngine();
    this.renderer = new ChartRenderer(this.canvas, this.ctx, this.gl);
    this.crosshairManager = new CrosshairManager(
      this.canvas,
      this,
      this.eventManager,
      this.priceScale,
      this.timeScale,
      this.options.crosshair
    );
    this.drawingToolManager = new DrawingToolManager(
      this.canvas,
      this.ctx,
      this.gl,
      this,
      this.crosshairManager,
      (tools) => this.renderer.setDrawingTools(tools),
      this.timeScale.scaleX,
      this.priceScale.scaleY,
      this.timeScale.unscaleX,
      this.priceScale.unscaleY,
      (time) => this.timeScale.timeToIndex(time)
    );
    this.panes = [new PaneWidget(this.canvas, this.ctx, this.gl, this, this.priceScale, this.timeScale)];
    this.priceAxis = new PriceAxisWidget(this.canvas, this.ctx, this.gl, this, this.priceScale);
    this.timeAxis = new TimeAxisWidget(this.canvas, this.ctx, this.gl, this, this.timeScale);
    this.kineticAnimation = new KineticAnimation((dx) => this.handleScroll(dx));
    this.candles = null;
    this.ticks = null;
    this.needsRender = false;
    this.animationFrameId = null;

    this.setupEventListeners();
    this.initializePlugins();
  }

  private async initializePlugins() {
    if (this.gl) {
      this.plugins.initializeWebGL(this.gl);
    } else {
      await this.plugins.initializeGPU(this.renderer.getGPUDevice());
    }
    this.plugins.initialize2D(this.ctx);
  }

  private setupEventListeners() {
    this.eventManager.on('zoom', (data) => this.handleZoom(data.x, data.delta));
    this.eventManager.on('pan', (data) => this.handleScroll(data.dx));
    this.eventManager.on('crosshair', (data) => this.renderer.setCrosshair(data));
    this.canvas.addEventListener('resize', this.handleResize.bind(this));
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
    this.crosshairManager.setCandles(candles || []);
    this.crosshairManager.setTicks(ticks || []);
    this.drawingToolManager.setTicks(ticks || []);
    this.priceScale.setData(candles?.map(c => [c.open, c.high, c.low, c.close]).flat() || ticks?.map(t => t.price) || []);
    this.timeScale.setData(candles?.map(c => c.time) || ticks?.map(t => t.time) || []);
    this.renderer.setData(candles, ticks);
    this.requestRender();
  }

  setOptions(options: Partial<ChartOptions>) {
    this.options = { ...this.options, ...options };
    this.canvas.width = this.options.width * devicePixelRatio;
    this.canvas.height = this.options.height * devicePixelRatio;
    this.canvas.style.width = `${this.options.width}px`;
    this.canvas.style.height = `${this.options.height}px`;
    this.priceScale.setOptions(this.options.priceScale);
    this.timeScale.setOptions(this.options.timeScale);
    this.crosshairManager.setParams(this.options.crosshair || {});
    this.requestRender();
  }

  handleZoom(x: number, delta: number) {
    this.timeScale.zoomAt(this.timeScale.unscaleX(x), delta);
    this.requestRender();
  }

  handleScroll(dx: number) {
    this.timeScale.scroll(dx);
    this.requestRender();
  }

  private handleResize() {
    this.setOptions({
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    });
  }

  requestRender() {
    if (this.needsRender) return;
    this.needsRender = true;
    this.animationFrameId = requestAnimationFrame(() => this.render());
  }

  private render() {
    this.needsRender = false;
    this.ctx.save();
    this.ctx.scale(devicePixelRatio, devicePixelRatio);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.options.width, this.options.height);

    // Render panes
    this.panes.forEach(pane => pane.render());

    // Render axes
    this.priceAxis.render();
    this.timeAxis.render();

    // Render crosshair
    this.crosshairManager.render(this.ctx);

    // Render plugins
    if (this.gl) {
      this.plugins.renderWebGL(this.gl);
    } else {
      this.plugins.renderGPU(this.renderer.getGPURenderPass());
    }
    this.plugins.render2D(this.ctx);

    this.ctx.restore();
    this.plugins.onAnimationFrame(performance.now(), 16.67); // ~60 FPS
  }

  addPane(): PaneWidget {
    const pane = new PaneWidget(this.canvas, this.ctx, this.gl, this, this.priceScale, this.timeScale);
    this.panes.push(pane);
    this.requestRender();
    return pane;
  }

  getOptimalWidth(): number {
    return this.priceAxis.getOptimalWidth() + this.panes.reduce((w, p) => w + p.getOptimalWidth(), 0);
  }

  getOptimalHeight(): number {
    return this.timeAxis.getOptimalHeight() + this.panes.reduce((h, p) => h + p.getOptimalHeight(), 0);
  }

  takeScreenshot(): HTMLCanvasElement {
    const screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.width = this.canvas.width;
    screenshotCanvas.height = this.canvas.height;
    const ctx = screenshotCanvas.getContext('2d')!;
    this.plugins.renderScreenshot(ctx, this.options.width, this.options.height);
    return screenshotCanvas;
  }

  destroy() {
    cancelAnimationFrame(this.animationFrameId!);
    this.eventManager.destroy();
    this.crosshairManager.destroy();
    this.drawingToolManager.destroy();
    this.panes.forEach(pane => pane.destroy());
    this.priceAxis.destroy();
    this.timeAxis.destroy();
    this.kineticAnimation.destroy();
    this.plugins.destroy();
    this.canvas.removeEventListener('resize', this.handleResize);
  }
}
