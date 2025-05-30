// patterns/candlePatterns.ts
import { Candle } from "@/types/Candle";
import { PatternFlags, PatternResult } from "@/types/PatternTypes";

// Interface for pattern detectors to enable extensibility
interface PatternDetector {
  name: string;
  flag: PatternFlags;
  detect: (current: Candle, previous: Candle, metrics: CandleMetrics) => boolean;
}

// Interface for precomputed candle metrics to optimize performance
interface CandleMetrics {
  body: number;
  upperShadow: number;
  lowerShadow: number;
  range: number;
}

/**
 * Validates that a candle has finite numeric properties.
 * @param candle The candle to validate.
 * @returns True if the candle is valid, false otherwise.
 */
function validateCandle(candle: Candle): boolean {
  return (
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    candle.high >= candle.low
  );
}

/**
 * Computes candle metrics (body, shadows, range) for pattern detection.
 * @param candle The candle to compute metrics for.
 * @returns CandleMetrics object or null if invalid.
 */
function computeCandleMetrics(candle: Candle): CandleMetrics | null {
  if (!validateCandle(candle)) return null;
  
  const body = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.close, candle.open);
  const lowerShadow = Math.min(candle.close, candle.open) - candle.low;
  const range = candle.high - candle.low;

  return { body, upperShadow, lowerShadow, range };
}

/**
 * List of candlestick pattern detectors.
 * New patterns can be added to this array without modifying the core function.
 */
const detectors: PatternDetector[] = [
  {
    name: "Doji",
    flag: PatternFlags.Doji,
    detect: (_current, _previous, metrics) => metrics.range > 0 && metrics.body < metrics.range * 0.1,
  },
  {
    name: "BullishEngulfing",
    flag: PatternFlags.BullishEngulfing,
    detect: (current, previous, _metrics) =>
      previous.close < previous.open &&
      current.close > current.open &&
      current.close > previous.open &&
      current.open < previous.close,
  },
  {
    name: "BearishEngulfing",
    flag: PatternFlags.BearishEngulfing,
    detect: (current, previous, _metrics) =>
      previous.close > previous.open &&
      current.close < current.open &&
      current.open > previous.close &&
      current.close < previous.open,
  },
  {
    name: "Hammer",
    flag: PatternFlags.Hammer,
    detect: (_current, _previous, metrics) =>
      metrics.lowerShadow > 2 * metrics.body && metrics.upperShadow < metrics.body,
  },
  {
    name: "ShootingStar",
    flag: PatternFlags.ShootingStar,
    detect: (_current, _previous, metrics) =>
      metrics.upperShadow > 2 * metrics.body && metrics.lowerShadow < metrics.body,
  },
];

/**
 * Detects candlestick patterns for a given candle index.
 * @param candles Array of candlestick data.
 * @param i Index of the candle to analyze.
 * @returns A PatternResult object with detected patterns or null if no patterns are found or inputs are invalid.
 */
export function detectCandlePatterns(candles: Candle[], i: number): PatternResult | null {
  // Validate inputs
  if (!Array.isArray(candles) || i < 1 || i >= candles.length || !candles[i] || !candles[i - 1]) {
    return null;
  }

  const current = candles[i];
  const previous = candles[i - 1];

  // Validate candles
  if (!validateCandle(current) || !validateCandle(previous)) {
    return null;
  }

  // Compute metrics for the current candle
  const metrics = computeCandleMetrics(current);
  if (!metrics || metrics.range === 0) {
    return null;
  }

  // Initialize result
  const patterns: PatternResult = { flags: 0, typeLabels: [] };

  // Detect patterns
  for (const detector of detectors) {
    if (detector.detect(current, previous, metrics)) {
      patterns.flags |= detector.flag;
      patterns.typeLabels.push(detector.name);
    }
  }

  // Return null if no patterns detected
  return patterns.flags > 0 ? patterns : null;
}