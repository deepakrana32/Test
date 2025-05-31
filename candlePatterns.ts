import { Pattern, Candle, Tick, validatePattern } from './PatternTypes';

export class CandlePatterns {
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

    if (data.length < 2) return;

    this.detectDoji(data);
    this.detectEngulfing(data);
    this.detectHammer(data);

    this.patterns = this.patterns.filter(p => validatePattern(p));
  }

  private detectDoji(data: any[]) {
    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      if (Math.abs(candle.open - candle.close) < (candle.high - candle.low) * 0.1) {
        this.patterns.push({
          type: 'doji',
          points: [{ index: i, price: candle.close }],
        });
      }
    }
  }

  private detectEngulfing(data: any[]) {
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (
        prev.close < prev.open &&
        curr.close > curr.open &&
        curr.open <= prev.close &&
        curr.close >= prev.open
      ) {
        this.patterns.push({
          type: 'bullish_engulfing',
          points: [i - 1, i].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      } else if (
        prev.close > prev.open &&
        curr.close < curr.open &&
        curr.open >= prev.close &&
        curr.close <= prev.open
      ) {
        this.patterns.push({
          type: 'bearish_engulfing',
          points: [i - 1, i].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  private detectHammer(data: any[]) {
    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const body = Math.abs(candle.open - candle.close);
      const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
      if (
        lowerShadow > body * 2 &&
        (candle.high - Math.max(candle.open, candle.close)) < body
      ) {
        this.patterns.push({
          type: 'hammer',
          points: [{ index: i, price: candle.close }],
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
