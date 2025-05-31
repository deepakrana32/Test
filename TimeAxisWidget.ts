import { ChartWidget } from './ChartWidget';
import { TimeScaleEngine } from './TimeScaleEngine';
import { CrosshairManager } from './CrosshairManager';
import { Color, CrosshairEvent, TimeScaleTick } from './ChartTypes';
import { LabelsImageCache } from './LabelsImageCache';

export class TimeAxisWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private widget: ChartWidget;
  private timeScale: TimeScaleEngine;
  private crosshairManager: CrosshairManager;
  private labelCache: LabelsImageCache;
  private height: number;
  private font: string;
  private textColor: Color;
  private backgroundColor: Color;
  private locale: string;
  private timezone: string;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null,
    widget: ChartWidget,
    timeScale: TimeScaleEngine
  ) {
    if (!canvas || !ctx || !widget || !timeScale) {
      throw new Error('Invalid initialization parameters');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.gl = gl;
    this.widget = widget;
    this.timeScale = timeScale;
    this.crosshairManager = widget['crosshairManager'];
    this.labelCache = new LabelsImageCache();
    this.height = 40;
    this.font = '12px Arial';
    this.textColor = '#000000';
    this.backgroundColor = '#ffffff';
    this.locale = widget['options'].locale;
    this.timezone = widget['options'].timezone;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.crosshairManager.on('crosshair', this.handleCrosshair.bind(this));
  }

  private handleCrosshair(event: CrosshairEvent) {
    this.widget.requestRender();
  }

  render() {
    const result = this.timeScale.computeTimeScale();
    if (!result) return;

    this.ctx.save();
    this.ctx.translate(0, this.canvas.height / devicePixelRatio - this.height);
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width / devicePixelRatio, this.height);

    this.ctx.font = this.font;
    this.ctx.fillStyle = this.textColor;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    result.ticks.forEach(tick => {
      const cachedLabel = this.labelCache.get(tick.label, this.font, this.textColor);
      if (cachedLabel) {
        this.ctx.drawImage(cachedLabel, tick.x - cachedLabel.width / 2, this.height / 2 - cachedLabel.height / 2);
      } else {
        this.ctx.fillText(tick.label, tick.x, this.height / 2);
        this.labelCache.cache(tick.label, this.font, this.textColor, this.ctx);
      }
    });

    // Render crosshair time
    const crosshairX = this.crosshairManager['lastX'];
    if (crosshairX != null) {
      const time = this.crosshairManager['ticks']
        ? this.crosshairManager['ticks'][Math.round(this.timeScale.unscaleX(crosshairX)) * 3 + 1] || Date.now()
        : Date.now();
      const label = new Date(time).toLocaleTimeString(this.locale, { timeZone: this.timezone });
      this.ctx.fillStyle = this.crosshairManager['params'].labelBackgroundColor;
      this.ctx.strokeStyle = this.crosshairManager['params'].lineColor;
      const labelWidth = this.ctx.measureText(label).width + 10;
      const y = this.height - 24;
      this.ctx.fillRect(crosshairX - labelWidth / 2, y, labelWidth, 24);
      this.ctx.strokeRect(crosshairX - labelWidth / 2, y, labelWidth, 24);
      this.ctx.fillStyle = this.crosshairManager['params'].labelTextColor;
      this.ctx.fillText(label, crosshairX, y + 12);
    }

    this.ctx.restore();

    if (this.gl) {
      // Placeholder for WebGL rendering
    }
  }

  getOptimalHeight(): number {
    const result = this.timeScale.computeTimeScale();
    if (!result) return this.height;
    this.ctx.font = this.font;
    const maxLabelHeight = Math.max(...result.ticks.map(t => this.ctx.measureText(t.label).actualBoundingBoxAscent + 5));
    return Math.ceil(maxLabelHeight + 15); // Padding
  }

  setOptions(options: { font?: string; textColor?: Color; backgroundColor?: Color; locale?: string; timezone?: string }) {
    this.font = options.font || this.font;
    this.textColor = options.textColor || this.textColor;
    this.backgroundColor = options.backgroundColor || this.backgroundColor;
    this.locale = options.locale || this.locale;
    this.timezone = options.timezone || this.timezone;
    this.labelCache.clear();
    this.widget.requestRender();
  }

  destroy() {
    this.labelCache.clear();
  }
}
