import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';

interface Indicator {
  id: string;
  type: string;
  params?: any;
  data?: number[];
}

export class IndicatorRenderer {
  private indicators: Indicator[];
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;

  constructor(priceScale: PriceScaleEngine, timeScale: TimeScaleEngine) {
    this.indicators = [];
    this.priceScale = priceScale;
    this.timeScale = timeScale;
  }

  addIndicator(id: string, type: string, params?: any) {
    this.indicators.push({ id, type, params });
  }

  removeIndicator(id: string) {
    this.indicators = this.indicators.filter(i => i.id !== id);
  }

  computeIndicators(indicators: Indicator[], closes: Float32Array, highs: Float32Array, lows: Float32Array) {
    indicators.forEach(indicator => {
      if (indicator.type === 'SMA') {
        const period = indicator.params?.period || 14;
        const data = new Array(closes.length).fill(0);
        for (let i = period - 1; i < closes.length; i++) {
          const sum = Array.from(closes.slice(i - period + 1, i + 1)).reduce((a, b) => a + b, 0);
          data[i] = sum / period;
        }
        indicator.data = data;
      }
      // Add more indicators (e.g., RSI, MACD)
    });
  }

  render2D(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const scaleX = this.timeScale.computeTimeScale().scaleX;
    const scaleY = this.priceScale.computePriceScale().scaleY;

    this.indicators.forEach(indicator => {
      if (indicator.data) {
        ctx.beginPath();
        ctx.strokeStyle = 'blue'; // Theme via StyleManager later
        ctx.lineWidth = 1;
        indicator.data.forEach((value, i) => {
          if (value) {
            const x = scaleX(i);
            const y = scaleY(value);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  destroy() {
    this.indicators = [];
  }
}
