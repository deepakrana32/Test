// ChartRenderer.ts
import { Candle, PriceScaleOptions, TimeScaleOptions } from './ChartTypes';

/**
 * Manages low-level canvas rendering for candlestick charts.
 */
export class ChartRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  public setCanvasSize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }

  public renderCandles(
    candles: Candle[],
    ctx: CanvasRenderingContext2D,
    timeScale: TimeScaleOptions,
    priceScale: PriceScaleOptions,
    computeScaleX: (index: number) => number,
    computeScaleY: (price: number) => number
  ): void {
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width / (window.devicePixelRatio || 1), this.canvas.height / (window.devicePixelRatio || 1));

    candles.forEach((candle, index) => {
      const x = computeScaleX(index);
      const openY = computeScaleY(candle.open);
      const closeY = computeScaleY(candle.close);
      const highY = computeScaleY(candle.high);
      const lowY = computeScaleY(candle.low);
      const halfWidth = timeScale.candleWidth / 2;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Body
      ctx.fillStyle = candle.close >= candle.open ? 'green' : 'red';
      const bodyY = candle.close >= candle.open ? closeY : openY;
      const bodyHeight = Math.abs(openY - closeY) || 1;
      ctx.fillRect(x - halfWidth, bodyY, timeScale.candleWidth, bodyHeight);
    });

    ctx.restore();
  }

  public updateCandles(
    candles: Candle[],
    ctx: CanvasRenderingContext2D,
    timeScale: TimeScaleOptions,
    priceScale: PriceScaleOptions,
    computeScaleX: (index: number) => number,
    computeScaleY: (price: number) => number
  ): void {
    this.renderCandles(candles, ctx, timeScale, priceScale, computeScaleX, computeScaleY);
  }
}
