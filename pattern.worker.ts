import { Pattern, Candle, Tick } from './PatternTypes';

// Worker message types
interface WorkerMessage {
  type: 'setData';
  candles?: Candle[];
  ticks?: Tick[];
}

interface WorkerResponse {
  type: 'patterns';
  patterns: Pattern[];
}

// Worker context
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'setData') {
    const patterns = computePatterns(event.data.candles, event.data.ticks);
    self.postMessage({ type: 'patterns', patterns } as WorkerResponse);
  }
};

function computePatterns(candles: Candle[] | undefined, ticks: Tick[] | undefined): Pattern[] {
  const patterns: Pattern[] = [];
  const data = candles || ticks?.map(t => ({
    open: t.price,
    high: t.price,
    low: t.price,
    close: t.price,
    time: t.time,
    volume: t.volume,
  })) || [];

  if (data.length < 5) return patterns;

  // Elliott Wave
  for (let i = 4; i < data.length - 3; i++) {
    if (
      data[i - 4].close < data[i - 3].close &&
      data[i - 3].close > data[i - 2].close &&
      data[i - 2].close < data[i - 1].close &&
      data[i - 1].close > data[i].close &&
      data[i].close < data[i + 1].close
    ) {
      patterns.push({
        type: 'elliott_wave',
        points: [i - 4, i - 3, i - 2, i - 1, i, i + 1].map(idx => ({
          index: idx,
          price: data[idx].close,
        })),
      });
    }
  }

  // Gartley
  for (let i = 4; i < data.length; i++) {
    const xa = data[i - 4].close;
    const ab = data[i - 3].close;
    const bc = data[i - 2].close;
    const cd = data[i - 1].close;
    const xd = data[i].close;
    const abRet = Math.abs(ab - xa) * 0.618;
    const bcRet = Math.abs(bc - ab) * 0.382;
    const cdRet = Math.abs(cd - bc) * 1.272;
    if (
      Math.abs(ab - xa - abRet) < 0.1 &&
      Math.abs(bc - ab - bcRet) < 0.1 &&
      Math.abs(xd - cd - cdRet) < 0.1
    ) {
      patterns.push({
        type: 'gartley',
        points: [i - 4, i - 3, i - 2, i - 1, i].map(idx => ({
          index: idx,
          price: data[idx].close,
        })),
      });
    }
  }

  // BPM
  for (let i = 4; i < data.length; i++) {
    const xa = data[i - 4].close;
    const ab = data[i - 3].close;
    const bc = data[i - 2].close;
    const cd = data[i - 1].close;
    const xd = data[i].close;
    const abRet = Math.abs(ab - xa) * 0.786;
    const bcRet = Math.abs(bc - ab) * 0.618;
    const cdRet = Math.abs(cd - bc) * 1.618;
    if (
      Math.abs(ab - xa - abRet) < 0.1 &&
      Math.abs(bc - ab - bcRet) < 0.1 &&
      Math.abs(xd - cd - cdRet) < 0.1
    ) {
      patterns.push({
        type: 'bpm',
        points: [i - 4, i - 3, i - 2, i - 1, i].map(idx => ({
          index: idx,
          price: data[idx].close,
        })),
      });
    }
  }

  return patterns;
}
