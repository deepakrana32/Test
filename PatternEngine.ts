```typescript
// PatternEngine.ts
// CPU-based engine for detecting candlestick and structure patterns

import { Candle } from "@/types/Candle";
import { PatternFlags, PatternResult, PatternType, PatternCategory, validatePatternResult } from "@/types/PatternTypes";
import { detectCandlePatterns } from "./patterns/candlePatterns";
import { detectStructurePatterns } from "./patterns/structurePatterns";

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

// Interface for pattern engine configuration
interface PatternEngineConfig {
  enableCandlestick: boolean;
  enableStructure: boolean;
  maxPatternLookback: number;
  lodLevel: number;
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
 * CPU-based engine for detecting candlestick and structure patterns.
 */
export class PatternEngine {
  private readonly candles: ReadonlyArray<Candle>;
  private readonly config: Readonly<PatternEngineConfig>;
  private results: PatternResult[] = [];
  private readonly detectors: PatternDetector[];

  constructor(candles: Candle[], config?: Partial<PatternEngineConfig>) {
    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error('Invalid candles: must be a non-empty array');
    }
    if (!candles.every(validateCandle)) {
      throw new Error('Invalid candles: all candles must have finite open, high, low, close, and volume');
    }

    const maxPatternLookback = config?.maxPatternLookback ?? 100;
    const lodLevel = config?.lodLevel ?? 1;
    if (maxPatternLookback < 1 || !Number.isInteger(maxPatternLookback)) {
      throw new Error('Invalid maxPatternLookback: must be a positive integer');
    }
    if (lodLevel < 1 || lodLevel > 5 || !Number.isInteger(lodLevel)) {
      throw new Error('Invalid lodLevel: must be an integer between 1 and 5');
    }

    this.candles = candles;
    this.config = {
      enableCandlestick: config?.enableCandlestick ?? true,
      enableStructure: config?.enableStructure ?? true,
      maxPatternLookback,
      lodLevel,
    };

    this.detectors = [
      {
        name: "CandlestickDetector",
        category: PatternCategory.Candlestick,
        detect: (candles, index) => {
          const result = detectCandlePatterns(candles, index);
          return result ? { ...result, category: PatternCategory.Candlestick } : null;
        },
      },
      {
        name: "StructureDetector",
        category: PatternCategory.Structure,
        detect: (candles, index, lookback) => {
          const result = detectStructurePatterns(candles, index, lookback);
          return result ? { ...result, category: PatternCategory.Structure } : null;
        },
      },
    ];
  }

  public run(): ReadonlyArray<PatternResult> {
    this.results = [];

    for (let i = 0; i < this.candles.length; i++) {
      const result: PatternResult = {
        index: i,
        flags: 0,
        typeLabels: [],
        category: PatternCategory.Candlestick,
      };
      const typeLabelSet = new Set<PatternType>();

      for (const detector of this.detectors) {
        try {
          if (
            (detector.category === PatternCategory.Candlestick && !this.config.enableCandlestick) ||
            (detector.category === PatternCategory.Structure && (!this.config.enableStructure || i < this.config.maxPatternLookback))
          ) {
            continue;
          }

          const match = detector.detect(
            this.candles,
            i,
            detector.category === PatternCategory.Structure ? this.config.maxPatternLookback : undefined
          );

          if (match) {
            result.flags |= match.flags;
            result.category = match.category;
            match.typeLabels.forEach(label => typeLabelSet.add(label));
          }
        } catch (error) {
          console.warn(
            `Pattern detector "${detector.name}" failed at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      if (result.flags > 0) {
        result.typeLabels = Array.from(typeLabelSet);
        if (validatePatternResult(result)) {
          this.results.push(result);
        } else {
          console.warn(`Invalid PatternResult at index ${i}`);
        }
      }
    }

    return this.results;
  }

  public updateConfig(config: Partial<PatternEngineConfig>): void {
    const newConfig: PatternEngineConfig = { ...this.config };

    if (typeof config.enableCandlestick === 'boolean') {
      newConfig.enableCandlestick = config.enableCandlestick;
    }
    if (typeof config.enableStructure === 'boolean') {
      newConfig.enableStructure = config.enableStructure;
    }
    if (config.maxPatternLookback !== undefined) {
      if (config.maxPatternLookback < 1 || !Number.isInteger(config.maxPatternLookback)) {
        throw new Error('Invalid maxPatternLookback: must be a positive integer');
      }
      newConfig.maxPatternLookback = config.maxPatternLookback;
    }
    if (config.lodLevel !== undefined) {
      if (config.lodLevel < 1 || config.lodLevel > 5 || !Number.isInteger(config.lodLevel)) {
        throw new Error('Invalid lodLevel: must be an integer between 1 and 5');
      }
      newConfig.lodLevel = config.lodLevel;
    }

    if (
      newConfig.enableCandlestick !== this.config.enableCandlestick ||
      newConfig.enableStructure !== this.config.enableStructure ||
      newConfig.maxPatternLookback !== this.config.maxPatternLookback ||
      newConfig.lodLevel !== this.config.lodLevel
    ) {
      Object.assign(this.config, newConfig);
      this.results = [];
    }
  }

  public getResults(): ReadonlyArray<PatternResult> {
    return this.results;
  }
}
```