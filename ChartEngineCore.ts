import { ChartWidget } from './ChartWidget';
import { ChartPlugins } from './ChartPlugins';
import { ChartEventManager } from './ChartEventManager';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { ChartRenderer } from './ChartRenderer';
import { DrawingToolManager } from './DrawingToolManager';
import { CrosshairManager } from './CrosshairManager';
import { Candle, Tick, Series, ChartOptions } from './ChartTypes';

export class ChartEngineCore {
  private widget: ChartWidget;
  private plugins: ChartPlugins;
  private series: Series[];
  private ringBuffer: Float32Array;
  private bufferSize: number;
  private bufferIndex: number;

  constructor(
    canvas: HTMLCanvasElement,
    options: Partial<ChartOptions> = {}
  ) {
    this.widget = new ChartWidget(canvas, options);
    this.plugins = this.widget['plugins'];
    this.series = [];
    this.bufferSize = 1_000_000; // 1M ticks
    this.ringBuffer = new Float32Array(this.bufferSize * 3); // price, time, volume
    this.bufferIndex = 0;
  }

  addSeries(series: Series) {
    this.series.push(series);
    this.widget.setData(
      series.type === 'candle' ? series.data as Candle[] : null,
      ['bar', 'area', 'line', 'histogram'].includes(series.type) ? series.data as Tick[] : null
    );
    this.computeIndicators(series);
  }

  addTick(tick: Tick) {
    this.ringBuffer[this.bufferIndex * 3] = tick.price;
    this.ringBuffer[this.bufferIndex * 3 + 1] = tick.time;
    this.ringBuffer[this.bufferIndex * 3 + 2] = tick.volume;
    this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    this.widget.setData(null, Array.from({ length: this.bufferSize }, (_, i) => ({
      price: this.ringBuffer[i * 3],
      time: this.ringBuffer[i * 3 + 1],
      volume: this.ringBuffer[i * 3 + 2],
    })));
  }

  private computeIndicators(series: Series) {
    if (series.type !== 'candle') return;
    const closes = (series.data as Candle[]).map(c => c.close);
    const sma = this.computeSMA(closes, 20);
    const ema = this.computeEMA(closes, 20);
    this.widget['renderer'].setIndicator('sma', new Float32Array(sma));
    this.widget['renderer'].setIndicator('ema', new Float32Array(ema));
  }

  private computeSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
        continue;
      }
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  private computeEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    let ema = data[0];
    result.push(NaN);
    for (let i = 1; i < data.length; i++) {
      if (i < period) {
        result.push(NaN);
        continue;
      }
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
    return result;
  }

  syncWith(other: ChartEngineCore) {
    this.widget['eventManager'].on('pan', (data) => other.widget['timeScale'].scroll(data.dx));
    this.widget['eventManager'].on('zoom', (data) => other.widget['timeScale'].zoomAt(data.x, data.delta));
  }

  destroy() {
    this.widget.destroy();
    this.series = [];
    this.ringBuffer = new Float32Array(0);
  }
}
