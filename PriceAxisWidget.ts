import { ChartWidget } from './ChartWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { CrosshairManager } from './CrosshairManager';
import { Color, CrosshairEvent } from './ChartTypes';
import { LabelsImageCache } from './LabelsImageCache';

export class PriceAxisWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private widget: ChartWidget;
  private priceScale: PriceScaleEngine;
  private crosshairManager: CrosshairManager;
  private labelCache: LabelsImageCache;
  private width: number;
  private font: string;
  private textColor: Color;
  private backgroundColor: Color;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null,
    widget: ChartWidget,
    priceScale: PriceScaleEngine
  ) {
    if (!canvas || !ctx || !widget || !priceScale) {
      throw new Error('Invalid initialization parameters');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.gl = gl;
    this.widget = widget;
    this.priceScale = priceScale;
    this.crosshairManager = widget['crosshairManager']; // Access private field (assumes same module)
    this.labelCache = new LabelsImageCache();
    this.width = 80;
    this.font = '12px Arial';
    this.textColor = '#000000';
    this.backgroundColor = '#ffffff';
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.crosshairManager.on('crosshair', this.handleCrosshair.bind(this));
  }

  private handleCrosshair(event: CrosshairEvent) {
    this.widget.requestRender();
  }

  render() {
    const result = this.priceScale.computePriceScale();
    if (!result) return;

    this.ctx.save();
    this.ctx.translate(this.canvas.width / devicePixelRatio - this.width, 0);
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.canvas.height / devicePixelRatio);

    this.ctx.font = this.font;
    this.ctx.fillStyle = this.textColor;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    result.ticks.forEach(tick => {
      const cachedLabel = this.labelCache.get(tick.label, this.font, this.textColor);
      if (cachedLabel) {
        this.ctx.drawImage(cachedLabel, this.width - cachedLabel.width - 5, tick.y - cachedLabel.height / 2);
      } else {
        this.ctx.fillText(tick.label, this.width - 5, tick.y);
        this.labelCache.cache(tick.label, this.font, this.textColor, this.ctx);
      }
    });

    // Render crosshair price
    const crosshair = this.crosshairManager['lastY']; // Access private field
    if (crosshair != null) {
      const price = this.priceScale.unscaleY(crosshair);
      const label = price.toFixed(2);
      const y = this.priceScale.scaleY(price);
      this.ctx.fillStyle = this.crosshairManager['params'].labelBackgroundColor;
      this.ctx.strokeStyle = this.crosshairManager['params'].lineColor;
      const labelWidth = this.ctx.measureText(label).width + 10;
      this.ctx.fillRect(this.width - labelWidth, y - 12, labelWidth, 24);
      this.ctx.strokeRect(this.width - labelWidth, y - 12, labelWidth, 24);
      this.ctx.fillStyle = this.crosshairManager['params'].labelTextColor;
      this.ctx.fillText(label, this.width - 5, y);
    }

    this.ctx.restore();

    if (this.gl) {
      // Placeholder for WebGL rendering
    }
  }

  getOptimalWidth(): number {
    const result = this.priceScale.computePriceScale();
    if (!result) return this.width;
    this.ctx.font = this.font;
    const maxLabelWidth = Math.max(...result.ticks.map(t => this.ctx.measureText(t.label).width));
    return Math.ceil(maxLabelWidth + 15); // Padding
  }

  setOptions(options: { font?: string; textColor?: Color; backgroundColor?: Color }) {
    this.font = options.font || this.font;
    this.textColor = options.textColor || this.textColor;
    this.backgroundColor = options.backgroundColor || this.backgroundColor;
    this.labelCache.clear();
    this.widget.requestRender();
  }

  destroy() {
    this.labelCache.clear();
  }
}
