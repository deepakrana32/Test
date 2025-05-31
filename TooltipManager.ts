import { drawText } from './CanvasUtils';
import { Candle, Tick } from './PatternTypes';
import { PriceScaleEngine } from './PriceScale';
import { TimeScaleEngine } from './TimeScale';

interface TooltipOptions {
  background: string;
  color: string;
  font: string;
}

export class TooltipManager {
  private x: number | null;
  private y: number | null;
  private opacity: number;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private options: TooltipOptions;
  private candles: Candle[] | null;
  private ticks: Tick[] | null;

  constructor(priceScale: PriceScaleEngine, timeScale: TimeScaleEngine, options: Partial<TooltipOptions> = {}) {
    if (!priceScale || !timeScale) throw new Error('PriceScale or TimeScale missing');
    this.x = null;
    this.y = null;
    this.opacity = 0;
    this.priceScale = priceScale;
    this.timeScale = timeScale;
    this.options = {
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      font: '12px Arial',
      ...options,
    };
    this.candles = null;
    this.ticks = null;
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
  }

  setPosition(x: number | null, y: number | null) {
    this.x = x;
    this.y = y;
    this.opacity = x !== null && y !== null ? 1 : 0;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.x === null || this.y === null || this.opacity <= 0) return;

    const scale = this.priceScale.computePriceScale();
    const timeScale = this.timeScale.computeTimeScale();
    if (!scale || !timeScale) return;

    ctx.globalAlpha = this.opacity;
    const price = scale.unscaleY(this.y).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const index = timeScale.unscaleX(this.x);
    const time = this.timeScale.timeToIndex(index);
    const istTime = new Date(time).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ', IST';

    let tooltipText = `${price} | ${istTime}`;
    if (this.candles && index >= 0 && index < this.candles.length) {
      const candle = this.candles[Math.floor(index)];
      tooltipText += `\nO: ${candle.open.toFixed(2)} H: ${candle.high.toFixed(2)} L: ${candle.low.toFixed(2)} C: ${candle.close.toFixed(2)}`;
    } else if (this.ticks && index >= 0 && index < this.ticks.length) {
      const tick = this.ticks[Math.floor(index)];
      tooltipText += `\nPrice: ${tick.price.toFixed(2)} Vol: ${tick.volume}`;
    }

    const tooltipX = Math.min(width - 150, Math.max(10, this.x + 10));
    const tooltipY = Math.min(height - 40, Math.max(20, this.y - 10));
    drawText(ctx, tooltipText, tooltipX, tooltipY, this.options.color, this.options.font, this.options.background);
    ctx.globalAlpha = 1;

    this.opacity = Math.max(0, this.opacity - 0.02);
  }

  destroy() {
    this.x = null;
    this.y = null;
    this.candles = null;
    this.ticks = null;
  }
}
