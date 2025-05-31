import { CrosshairEvent, CrosshairParams, Candle, Tick } from './ChartTypes';
import { ChartWidget } from './ChartWidget';
import { ChartEventManager } from './ChartEventManager';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';

export class CrosshairManager {
  private canvas: HTMLCanvasElement;
  private widget: ChartWidget;
  private eventManager: ChartEventManager;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private params: CrosshairParams;
  private candles: Candle[] | null;
  private ticks: Float32Array | null;
  private lastX: number | null;
  private lastY: number | null;
  private enabled: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    widget: ChartWidget,
    eventManager: ChartEventManager,
    priceScale: PriceScaleEngine,
    timeScale: TimeScaleEngine,
    params: Partial<CrosshairParams> = {}
  ) {
    if (!canvas || !widget || !eventManager || !priceScale || !timeScale) {
      throw new Error('Invalid initialization parameters');
    }
    this.canvas = canvas;
    this.widget = widget;
    this.eventManager = eventManager;
    this.priceScale = priceScale;
    this.timeScale = timeScale;
    this.params = {
      enabled: true,
      magnet: true,
      lineColor: '#666666',
      lineWidth: 1,
      lineStyle: 'dashed',
      labelBackgroundColor: '#ffffff',
      labelTextColor: '#000000',
      labelFontSize: 12,
      ...params,
    };
    this.candles = null;
    this.ticks = null;
    this.lastX = null;
    this.lastY = null;
    this.enabled = this.params.enabled;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
  }

  setCandles(candles: Candle[]): void {
    this.candles = candles;
  }

  setTicks(ticks: Tick[]): void {
    this.ticks = new Float32Array(ticks.length * 3);
    ticks.forEach((tick, i) => {
      this.ticks![i * 3] = tick.price;
      this.ticks![i * 3 + 1] = tick.time;
      this.ticks![i * 3 + 2] = tick.volume;
    });
  }

  update(x: number, y: number, price: number, time: number): void {
    if (!this.enabled) return;
    let index = this.timeScale.unscaleX(x);
    let adjustedPrice = price;
    let adjustedTime = time;

    if (this.params.magnet && (this.candles || this.ticks)) {
      if (this.candles && this.candles.length > 0) {
        const nearestCandle = this.candles[Math.max(0, Math.min(this.candles.length - 1, Math.round(index)))];
        adjustedPrice = nearestCandle.close;
        adjustedTime = nearestCandle.time;
        index = this.candles.findIndex(c => c.time === adjustedTime) || index;
      } else if (this.ticks && this.ticks.length > 0) {
        const nearestIndex = Math.max(0, Math.min(this.ticks.length / 3 - 1, Math.round(index)));
        adjustedPrice = this.ticks[nearestIndex * 3];
        adjustedTime = this.ticks[nearestIndex * 3 + 1];
        index = nearestIndex;
      }
    }

    const event: CrosshairEvent = {
      x,
      y,
      price: adjustedPrice,
      time: adjustedTime,
      index,
    };

    this.lastX = x;
    this.lastY = y;
    this.eventManager.dispatchEvent('crosshair', event);
    this.widget.requestRender();
  }

  private handleMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * devicePixelRatio;
    const y = (event.clientY - rect.top) * devicePixelRatio;
    const price = this.priceScale.unscaleY(y);
    const time = this.ticks ? this.ticks[Math.round(this.timeScale.unscaleX(x)) * 3 + 1] || Date.now() : Date.now();
    this.update(x, y, price, time);
  }

  private handleMouseLeave(): void {
    this.lastX = null;
    this.lastY = null;
    this.eventManager.dispatchEvent('crosshair', { x: -1, y: -1, price: 0, time: 0, index: -1 });
    this.widget.requestRender();
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled || this.lastX == null || this.lastY == null) return;
    ctx.save();
    ctx.strokeStyle = this.params.lineColor;
    ctx.lineWidth = this.params.lineWidth;
    ctx.setLineDash(this.params.lineStyle === 'dashed' ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(this.lastX, 0);
    ctx.lineTo(this.lastX, this.canvas.height);
    ctx.moveTo(0, this.lastY);
    ctx.lineTo(this.canvas.width, this.lastY);
    ctx.stroke();
    ctx.restore();

    // Render labels
    const price = this.priceScale.unscaleY(this.lastY);
    const time = this.ticks ? this.ticks[Math.round(this.timeScale.unscaleX(this.lastX)) * 3 + 1] || Date.now() : Date.now();
    const priceLabel = price.toFixed(2);
    const timeLabel = new Date(time).toLocaleTimeString();

    ctx.save();
    ctx.fillStyle = this.params.labelBackgroundColor;
    ctx.strokeStyle = this.params.lineColor;
    ctx.font = `${this.params.labelFontSize}px Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Price label
    const priceWidth = ctx.measureText(priceLabel).width + 10;
    ctx.fillRect(this.canvas.width - priceWidth, this.lastY - this.params.labelFontSize, priceWidth, this.params.labelFontSize * 2);
    ctx.strokeRect(this.canvas.width - priceWidth, this.lastY - this.params.labelFontSize, priceWidth, this.params.labelFontSize * 2);
    ctx.fillStyle = this.params.labelTextColor;
    ctx.fillText(priceLabel, this.canvas.width - priceWidth / 2, this.lastY);

    // Time label
    const timeWidth = ctx.measureText(timeLabel).width + 10;
    ctx.fillRect(this.lastX - timeWidth / 2, this.canvas.height - this.params.labelFontSize * 2, timeWidth, this.params.labelFontSize * 2);
    ctx.strokeRect(this.lastX - timeWidth / 2, this.canvas.height - this.params.labelFontSize * 2, timeWidth, this.params.labelFontSize * 2);
    ctx.fillStyle = this.params.labelTextColor;
    ctx.fillText(timeLabel, this.lastX, this.canvas.height - this.params.labelFontSize);

    ctx.restore();
  }

  setParams(params: Partial<CrosshairParams>): void {
    this.params = { ...this.params, ...params };
    this.enabled = this.params.enabled;
    this.widget.requestRender();
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.candles = null;
    this.ticks = null;
    this.lastX = null;
    this.lastY = null;
  }
}
