import { Pattern, Candle, validatePattern } from './PatternTypes';
import { PatternRenderer } from './PatternRenderer';

export class PatternManager {
  private patterns: Pattern[];
  private renderer: PatternRenderer;
  private candles: Candle[];

  constructor(renderer: PatternRenderer) {
    if (!renderer) throw new Error('Renderer missing');
    this.patterns = [];
    this.renderer = renderer;
    this.candles = [];
  }

  setCandles(candles: Candle[]) {
    this.candles = candles.filter(c => c.open && c.high && c.low && c.close && c.time);
    this.detectPatterns();
  }

  private detectPatterns() {
    this.patterns = [];
    if (this.candles.length < 5) return;

    // Simplified Elliott Wave (5-3) detection
    for (let i = 5; i < this.candles.length - 3; i++) {
      const wave1 = this.candles[i - 5].close < this.candles[i - 4].close;
      const wave2 = this.candles[i - 4].close > this.candles[i - 3].close;
      const wave3 = this.candles[i - 3].close < this.candles[i - 2].close;
      const wave4 = this.candles[i - 2].close > this.candles[i - 1].close;
      const wave5 = this.candles[i - 1].close < this.candles[i].close;
      if (wave1 && wave2 && wave3 && wave4 && wave5) {
        this.patterns.push({
          type: 'Elliott_Wave_5',
          points: [
            { index: i - 5, price: this.candles[i - 5].close },
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
        });
      }
    }

    // Simplified Gartley detection (placeholder)
    for (let i = 5; i < this.candles.length; i++) {
      if (this.isGartley(i)) {
        this.patterns.push({
          type: 'Gartley',
          points: [
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
        });
      }
    }

    this.patterns = this.patterns.filter(p => validatePattern(p));
    this.renderer.setPatterns(this.patterns);
  }

  private isGartley(index: number): boolean {
    // Placeholder logic for Gartley detection
    const xa = this.candles[index - 4].close - this.candles[index - 3].close;
    const ab = this.candles[index - 3].close - this.candles[index - 2].close;
    const bc = this.candles[index - 2].close - this.candles[index - 1].close;
    const cd = this.candles[index - 1].close - this.candles[index].close;
    return Math.abs(ab / xa - 0.618) < 0.1 && Math.abs(cd / bc - 0.786) < 0.1;
  }

  getPatterns(): Pattern[] {
    return this.patterns;
  }

  destroy() {
    this.patterns = [];
    this.candles = [];
  }
}
