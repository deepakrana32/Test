// ChartRenderer.ts
import { ChartPlugin } from './ChartPlugins';
import { Candle, PriceScaleOptions, TimeScaleOptions } from './ChartTypes';

export class ChartRendererPlugin implements ChartPlugin {
  name = 'CandlestickRenderer';
  priority = -10; // Render before indicators
  private candles: Candle[] = [];
  private timeScale: TimeScaleOptions;
  private priceScale: PriceScaleOptions;
  private computeScaleX: (index: number) => number;
  private computeScaleY: (price: number) => number;

  constructor(
    candles: Candle[],
    timeScale: TimeScaleOptions,
    priceScale: PriceScaleOptions,
    computeScaleX: (index: number) => number,
    computeScaleY: (price: number) => number
  ) {
    this.candles = candles;
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.computeScaleX = computeScaleX;
    this.computeScaleY = computeScaleY;
  }

  updateCandles(candles: Candle[]): void {
    this.candles = candles;
  }

  render2D(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    this.candles.forEach((candle, index) => {
      const x = this.computeScaleX(index);
      const openY = this.computeScaleY(candle.open);
      const closeY = this.computeScaleY(candle.close);
      const highY = this.computeScaleY(candle.high);
      const lowY = this.computeScaleY(candle.low);
      const halfWidth = this.timeScale.candleWidth / 2;

      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = candle.close >= candle.open ? 'green' : 'red';
      const bodyY = candle.close >= candle.open ? closeY : openY;
      const bodyHeight = Math.abs(openY - closeY) || 1;
      ctx.fillRect(x - halfWidth, bodyY, this.timeScale.candleWidth, bodyHeight);
    });
    ctx.restore();
  }

  renderGPU(): void {
    // Optional GPU rendering
  }
}
