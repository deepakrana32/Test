```typescript
// structurePatterns.ts
// Detects structure patterns (e.g., Double Top, Head and Shoulders) in candlestick data

import { Candle } from "@/types/Candle";
import { PatternResult, StructurePatternFlags, PatternCategory, PatternType, PATTERN_FLAG_MAP } from "@/types/PatternTypes";

/**
 * Validates a candle's properties.
 * @param candle The candle to validate.
 * @returns True if valid, false otherwise.
 */
function validateCandle(candle: Candle): boolean {
  return (
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.volume) &&
    candle.high >= candle.low
  );
}

/**
 * Detects structure patterns at a given index in the candlestick data.
 * @param candles Array of candlestick data.
 * @param index Current index to analyze.
 * @param lookback Number of candles to look back for pattern detection.
 * @returns PatternResult with detected patterns or null if none detected.
 */
export function detectStructurePatterns(
  candles: Candle[],
  index: number,
  lookback: number
): PatternResult | null {
  // Validate inputs
  if (
    !Array.isArray(candles) ||
    index < 0 ||
    index >= candles.length ||
    !Number.isInteger(lookback) ||
    lookback < 5 ||
    index < lookback ||
    !candles.every(validateCandle)
  ) {
    return null;
  }

  const result: PatternResult = {
    index,
    flags: 0,
    typeLabels: [],
    category: PatternCategory.Structure,
  };

  // Helper to check price proximity
  const isPriceSimilar = (price1: number, price2: number, tolerance: number = 0.5): boolean =>
    Math.abs(price1 - price2) < tolerance;

  // Double Top
  if (index >= lookback) {
    const window = candles.slice(index - lookback, index + 1);
    const highs = window.map(c => c.high);
    const maxHigh = Math.max(...highs);
    const peakIndices = highs
      .map((h, i) => (isPriceSimilar(h, maxHigh, 0.5) ? i : -1))
      .filter(i => i !== -1);

    if (peakIndices.length >= 2) {
      const [firstPeak, secondPeak] = peakIndices.slice(-2);
      if (secondPeak - firstPeak > 2 && highs.slice(firstPeak, secondPeak).every(h => h < maxHigh * 0.95)) {
        result.flags |= StructurePatternFlags.DoubleTop;
        result.typeLabels.push('DoubleTop');
      }
    }
  }

  // Double Bottom
  if (index >= lookback) {
    const window = candles.slice(index - lookback, index + 1);
    const lows = window.map(c => c.low);
    const minLow = Math.min(...lows);
    const troughIndices = lows
      .map((l, i) => (isPriceSimilar(l, minLow, 0.5) ? i : -1))
      .filter(i => i !== -1);

    if (troughIndices.length >= 2) {
      const [firstTrough, secondTrough] = troughIndices.slice(-2);
      if (secondTrough - firstTrough > 2 && lows.slice(firstTrough, secondTrough).every(l => l > minLow * 1.05)) {
        result.flags |= StructurePatternFlags.DoubleBottom;
        result.typeLabels.push('DoubleBottom');
      }
    }
  }

  // Head and Shoulders
  if (index >= lookback && lookback >= 7) {
    const window = candles.slice(index - lookback, index + 1);
    const highs = window.map(c => c.high);
    const maxHigh = Math.max(...highs);
    const headIndex = highs.indexOf(maxHigh);
    if (headIndex > 2 && headIndex < lookback - 2) {
      const leftShoulder = Math.max(...highs.slice(0, headIndex));
      const rightShoulder = Math.max(...highs.slice(headIndex + 1));
      if (
        isPriceSimilar(leftShoulder, rightShoulder, 0.5) &&
        leftShoulder < maxHigh * 0.95 &&
        highs.slice(0, headIndex).some(h => h < leftShoulder * 0.95) &&
        highs.slice(headIndex + 1).some(h => h < rightShoulder * 0.95)
      ) {
        result.flags |= StructurePatternFlags.HeadAndShoulders;
        result.typeLabels.push('HeadAndShoulders');
      }
    }
  }

  // Inverse Head and Shoulders
  if (index >= lookback && lookback >= 7) {
    const window = candles.slice(index - lookback, index + 1);
    const lows = window.map(c => c.low);
    const minLow = Math.min(...lows);
    const headIndex = lows.indexOf(minLow);
    if (headIndex > 2 && headIndex < lookback - 2) {
      const leftShoulder = Math.min(...lows.slice(0, headIndex));
      const rightShoulder = Math.min(...lows.slice(headIndex + 1));
      if (
        isPriceSimilar(leftShoulder, rightShoulder, 0.5) &&
        leftShoulder > minLow * 1.05 &&
        lows.slice(0, headIndex).some(l => l > leftShoulder * 1.05) &&
        lows.slice(headIndex + 1).some(l => l > rightShoulder * 1.05)
      ) {
        result.flags |= StructurePatternFlags.InverseHeadAndShoulders;
        result.typeLabels.push('InverseHeadAndShoulders');
      }
    }
  }

  // Triangle (Symmetrical)
  if (index >= lookback && lookback >= 10) {
    const window = candles.slice(index - lookback, index + 1);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    const highTrend = highs.map((h, i) => ({ y: h, x: i })).reduce((m, p) => m + p.y * p.x, 0) / highs.length;
    const lowTrend = lows.map((l, i) => ({ y: l, x: i })).reduce((m, p) => m + p.y * p.x, 0) / lows.length;
    if (Math.abs(highTrend - lowTrend) < 0.1 && highs.every((h, i) => h <= highs[0] - i * 0.01) && lows.every((l, i) => l >= lows[0] + i * 0.01)) {
      result.flags |= StructurePatternFlags.Triangle;
      result.typeLabels.push('Triangle');
    }
  }

  // Flag
  if (index >= lookback && lookback >= 5) {
    const window = candles.slice(index - lookback, index + 1);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    if (
      highs.every((h, i) => i === 0 || h <= highs[i - 1]) &&
      lows.every((l, i) => i === 0 || l >= lows[i - 1]) &&
      Math.abs(highs[0] - lows[0]) < 0.2 * (highs[0] + lows[0]) / 2
    ) {
      result.flags |= StructurePatternFlags.Flag;
      result.typeLabels.push('Flag');
    }
  }

  // Pennant
  if (index >= lookback && lookback >= 5) {
    const window = candles.slice(index - lookback, index + 1);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    if (
      highs.every((h, i) => i === 0 || h <= highs[i - 1] * 0.99) &&
      lows.every((l, i) => i === 0 || l >= lows[i - 1] * 1.01) &&
      Math.abs(highs[0] - lows[0]) < 0.3 * (highs[0] + lows[0]) / 2
    ) {
      result.flags |= StructurePatternFlags.Pennant;
      result.typeLabels.push('Pennant');
    }
  }

  return result.flags > 0 ? result : null;
}
```