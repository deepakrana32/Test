```typescript
// PatternTypes.ts
// Type definitions for candlestick and structure pattern detection

/**
 * Enum for pattern categories.
 */
export enum PatternCategory {
  Candlestick = 'Candlestick',
  Structure = 'Structure',
}

/**
 * Enum for candlestick pattern flags (bitmasks).
 */
export enum CandlestickPatternFlags {
  None = 0,
  BullishEngulfing = 1 << 0,
  BearishEngulfing = 1 << 1,
  Doji = 1 << 2,
  Hammer = 1 << 3,
  InvertedHammer = 1 << 4,
  ShootingStar = 1 << 5,
  MorningStar = 1 << 6,
  EveningStar = 1 << 7,
  TweezerTop = 1 << 8,
  TweezerBottom = 1 << 9,
}

/**
 * Enum for structure pattern flags (bitmasks).
 */
export enum StructurePatternFlags {
  None = 0,
  DoubleTop = 1 << 10,
  DoubleBottom = 1 << 11,
  HeadAndShoulders = 1 << 12,
  InverseHeadAndShoulders = 1 << 13,
  Triangle = 1 << 14,
  Flag = 1 << 15,
  Pennant = 1 << 16,
}

/**
 * Combined type for all pattern flags.
 */
export type PatternFlags = CandlestickPatternFlags | StructurePatternFlags;

/**
 * Interface for pattern flag mappings.
 */
interface PatternFlagMap {
  [key: string]: {
    flag: PatternFlags;
    name: string;
    category: PatternCategory;
    description?: string;
    isBullish?: boolean;
  };
}

/**
 * Mapping of pattern flags to names and categories.
 */
export const PATTERN_FLAG_MAP: PatternFlagMap = {
  BullishEngulfing: {
    flag: CandlestickPatternFlags.BullishEngulfing,
    name: 'Bullish Engulfing',
    category: PatternCategory.Candlestick,
    description: 'A bullish reversal pattern where a small bearish candle is followed by a larger bullish candle.',
    isBullish: true,
  },
  BearishEngulfing: {
    flag: CandlestickPatternFlags.BearishEngulfing,
    name: 'Bearish Engulfing',
    category: PatternCategory.Candlestick,
    description: 'A bearish reversal pattern where a small bullish candle is followed by a larger bearish candle.',
    isBullish: false,
  },
  Doji: {
    flag: CandlestickPatternFlags.Doji,
    name: 'Doji',
    category: PatternCategory.Candlestick,
    description: 'A neutral pattern where open and close prices are very close, indicating indecision.',
    isBullish: undefined,
  },
  Hammer: {
    flag: CandlestickPatternFlags.Hammer,
    name: 'Hammer',
    category: PatternCategory.Candlestick,
    description: 'A bullish reversal pattern with a small body and long lower shadow.',
    isBullish: true,
  },
  InvertedHammer: {
    flag: CandlestickPatternFlags.InvertedHammer,
    name: 'Inverted Hammer',
    category: PatternCategory.Candlestick,
    description: 'A bullish reversal pattern with a small body and long upper shadow.',
    isBullish: true,
  },
  ShootingStar: {
    flag: CandlestickPatternFlags.ShootingStar,
    name: 'Shooting Star',
    category: PatternCategory.Candlestick,
    description: 'A bearish reversal pattern with a small body and long upper shadow.',
    isBullish: false,
  },
  MorningStar: {
    flag: CandlestickPatternFlags.MorningStar,
    name: 'Morning Star',
    category: PatternCategory.Candlestick,
    description: 'A bullish reversal pattern formed over three candles.',
    isBullish: true,
  },
  EveningStar: {
    flag: CandlestickPatternFlags.EveningStar,
    name: 'Evening Star',
    category: PatternCategory.Candlestick,
    description: 'A bearish reversal pattern formed over three candles.',
    isBullish: false,
  },
  TweezerTop: {
    flag: CandlestickPatternFlags.TweezerTop,
    name: 'Tweezer Top',
    category: PatternCategory.Candlestick,
    description: 'A bearish reversal pattern with two candles having similar highs.',
    isBullish: false,
  },
  TweezerBottom: {
    flag: CandlestickPatternFlags.TweezerBottom,
    name: 'Tweezer Bottom',
    category: PatternCategory.Candlestick,
    description: 'A bullish reversal pattern with two candles having similar lows.',
    isBullish: true,
  },
  DoubleTop: {
    flag: StructurePatternFlags.DoubleTop,
    name: 'Double Top',
    category: PatternCategory.Structure,
    description: 'A bearish reversal pattern with two peaks at similar levels.',
    isBullish: false,
  },
  DoubleBottom: {
    flag: StructurePatternFlags.DoubleBottom,
    name: 'Double Bottom',
    category: PatternCategory.Structure,
    description: 'A bullish reversal pattern with two troughs at similar levels.',
    isBullish: true,
  },
  HeadAndShoulders: {
    flag: StructurePatternFlags.HeadAndShoulders,
    name: 'Head and Shoulders',
    category: PatternCategory.Structure,
    description: 'A bearish reversal pattern with three peaks, the middle being the highest.',
    isBullish: false,
  },
  InverseHeadAndShoulders: {
    flag: StructurePatternFlags.InverseHeadAndShoulders,
    name: 'Inverse Head and Shoulders',
    category: PatternCategory.Structure,
    description: 'A bullish reversal pattern with three troughs, the middle being the lowest.',
    isBullish: true,
  },
  Triangle: {
    flag: StructurePatternFlags.Triangle,
    name: 'Triangle',
    category: PatternCategory.Structure,
    description: 'A continuation pattern with converging trendlines.',
    isBullish: undefined,
  },
  Flag: {
    flag: StructurePatternFlags.Flag,
    name: 'Flag',
    category: PatternCategory.Structure,
    description: 'A continuation pattern resembling a flag on a pole.',
    isBullish: undefined,
  },
  Pennant: {
    flag: StructurePatternFlags.Pennant,
    name: 'Pennant',
    category: PatternCategory.Structure,
    description: 'A continuation pattern with converging trendlines after a sharp move.',
    isBullish: undefined,
  },
};

/**
 * Derived type for pattern names.
 */
export type PatternType = keyof typeof PATTERN_FLAG_MAP;

/**
 * Interface for pattern detection results.
 */
export interface PatternResult {
  index: number;
  flags: PatternFlags;
  typeLabels: PatternType[];
  category: PatternCategory;
}

/**
 * Validates a PatternResult object.
 * @param result The PatternResult to validate.
 * @returns True if valid, false otherwise.
 */
export function validatePatternResult(result: PatternResult): boolean {
  if (
    !Number.isInteger(result.index) ||
    result.index < 0 ||
    !Number.isInteger(result.flags) ||
    !Array.isArray(result.typeLabels) ||
    !Object.values(PatternCategory).includes(result.category)
  ) {
    return false;
  }

  const validFlags = Object.values(PATTERN_FLAG_MAP).map(entry => entry.flag);
  const validLabels = Object.keys(PATTERN_FLAG_MAP);

  // Check if flags are valid
  let flagSum = 0;
  for (const flag of validFlags) {
    if (result.flags & flag) {
      flagSum |= flag;
    }
  }
  if (flagSum !== result.flags) {
    return false;
  }

  // Check if typeLabels match flags and category
  const expectedLabels = Object.entries(PATTERN_FLAG_MAP)
    .filter(([_, entry]) => (result.flags & entry.flag) !== 0 && entry.category === result.category)
    .map(([key]) => key);

  return (
    result.typeLabels.every(label => validLabels.includes(label)) &&
    result.typeLabels.length === expectedLabels.length &&
    result.typeLabels.every(label => expectedLabels.includes(label))
  );
}

/**
 * Gets details for a pattern flag.
 * @param flag The pattern flag.
 * @returns Pattern details or null if invalid.
 */
export function getPatternDetails(flag: PatternFlags): PatternFlagMap[keyof PatternFlagMap] | null {
  const entry = Object.values(PATTERN_FLAG_MAP).find(e => e.flag === flag);
  return entry || null;
}
```