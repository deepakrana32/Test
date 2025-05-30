```typescript
// PriceScaleEngine.ts
// Computes price axis scaling for financial charts

import { PriceScaleOptions, PriceScaleResult, PriceScaleTick } from '@/types/ChartTypes';

/**
 * Default price scale options.
 */
const DEFAULT_OPTS: PriceScaleOptions = {
  height: 600,
  minRangeMargin: 0.1,
  pixelPerTick: 50,
  minTicks: 2,
  maxTicks: 10,
};

/**
 * Rounds tick step to a nice number (e.g., 0.1, 0.5, 1, 5).
 * @param range Approximate tick step.
 * @returns Rounded tick step.
 */
function roundTickStep(range: number): number {
  if (range <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  const normalized = range / magnitude;
  if (normalized <= 1.5) return magnitude;
  if (normalized <= 3) return 2 * magnitude;
  if (normalized <= 7) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Formats a price value as a string.
 * @param value Price value.
 * @returns Formatted label.
 */
function formatTickLabel(value: number): string {
  if (Math.abs(value) < 0.01) return value.toFixed(4);
  if (Math.abs(value) < 1) return value.toFixed(3);
  if (Math.abs(value) < 100) return value.toFixed(2);
  return value.toFixed(0);
}

/**
 * Computes price axis scaling based on visible prices.
 * @param visiblePrices Array of visible price values.
 * @param opts Price scale options.
 * @returns Price scale result with ticks and scaling functions.
 */
export function computePriceScale(
  visiblePrices: number[],
  opts: Partial<PriceScaleOptions> = {}
): PriceScaleResult {
  const config: PriceScaleOptions = { ...DEFAULT_OPTS, ...opts };

  // Validate inputs
  if (!Array.isArray(visiblePrices) || !Number.isFinite(config.height) || config.height <= 0) {
    return {
      min: 0,
      max: 1,
      ticks: [],
      scaleY: () => 0,
      unscaleY: () => 0,
    };
  }

  if (visiblePrices.length === 0 || !visiblePrices.every(Number.isFinite)) {
    return {
      min: 0,
      max: 1,
      ticks: [],
      scaleY: () => 0,
      unscaleY: () => 0,
    };
  }

  let rawMin = Math.min(...visiblePrices);
  let rawMax = Math.max(...visiblePrices);

  // Handle equal min/max
  if (rawMax === rawMin) {
    const offset = Math.max(rawMax * 0.001, 0.01);
    rawMax += offset;
    rawMin -= offset;
  }

  // Add padding
  const range = rawMax - rawMin;
  const margin = range * config.minRangeMargin;
  let min = rawMin - margin;
  let max = rawMax + margin;

  // Clamp minimum to zero
  min = Math.max(min, 0);

  // Compute ticks
  const totalPixels = config.height;
  const desiredTicks = Math.floor(totalPixels / config.pixelPerTick);
  const clampedTicks = Math.max(config.minTicks, Math.min(config.maxTicks, desiredTicks));
  const step = roundTickStep((max - min) / clampedTicks);

  const ticks: PriceScaleTick[] = [];
  const firstTick = Math.floor(min / step) * step;

  for (let val = firstTick; val <= max; val += step) {
    const y = totalPixels - ((val - min) / (max - min)) * totalPixels;
    if (y >= 0 && y <= totalPixels) {
      ticks.push({
        value: val,
        y,
        label: config.formatLabel ? config.formatLabel(val) : formatTickLabel(val),
      });
    }
  }

  return {
    min,
    max,
    ticks,
    scaleY: (price: number) => totalPixels - ((price - min) / (max - min)) * totalPixels,
    unscaleY: (y: number) => ((totalPixels - y) / totalPixels) * (max - min) + min,
  };
}
```