import { ChartPlugins } from './ChartPlugins';
import { ChartRenderer } from './ChartRenderer';
import { Candle } from './PatternTypes';

export class IndicatorManager {
  private plugins: ChartPlugins;
  private renderer: ChartRenderer;
  private activeIndicators: string[];

  constructor(renderer: ChartRenderer) {
    if (!renderer) throw new Error('Renderer missing');
    this.plugins = new ChartPlugins();
    this.renderer = renderer;
    this.activeIndicators = [];
    this.plugins.setRenderer(this.renderer);
  }

  addIndicator(id: string) {
    if (!this.activeIndicators.includes(id)) {
      this.activeIndicators.push(id);
    }
  }

  removeIndicator(id: string) {
    this.activeIndicators = this.activeIndicators.filter(i => i !== id);
  }

  updateIndicators(candles: Candle[]) {
    const closes = new Float32Array(candles.map(c => c.close));
    const highs = new Float32Array(candles.map(c => c.high));
    const lows = new Float32Array(candles.map(c => c.low));
    this.plugins.computeIndicators(closes, highs, lows);
  }

  render(ctx: CanvasRenderingContext2D) {
    this.plugins.render2D(ctx);
  }

  destroy() {
    this.plugins.destroy();
    this.activeIndicators = [];
  }
}
