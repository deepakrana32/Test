import { CrosshairEvent, CrosshairParams } from './ChartOptions';
import { PriceScaleEngine } from './PriceScale';
import { TimeScaleEngine } from './TimeScale';
import { drawLine, drawText } from './CanvasUtils';
import { Candle, Tick } from './PatternTypes';

export class CrosshairManager {
  private x: number | null;
  private y: number | null;
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;
  private options: CrosshairParams;
  private listeners: ((event: CrosshairEvent) => void)[];
  private linkedManagers: CrosshairManager[];
  private candles: Candle[] | null;
  private ticks: Tick[] | null;

  constructor(priceScale: PriceScaleEngine, timeScale: TimeScaleEngine, options: Partial<CrosshairParams> = {}) {
    if (!priceScale || !timeScale) throw new Error('PriceScale or TimeScale missing');
    this.x = null;
    this.y = null;
    this.priceScale = priceScale;
    this.timeScale = timeScale;
    this.options = {
      color: '#888',
      dashed: true,
      labelBackground: 'rgba(0, 0, 0, 0.7)',
      labelColor: '#fff',
      ...options,
    };
    this.listeners = [];
    this.linkedManagers = [];
    this.candles = null;
    this.ticks = null;
    this.setupAccessibility();
  }

  private setupAccessibility() {
    const canvas = document.createElement('div');
    canvas.setAttribute('aria-live', 'polite');
    canvas.setAttribute('aria-label', 'Crosshair position');
    document.body.appendChild(canvas);
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
  }

  setPosition(x: number | null, y: number | null) {
    if (x !== null && y !== null) {
      x = Math.max(0, Math.min(x, 800)); // Assuming canvas width
      y = Math.max(0, Math.min(y, 400)); // Assuming canvas height
    }
    this.x = x;
    this.y = y;
    const event: CrosshairEvent = { type: x === null ? 'leave' : 'move', x, y, time: Date.now() };
    this.notifyListeners(event);
    this.syncCrosshair(event);
    this.updateAccessibility();
  }

  syncCrosshair(event: CrosshairEvent) {
    this.linkedManagers.forEach(manager => {
      if (manager !== this) {
        manager.setPosition(event.x, event.y);
      }
    });
  }

  link(manager: CrosshairManager) {
    if (!this.linkedManagers.includes(manager)) {
      this.linkedManagers.push(manager);
      manager.link(this);
    }
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.x === null || this.y === null) return;

    const scale = this.priceScale.computePriceScale();
    const timeScale = this.timeScale.computeTimeScale();
    if (!scale || !timeScale) return;

    // Draw crosshair
    drawLine(ctx, this.x, 0, this.x, height, this.options.color, 1, this.options.dashed);
    drawLine(ctx, 0, this.y, width, this.y, this.options.color, 1, this.options.dashed);

    // Draw price label
    const price = scale.unscaleY(this.y);
    const priceLabel = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const priceX = Math.min(width - 60, Math.max(10, width - 60));
    drawText(ctx, priceLabel, priceX, this.y - 2, this.options.labelColor, '12px Arial', this.options.labelBackground);

    // Draw time label (IST)
    const index = timeScale.unscaleX(this.x);
    const time = this.timeScale.timeToIndex(index);
    const date = new Date(time);
    const istLabel = date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ', IST';
    const timeX = Math.min(width - 100, Math.max(10, this.x + 2));
    drawText(ctx, istLabel, timeX, height - 2, this.options.labelColor, '12px Arial', this.options.labelBackground);

    // Draw candle/tick tooltip
    if (this.candles && index >= 0 && index < this.candles.length) {
      const candle = this.candles[Math.floor(index)];
      const tooltip = `O: ${candle.open.toFixed(2)} H: ${candle.high.toFixed(2)} L: ${candle.low.toFixed(2)} C: ${candle.close.toFixed(2)}`;
      drawText(ctx, tooltip, this.x + 10, this.y - 20, this.options.labelColor, '12px Arial', this.options.labelBackground);
    } else if (this.ticks && index >= 0 && index < this.ticks.length) {
      const tick = this.ticks[Math.floor(index)];
      const tooltip = `Price: ${tick.price.toFixed(2)} Vol: ${tick.volume}`;
      drawText(ctx, tooltip, this.x + 10, this.y - 20, this.options.labelColor, '12px Arial', this.options.labelBackground);
    }
  }

  private updateAccessibility() {
    const liveRegion = document.querySelector('[aria-label="Crosshair position"]');
    if (liveRegion && this.x !== null && this.y !== null) {
      const scale = this.priceScale.computePriceScale();
      const timeScale = this.timeScale.computeTimeScale();
      if (scale && timeScale) {
        const price = scale.unscaleY(this.y).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        const index = timeScale.unscaleX(this.x);
        const time = this.timeScale.timeToIndex(index);
        const istTime = new Date(time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
        let candleInfo = '';
        if (this.candles && index >= 0 && index < this.candles.length) {
          const candle = this.candles[Math.floor(index)];
          candleInfo = `, Open: ${candle.open.toFixed(2)}, High: ${candle.high.toFixed(2)}, Low: ${candle.low.toFixed(2)}, Close: ${candle.close.toFixed(2)}`;
        }
        liveRegion.textContent = `Price: ${price}, Time: ${istTime} IST${candleInfo}`;
      }
    }
  }

  onChange(callback: (event: CrosshairEvent) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(event: CrosshairEvent) {
    this.listeners.forEach(cb => cb(event));
  }

  destroy() {
    this.x = null;
    this.y = null;
    this.candles = null;
    this.ticks = null;
    this.listeners = [];
    this.linkedManagers = [];
    document.querySelector('[aria-label="Crosshair position"]')?.remove();
  }
}
