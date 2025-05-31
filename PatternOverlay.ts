import { ChartEventManager } from './ChartEventManager';
import { CrosshairManager } from './CrosshairManager';
import { PaneWidget } from './PaneWidget';
import { PriceAxisWidget } from './PriceAxisWidget';
import { TimeAxisWidget } from './TimeAxisWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { ChartRenderer } from './ChartRenderer';
import { DrawingToolManager } from './DrawingToolManager';
import { KineticAnimation } from './KineticAnimation';
import { StyleManager } from './StyleManager';
import { LocalizationManager } from './LocalizationManager';
import { ErrorHandler } from './ErrorHandler';
import { PatternManager } from './PatternManager';
import { Candle, Tick, ChartOptions } from './ChartTypes';

export class ChartWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private eventManager: ChartEventManager;
  private crosshairManager: CrosshairManager;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private renderer: ChartRenderer;
  private drawingToolManager: DrawingToolManager;
  private kineticAnimation: KineticAnimation;
  private patternManager: PatternManager;
  private panes: PaneWidget[];
  private priceAxis: PriceAxisWidget;
  private timeAxis: TimeAxisWidget;
  private options: ChartOptions;
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private needsRender: boolean;
  private animationFrameId: number | null;

  constructor(
    canvas: HTMLCanvasElement,
    styleManager: StyleManager,
    localizationManager: LocalizationManager,
    errorHandler: ErrorHandler,
    drawingToolManager: DrawingToolManager,
    kineticAnimation: KineticAnimation,
    patternManager: PatternManager,
    options: Partial<ChartOptions> = {}
  ) {
    if (!canvas) throw new Error('Canvas is required');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.gl = canvas.getContext('webgl2');
    this.options = {
      width: canvas.width / devicePixelRatio,
      height: canvas.height / devicePixelRatio,
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      ...options,
    };
    this.canvas.width = this.options.width * devicePixelRatio;
    this.canvas.height = this.options.height * devicePixelRatio;
    this.canvas.style.width = `${this.options.width}px`;
    this.canvas.style.height = `${this.options.height}px`;

    this.eventManager = new ChartEventManager(this.canvas);
    this.priceScale = new PriceScaleEngine(this.options.priceScale);
    this.timeScale = new TimeScaleEngine(this.options.timeScale);
    this.renderer = new ChartRenderer(this.canvas, this.ctx, this.gl);
    this.crosshairManager = new CrosshairManager(
      this.priceScale,
      this.timeScale,
      styleManager.getCrosshairParams()
    );
    this.drawingToolManager = drawingToolManager;
    this.kineticAnimation = kineticAnimation;
    this.patternManager = patternManager;
    this.panes = [new PaneWidget(this.canvas, this.ctx, this.gl, this, this.priceScale, this.timeScale)];
    this.priceAxis = new PriceAxisWidget(this.canvas, this.ctx, this.gl, this, this.priceScale);
    this.timeAxis = new TimeAxisWidget(this.canvas, this.ctx, this.gl, this, this.timeScale);
    this.candles = null;
    this.ticks = null;
    this.needsRender = false;
    this.animationFrameId = null;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.eventManager.on('zoom', (data) => this.handleZoom(data.x, data.delta));
    this.eventManager.on('pan', (data) => this.handleScroll(data.dx));
    this.eventManager.on('crosshair', (data) => this.renderer.setCrosshair(data));
    this.eventManager.on('patternClick', (data) => this.handlePatternClick(data));
    this.canvas.addEventListener('resize', this.handleResize.bind(this));
  }

  private handlePatternClick(data: { x: number; index: number; pattern: any }) {
    // Dispatch to InteractionManager or show pattern details
    console.log(`Pattern clicked at index ${data.index}: ${data.pattern.typeLabels.join(', ')} (${data.pattern.category})`);
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
    this.crosshairManager.setCandles(candles || []);
    this.crosshairManager.setTicks(ticks || []);
    this.drawingToolManager.setTicks(ticks || []);
    this.patternManager.setData(candles || []);
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

    // Render drawing tools and patterns
    this.drawingToolManager.render2D(this.ctx, this.options.width, this.options.height);
    this.patternManager.render();
    if (this.gl) {
      this.drawingToolManager.renderWebGL(this.gl);
    }

    this.ctx.restore();
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
    ctx.drawImage(this.canvas, 0, 0);
    return screenshotCanvas;
  }

  destroy() {
    cancelAnimationFrame(this.animationFrameId!);
    this.eventManager.destroy();
    this.crosshairManager.destroy();
    this.drawingToolManager.destroy();
    this.kineticAnimation.destroy();
    this.patternManager.destroy();
    this.panes.forEach(pane => pane.destroy());
    this.priceAxis.destroy();
    this.timeAxis.destroy();
    this.canvas.removeEventListener('resize', this.handleResize);
  }
}
