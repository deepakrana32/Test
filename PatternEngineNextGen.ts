```typescript
// PatternEngineNextGen.ts
// Nuclear-grade Multi-Pattern Clustering + Structure Detection + Statistical Pattern Embeddings

import { Candle } from "./types";

// Enums for type safety
enum ClusterType {
  BullishMomentum = "Bullish Momentum Cluster",
  BearishMomentum = "Bearish Momentum Cluster",
  Reversal = "Reversal Cluster",
  Continuation = "Continuation Cluster",
}

enum StructureType {
  SwingHigh = "Swing High",
  SwingLow = "Swing Low",
  HigherHigh = "Higher High",
  LowerLow = "Lower Low",
}

enum Strength {
  Minor = "Minor",
  Major = "Major",
}

// Interfaces for output data
interface PatternCluster {
  index: number;
  bitmask: number;
  confidenceScore: number;
  clusterType: ClusterType;
}

interface StructurePoint {
  index: number;
  type: StructureType;
  zone?: [number, number];
  strength: Strength;
}

interface PatternEmbedding {
  index: number;
  embedding: Float32Array;
  similarTo: string;
}

interface PatternEngineNextGenResult {
  clusters: PatternCluster[];
  structures: StructurePoint[];
  embeddings: PatternEmbedding[];
}

// Configuration interface
interface PatternEngineConfig {
  windowSize?: number; // Window for structure detection (default: 5)
  confidenceThreshold?: number; // Minimum confidence for clusters (default: 0.3)
  embeddingDimensions?: number; // Number of embedding features (default: 6)
}

// Interface for pattern detectors
interface PatternDetector {
  name: string;
  bit: number;
  confidence: number;
  clusterType: ClusterType;
  detect: (current: Candle, prev: Candle, prev2: Candle, next: Candle, metrics: CandleMetrics) => boolean;
}

// Interface for structure detectors
interface StructureDetector {
  name: string;
  detect: (candles: Candle[], index: number, highs: Float32Array, lows: Float32Array, windowSize: number) => StructurePoint | null;
}

// Interface for embedding generators
interface EmbeddingGenerator {
  name: string;
  generate: (candles: Candle[], index: number, dimensions: number) => Float32Array;
}

// Interface for candle metrics
interface CandleMetrics {
  body: number;
  upperShadow: number;
  lowerShadow: number;
  range: number;
}

/**
 * Validates a candle's properties.
 * @param candle The candle to validate.
 * @returns True if valid, false otherwise.
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
 * Computes candle metrics for pattern detection.
 * @param candle The candle to compute metrics for.
 * @returns CandleMetrics or null if invalid.
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
 * Computes cosine similarity between two embeddings.
 * @param a First embedding.
 * @param b Second embedding.
 * @returns Cosine similarity score.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

// Pattern detectors
const patternDetectors: PatternDetector[] = [
  {
    name: "BullishEngulfing",
    bit: 1 << 0,
    confidence: 0.4,
    clusterType: ClusterType.BullishMomentum,
    detect: (current, prev) =>
      prev.close < prev.open && current.close > current.open && current.close > prev.open && current.open < prev.close,
  },
  {
    name: "Hammer",
    bit: 1 << 1,
    confidence: 0.3,
    clusterType: ClusterType.Reversal,
    detect: (current, _prev, _prev2, _next, metrics) =>
      metrics.range > 0 && metrics.range > 2 * metrics.body && metrics.lowerShadow / metrics.range > 0.6,
  },
  {
    name: "BullishKicker",
    bit: 1 << 2,
    confidence: 0.5,
    clusterType: ClusterType.BullishMomentum,
    detect: (current, prev) => prev.close < prev.open && current.open > prev.close && current.close > current.open,
  },
  {
    name: "BearishEngulfing",
    bit: 1 << 3,
    confidence: 0.4,
    clusterType: ClusterType.BearishMomentum,
    detect: (current, prev) =>
      prev.close > prev.open && current.close < current.open && current.open > prev.close && current.close < prev.open,
  },
];

// Structure detectors
const structureDetectors: StructureDetector[] = [
  {
    name: "SwingHighLow",
    detect: (candles, index, highs, lows, windowSize) => {
      const halfWindow = Math.floor(windowSize / 2);
      const sliceStart = Math.max(0, index - halfWindow);
      const sliceEnd = Math.min(candles.length, index + halfWindow + 1);
      const localHigh = Math.max(...highs.slice(sliceStart, sliceEnd));
      const localLow = Math.min(...lows.slice(sliceStart, sliceEnd));

      if (candles[index].high === localHigh) {
        return {
          index,
          type: StructureType.SwingHigh,
          strength: index > 5 && candles[index].high > candles[index - 5].high ? Strength.Major : Strength.Minor,
          zone: [localHigh * 0.995, localHigh * 1.005],
        };
      }
      if (candles[index].low === localLow) {
        return {
          index,
          type: StructureType.SwingLow,
          strength: index > 5 && candles[index].low < candles[index - 5].low ? Strength.Major : Strength.Minor,
          zone: [localLow * 0.995, localLow * 1.005],
        };
      }
      return null;
    },
  },
  {
    name: "HigherLower",
    detect: (candles, index, highs, _lows, windowSize) => {
      if (index < windowSize) return null;
      const prevHigh = Math.max(...highs.slice(index - windowSize, index));
      const prevLow = Math.min(...lows.slice(index - windowSize, index));
      if (candles[index].high > prevHigh) {
        return { index, type: StructureType.HigherHigh, strength: Strength.Major };
      }
      if (candles[index].low < prevLow) {
        return { index, type: StructureType.LowerLow, strength: Strength.Major };
      }
      return null;
    },
  },
];

// Embedding generator
const embeddingGenerator: EmbeddingGenerator = {
  name: "StatisticalEmbedding",
  generate: (candles, index, dimensions) => {
    const embedding = new Float32Array(dimensions);
    const window = 2;
    let idx = 0;

    for (let k = -window; k <= window && idx < dimensions; k++) {
      const c = candles[index + k];
      if (!c || !validateCandle(c)) continue;
      const metrics = computeCandleMetrics(c);
      if (!metrics || metrics.range === 0) continue;
      embedding[idx++] = metrics.body / metrics.range;
      if (idx < dimensions) embedding[idx++] = metrics.upperShadow / metrics.range;
      if (idx < dimensions) embedding[idx++] = metrics.lowerShadow / metrics.range;
    }

    return embedding;
};

// Reference embeddings for similarity classification
const referenceEmbeddings: { [key: string]: Float32Array } = {
  HighMomentumReversal: new Float32Array([0.2, 0.3, 0.5, 0.1, 0.2, 0.4]),
  Consolidation: new Float32Array([0.1, 0.2, 0.2, 0.1, 0.2, 0.2]),
};

/**
 * Computes advanced candlestick pattern analysis with clustering, structure detection, and embeddings.
 * @param candles Array of candlestick data.
 * @param config Optional configuration for pattern detection.
 * @returns PatternEngineNextGenResult with clusters, structures, and embeddings.
 * @throws Error if candles are invalid.
 */
export function computePatternEngineNextGen(
  candles: Candle[],
  config: PatternEngineConfig = {}
): PatternEngineNextGenResult {
  // Validate inputs
  if (!Array.isArray(candles) || candles.length < 7) {
    throw new Error('Invalid candles: must be an array with at least 7 candles');
  }
  if (!candles.every(validateCandle)) {
    throw new Error('Invalid candles: all candles must have finite open, close, high, and low');
  }

  const windowSize = config.windowSize ?? 5;
  const confidenceThreshold = config.confidenceThreshold ?? 0.3;
  const embeddingDimensions = config.embeddingDimensions ?? 6;

  const clusters: PatternCluster[] = [];
  const structures: StructurePoint[] = [];
  const embeddings: PatternEmbedding[] = [];

  // Cache highs and lows
  const highs = Float32Array.from(candles.map(c => c.high));
  const lows = Float32Array.from(candles.map(c => c.low));

  // Process candles
  for (let i = 3; i < candles.length - 3; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const prev2 = candles[i - 2];
    const next = candles[i + 1];

    // Compute metrics
    const metrics = computeCandleMetrics(current);
    if (!metrics || metrics.range === 0) continue;

    // Detect patterns
    let bitmask = 0;
    let confidence = 0;
    let clusterType: ClusterType = ClusterType.BullishMomentum;

    for (const detector of patternDetectors) {
      if (detector.detect(current, prev, prev2, next, metrics)) {
        bitmask |= detector.bit;
        confidence += detector.confidence;
        clusterType = detector.clusterType;
      }
    }

    if (bitmask !== 0 && confidence >= confidenceThreshold) {
      clusters.push({
        index: i,
        bitmask,
        confidenceScore: Math.min(confidence, 1.0),
        clusterType,
      });
    }

    // Detect structures
    for (const detector of structureDetectors) {
      const structure = detector.detect(candles, i, highs, lows, windowSize);
      if (structure) {
        structures.push(structure);
      }
    }

    // Generate embedding
    const embedding = embeddingGenerator.generate(candles, i, embeddingDimensions);
    let similarTo = "Unclassified";
    let maxSimilarity = -1;

    for (const [key, refEmb] of Object.entries(referenceEmbeddings)) {
      const similarity = cosineSimilarity(embedding, refEmb);
      if (similarity > maxSimilarity && similarity > 0.7) {
        maxSimilarity = similarity;
        similarTo = key;
      }
    }

    embeddings.push({ index: i, embedding, similarTo });
  }

  return { clusters, structures, embeddings };
}
```