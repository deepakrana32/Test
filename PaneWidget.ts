import { ChartWidget } from './ChartWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { ChartRenderer } from './ChartRenderer';
import { DrawingToolManager } from './DrawingToolManager';
import { CrosshairManager } from './CrosshairManager';
import { Series, Candle, Tick, CrosshairEvent } from './ChartTypes';

export class PaneWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private widget: ChartWidget;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private renderer: ChartRenderer;
  private drawingToolManager: DrawingToolManager;
  private crosshairManager: CrosshairManager;
  private series: Series[];
  private height: number;
  private yOffset: number;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null,
    widget: ChartWidget,
    priceScale: PriceScaleEngine,
    timeScale: TimeScaleEngine,
    height: number = 400,
    yOffset: number = 0
  ) {
    if (!canvas || !ctx || !widget || !priceScale || !timeScale) {
      throw new Error('Invalid initialization parameters');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.gl = gl;
    this.widget = widget;
    this.priceScale = priceScale;
    this.timeScale = timeScale;
    this.renderer = widget['renderer']; // Access private field
    this.drawingToolManager = widget['drawingToolManager'];
    this.crosshairManager = widget['crosshairManager'];
    this.series = [];
    this.height = height;
    this.yOffset = yOffset;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.crosshairManager.on('crosshair', this.handleCrosshair.bind(this));
  }

  private handleCrosshair(event: CrosshairEvent) {
    this.widget.requestRender();
  }

  setSeries(series: Series[]) {
    this.series = series.map(s => ({
      ...s,
      data: s.data.map(d => ({ ...d })),
      options: { ...s.options },
    }));
    const prices = this.series
      .flatMap(s => s.data.map(d => 'open' in d ? [d.open, d.high, d.low, d.close] : [d.price]))
      .flat();
    this.priceScale.setData(prices);
    this.timeScale.setData(this.series.flatMap(s => s.data.map(d => 'time' in d ? d.time : d.time)));
    this.widget.requestRender();
  }

  render() {
    this.ctx.save();
    this.ctx.translate(0, this.yOffset);
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.canvas.width / devicePixelRatio, this.height);
    this.ctx.clip();

    // Render series
    this.series.forEach(s => {
      this.renderer.setData(
        s.type === 'candle' ? s.data as Candle[] : null,
        ['bar', 'area', 'line', 'histogram'].includes(s.type) ? s.data as Tick[] : null
      );
      this.renderer.renderSeries(s, this.ctx, this.gl, this.priceScale, this.timeScale);
    });

    // Render drawing tools
    this.drawingToolManager.renderWebGL(this.gl || this.ctx as any);

    this.ctx.restore();
  }

  getOptimalWidth(): number {
    return this.canvas.width / devicePixelRatio - this.widget['priceAxis'].getOptimalWidth();
  }

  getOptimalHeight(): number {
    return this.height;
  }

  setHeight(height: number) {
    if (height <= 0) return;
    this.height = height;
    this.priceScale.setOptions({ height });
    this.widget.requestRender();
  }

  setYOffset(yOffset: number) {
    if (yOffset < 0) return;
    this.yOffset = yOffset;
    this.widget.requestRender();
  }

  destroy() {
    this.series = [];
  }
}
