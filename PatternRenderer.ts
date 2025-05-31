import { Pattern, validatePattern } from './PatternTypes';
import { drawLine, drawText } from './canvas-utils';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';

export class PatternRenderer {
  private patterns: Pattern[];
  private priceScale: PriceScaleEngine;
  private timeScale: TimeScaleEngine;

  constructor(priceScale: PriceScaleEngine, timeScale: TimeScaleEngine) {
    if (!priceScale || !timeScale) throw new Error('PriceScale or TimeScale missing');
    this.patterns = [];
    this.priceScale = priceScale;
    this.timeScale = timeScale;
  }

  setPatterns(patterns: Pattern[]) {
    this.patterns = patterns.filter(p => validatePattern(p));
  }

  render(ctx: CanvasRenderingContext2D) {
    const priceScale = this.priceScale.computePriceScale();
    const timeScale = this.timeScale.computeTimeScale();
    if (!priceScale || !timeScale) return;

    this.patterns.forEach(pattern => {
      const points = pattern.points.map(p => ({
        x: timeScale.scaleX(p.index),
        y: priceScale.scaleY(p.price),
      }));

      for (let i = 1; i < points.length; i++) {
        drawLine(ctx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, '#f00');
      }

      // Draw pattern label
      const lastPoint = points[points.length - 1];
      drawText(ctx, pattern.type.replace('_', ' '), lastPoint.x + 5, lastPoint.y - 5, '#f00');
    });
  }

  destroy() {
    this.patterns = [];
  }
}
