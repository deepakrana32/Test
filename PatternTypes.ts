export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
  volume?: number;
}

export interface Tick {
  price: number;
  time: number;
  volume: number;
}

export interface Point {
  index: number;
  price: number;
}

export interface Pattern {
  type: 'elliott_wave' | 'gartley' | 'bpm' | 'predicted_bullish';
  points: Point[];
}

export function validatePattern(pattern: Pattern): boolean {
  return (
    ['elliott_wave', 'gartley', 'bpm', 'predicted_bullish'].includes(pattern.type) &&
    Array.isArray(pattern.points) &&
    pattern.points.every(p => typeof p.index === 'number' && typeof p.price === 'number')
  );
}
