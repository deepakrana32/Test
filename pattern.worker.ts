```typescript
// pattern.worker.ts
// Web Worker for offloading candlestick and structure pattern detection

import { detectCandlePatterns } from "./patterns/candlePatterns";
import { detectStructurePatterns } from "./patterns/structurePatterns";
import { Candle } from "@/types/Candle";
import { PatternResult, PatternFlags, PatternType, PatternCategory, validatePatternResult } from "@/types/PatternTypes";

// Interface for pattern match
interface PatternMatch {
  index: number;
  flags: PatternFlags;
  typeLabels: PatternType[];
  category: PatternCategory;
}

// Interface for pattern detector
interface PatternDetector {
  name: string;
  category: PatternCategory;
  detect: (candles: Candle[], index: number, lookback?: number) => PatternMatch | null;
}

// Interface for worker configuration
interface WorkerConfig {
  enableCandlestick: boolean;
  enableStructure: boolean;
  maxPatternLookback: number;
  batchSize?: number;
}

// Interface for incoming worker messages
interface WorkerMessage {
  command: 'detectPatterns';
  candles: Candle[];
  config: WorkerConfig;
}

// Interface for outgoing worker responses
interface WorkerResponse {
  type: 'success' | 'error';
  data?: PatternResult[];
  error?: string;
}

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
 * Validates worker input data.
 * @param data The incoming message data.
 * @returns Valid WorkerMessage or null if invalid.
 */
function validateInput(data: any): WorkerMessage | null {
  if (
    !data ||
    typeof data !== 'object' ||
    data.command !== 'detectPatterns' ||
    !Array.isArray(data.candles) ||
    data.candles.length === 0 ||
    !data.candles.every(validateCandle) ||
    !data.config ||
    typeof data.config !== 'object' ||
    typeof data.config.enableCandlestick !== 'boolean' ||
    typeof data.config.enableStructure !== 'boolean' ||
    !Number.isInteger(data.config.maxPatternLookback) ||
    data.config.maxPatternLookback < 1
  ) {
    return null;
  }
  return data as WorkerMessage;
}

/**
 * Detects patterns for a batch of candles.
 * @param candles Array of candlestick data.
 * @param config Worker configuration.
 * @param startIndex Start index for the batch.
 * @param endIndex End index for the batch.
 * @returns Array of PatternResult objects.
 */
function detectPatternsBatch(candles: Candle[], config: WorkerConfig, startIndex: number, endIndex: number): PatternResult[] {
  const results: PatternResult[] = [];
  const detectors: PatternDetector[] = [
    {
      name: 'CandlestickDetector',
      category: PatternCategory.Candlestick,
      detect: (c, i) => {
        const result = detectCandlePatterns(c, i);
        return result ? { ...result, category: PatternCategory.Candlestick } : null;
      },
    },
    {
      name: 'StructureDetector',
      category: PatternCategory.Structure,
      detect: (c, i, lookback) => {
        const result = detectStructurePatterns(c, i, lookback);
        return result ? { ...result, category: PatternCategory.Structure } : null;
      },
    },
  ];

  for (let i = startIndex; i < endIndex && i < candles.length; i++) {
    let flags: PatternFlags = 0;
    const typeLabelSet = new Set<PatternType>();
    let category: PatternCategory | null = null;

    detectors.forEach(detector => {
      try {
        if (
          (detector.category === PatternCategory.Candlestick && !config.enableCandlestick) ||
          (detector.category === PatternCategory.Structure && (!config.enableStructure || i < config.maxPatternLookback))
        ) {
          return;
        }

        const match = detector.detect(
          candles,
          i,
          detector.category === PatternCategory.Structure ? config.maxPatternLookback : undefined
        );

        if (match) {
          flags |= match.flags;
          category = match.category;
          match.typeLabels.forEach(label => typeLabelSet.add(label));
        }
      } catch (error) {
        console.warn(
          `Pattern detector "${detector.name}" failed at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    if (flags > 0 && category) {
      const result: PatternResult = {
        index: i,
        flags,
        typeLabels: Array.from(typeLabelSet),
        category,
      };
      if (validatePatternResult(result)) {
        results.push(result);
      } else {
        console.warn(`Invalid PatternResult at index ${i}`);
      }
    }
  }

  return results;
}

/**
 * Handles incoming messages and processes pattern detection.
 * @param event The message event.
 */
onmessage = function (event: MessageEvent) {
  const input = validateInput(event.data);
  if (!input) {
    postMessage({
      type: 'error',
      error: 'Invalid input: must provide valid candles array and configuration',
    } as WorkerResponse);
    return;
  }

  const { candles, config } = input;
  const batchSize = config.batchSize ?? 1000;
  try {
    const results: PatternResult[] = [];
    for (let start = 0; start < candles.length; start += batchSize) {
      const end = Math.min(start + batchSize, candles.length);
      results.push(...detectPatternsBatch(candles, config, start, end));
    }

    postMessage({
      type: 'success',
      data: results,
    } as WorkerResponse);
  } catch (error) {
    postMessage({
      type: 'error',
      error: `Pattern detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    } as WorkerResponse);
  }
};

/**
 * Handles worker errors.
 * @param error The error event.
 */
onerror = function (error: ErrorEvent) {
  postMessage({
    type: 'error',
    error: `Worker error: ${error.message}`,
  } as WorkerResponse);
};
```