import { Pattern, Candle, Tick, validatePattern } from './PatternTypes';

export class StructurePatterns {
  private patterns: Pattern[];

  constructor() {
    this.patterns = [];
  }

  detectPatterns(candles: Candle[] | null, ticks: Tick[] | null) {
    this.patterns = [];
    const data = candles || ticks?.map(t => ({
      open: t.price,
      high: t.price,
      low: t.price,
      close: t.price,
      time: t.time,
      volume: t.volume,
    })) || [];

    if (data.length < 5) return;

    this.detectHeadAndShoulders(data);
    this.detectDoubleTopBottom(data);

    this.patterns = this.patterns.filter(p => validatePattern(p));
  }

  private detectHeadAndShoulders(data: any[]) {
    for (let i = 4; i < data.length - 2; i++) {
      const leftShoulder = data[i - 4].close;
      const leftNeck = data[i - 3].close;
      const head = data[i - 2].close;
      const rightNeck = data[i - 1].close;
      const rightShoulder = data[i].close;
      if (
        head > leftShoulder &&
        head > rightShoulder &&
        Math.abs(leftNeck - rightNeck) < head * 0.01 &&
        leftShoulder > leftNeck &&
        rightShoulder > rightNeck
      ) {
        this.patterns.push({
          type: 'head_and_shoulders',
          points: [i - 4, i - 3, i - 2, i - 1, i].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  private detectDoubleTopBottom(data: any[]) {
    for (let i = 3; i < data.length - 1; i++) {
      const firstTop = data[i - 3].close;
      const trough = data[i - 2].close;
      const secondTop = data[i - 1].close;
      if (
        Math.abs(firstTop - secondTop) < firstTop * 0.01 &&
        trough < firstTop * 0.95
      ) {
        this.patterns.push({
          type: 'double_top',
          points: [i - 3, i - 2, i - 1].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  getPatterns(): Pattern[] {
    return this.patterns;
  }

  destroy() {
    this.patterns = [];
  }
}
