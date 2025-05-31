import { Pattern, Candle, validatePattern } from './PatternTypes';
import { PatternRenderer } from './PatternRenderer';

interface PatternScore {
  type: string;
  points: { index: number; price: number }[];
  score: number;
}

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

    const scores: PatternScore[] = [];

    // Elliott Wave (5-3) detection
    for (let i = 5; i < this.candles.length - 3; i++) {
      const wave1 = this.candles[i - 5].close < this.candles[i - 4].close;
      const wave2 = this.candles[i - 4].close > this.candles[i - 3].close;
      const wave3 = this.candles[i - 3].close < this.candles[i - 2].close;
      const wave4 = this.candles[i - 2].close > this.candles[i - 1].close;
      const wave5 = this.candles[i - 1].close < this.candles[i].close;
      if (wave1 && wave2 && wave3 && wave4 && wave5) {
        const score = this.calculatePatternScore([i - 5, i - 4, i - 3, i - 2, i - 1, i], 'elliott');
        scores.push({
          type: 'Elliott_Wave_5',
          points: [
            { index: i - 5, price: this.candles[i - 5].close },
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
          score,
        });
      }
    }

    // Gartley detection
    for (let i = 5; i < this.candles.length; i++) {
      if (this.isGartley(i)) {
        const score = this.calculatePatternScore([i - 4, i - 3, i - 2, i - 1, i], 'gartley');
        scores.push({
          type: 'Gartley',
          points: [
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
          score,
        });
      }
    }

    // Crab detection
    for (let i = 5; i < this.candles.length; i++) {
      if (this.isCrab(i)) {
        const score = this.calculatePatternScore([i - 4, i - 3, i - 2, i - 1, i], 'crab');
        scores.push({
          type: 'Crab',
          points: [
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
          score,
        });
      }
    }

    // Shark detection
    for (let i = 5; i < this.candles.length; i++) {
      if (this.isShark(i)) {
        const score = this.calculatePatternScore([i - 4, i - 3, i - 2, i - 1, i], 'shark');
        scores.push({
          type: 'Shark',
          points: [
            { index: i - 4, price: this.candles[i - 4].close },
            { index: i - 3, price: this.candles[i - 3].close },
            { index: i - 2, price: this.candles[i - 2].close },
            { index: i - 1, price: this.candles[i - 1].close },
            { index: i, price: this.candles[i].close },
          ],
          score,
        });
      }
    }

    // Select top-scoring patterns
    this.patterns = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Limit to top 10 patterns
      .map(s => ({ type: s.type, points: s.points }))
      .filter(p => validatePattern(p));

    this.renderer.setPatterns(this.patterns);
  }

  private calculatePatternScore(indices: number[], patternType: string): number {
    // Neural net-inspired scoring with weights for Fibonacci ratios
    let score = 0;
    const weights: { [key: string]: number[] } = {
      elliott: [0.3, 0.5, 0.8, 0.5, 0.3],
      gartley: [0.4, 0.6, 0.7, 0.6, 0.4],
      crab: [0.5, 0.7, 0.9, 0.7, 0.5],
      shark: [0.4, 0.6, 0.8, 0.6, 0.4],
    };
    const fibRatios = [0.382, 0.618, 1.618, 2.618];

    for (let i = 1; i < indices.length; i++) {
      const diff = Math.abs(this.candles[indices[i]].close - this.candles[indices[i - 1]].close);
      fibRatios.forEach((ratio, idx) => {
        if (Math.abs(diff / this.candles[indices[i - 1]].close - ratio) < 0.1) {
          score += (weights[patternType][i - 1] || 0.5) * (10 - idx);
        }
      });
    }
    return score;
  }

  private isGartley(index: number): boolean {
    const xa = this.candles[index - 4].close - this.candles[index - 3].close;
    const ab = this.candles[index - 3].close - this.candles[index - 2].close;
    const bc = this.candles[index - 2].close - this.candles[index - 1].close;
    const cd = this.candles[index - 1].close - this.candles[index].close;
    return Math.abs(ab / xa - 0.618) < 0.1 && Math.abs(cd / bc - 0.786) < 0.1;
  }

  private isCrab(index: number): boolean {
    const xa = this.candles[index - 4].close - this.candles[index - 3].close;
    const ab = this.candles[index - 3].close - this.candles[index - 2].close;
    const bc = this.candles[index - 2].close - this.candles[index - 1].close;
    const cd = this.candles[index - 1].close - this.candles[index].close;
    return Math.abs(ab / xa - 0.382) < 0.1 && Math.abs(cd / bc - 1.618) < 0.1;
  }

  private isShark(index: number): boolean {
    const xa = this.candles[index - 4].close - this.candles[index - 3].close;
    const ab = this.candles[index - 3].close - this.candles[index - 2].close;
    const bc = this.candles[index - 2].close - this.candles[index - 1].close;
    const cd = this.candles[index - 1].close - this.candles[index].close;
    return Math.abs(ab / xa - 0.886) < 0.1 && Math.abs(cd / bc - 1.13) < 0.1;
  }

  getPatterns(): Pattern[] {
    return this.patterns;
  }

  destroy() {
    this.patterns = [];
    this.candles = [];
  }
}
