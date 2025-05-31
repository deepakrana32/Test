import { Candle } from './ChartTypes';
import { TimeScaleEngine } from './TimeScale';
import { PriceScaleEngine } from './PriceScaleEngine';
import { ChartEventManager } from './ChartEventManager';
import { PatternResult, PatternCategory, PATTERN_OBJECT } from './PatternTypes';

export class PatternOverlay {
  private patterns: PatternResult[];
  private candles: Candle[];
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private eventManager: ChartEventManager;
  private ctx: CanvasRenderingContext2D;

  constructor(
    ctx: CanvasRenderingContext2D,
    patterns: PatternResult[],
    candles: Candle[],
    timeScale: TimeScaleEngine,
    priceScale: PriceScaleEngine,
    eventManager: ChartEventManager
  ) {
    this.ctx = ctx;
    this.patterns = patterns;
    this.candles = candles;
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.eventManager = eventManager;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.eventManager.on('click', (data) => {
      const index = Math.floor(this.timeScale.unscaleX(data.x));
      const pattern = this.patterns.find(p => p.index === index);
      if (pattern) {
        this.eventManager.dispatch('patternClick', { x: data.x, index, pattern });
      }
    });
  }

  draw() {
    // Hide patterns at high LOD (low zoom)
    const scale = this.timeScale.computeTimeScale().candleWidth;
    if (scale < 5) return;

    this.ctx.save();
    this.patterns.forEach(pattern => {
      const scaleX = this.timeScale.computeTimeScale().scaleX;
      const scaleY = this.priceScale.computePriceScale().scaleY;
      const x = scaleX(pattern.index);
      const y = scaleY(this.candles[pattern.index].high) - 8;
      const isBullish = pattern.typeLabels.some(label => PATTERN_OBJECT[label]?.isBullish);
      this.ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
      this.ctx.strokeStyle = 'black';
      this.ctx.lineWidth = 1;

      if (pattern.category === PatternCategory.Candlestick) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      } else {
        this.ctx.fillRect(x - 4, y - 4, 8, 8);
        this.ctx.strokeRect(x - 4, y - 4, 8, 8);
      }
    });
    this.ctx.restore();
  }

  updatePatterns(patterns: PatternResult[]) {
    this.patterns = patterns;
  }

  destroy() {
    // Remove event listeners if ChartEventManager supports it
  }
}
