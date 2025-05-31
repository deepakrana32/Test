import { IndicatorRenderer } from './IndicatorRenderer';
import { Candle } from './ChartTypes';

export class IndicatorManager {
  private renderer: IndicatorRenderer;
  private activeIndicators: { id: string; type: string; params?: any }[];

  constructor(renderer: IndicatorRenderer) {
    if (!renderer) throw new Error('Renderer missing');
    this.renderer = renderer;
    this.activeIndicators = [];
  }

  addIndicator(id: string, type: string, params?: any) {
    if (!this.activeIndicators.find(i => i.id === id)) {
      this.activeIndicators.push({ id, type, params });
      this.renderer.addIndicator(id, type, params);
    }
  }

  removeIndicator(id: string) {
    this.activeIndicators = this.activeIndicators.filter(i => i.id !== id);
    this.renderer.removeIndicator(id);
  }

  updateIndicators(candles: Candle[]) {
    const closes = new Float32Array(candles.map(c => c.close));
    const highs = new Float32Array(candles.map(c => c.high));
    const lows = new Float32Array(candles.map(c => c.low));
    this.renderer.computeIndicators(this.activeIndicators, closes, highs, lows);
  }

  render(ctx: CanvasRenderingContext2D) {
    this.renderer.render2D(ctx);
  }

  destroy() {
    this.renderer.destroy();
    this.activeIndicators = [];
  }
}
