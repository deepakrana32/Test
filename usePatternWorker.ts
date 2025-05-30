```typescript
// usePatternWorker.ts
// React hook for managing communication with pattern.worker.ts

import { useState, useEffect, useRef } from 'react';
import { Candle } from '@/types/Candle';
import { PatternResult, validatePatternResult } from '@/types/PatternTypes';

// Interface for worker configuration
interface WorkerConfig {
  enableCandlestick: boolean;
  enableStructure: boolean;
  maxPatternLookback: number;
  batchSize?: number; // Number of candles to process per batch (default: 1000)
}

// Interface for worker response
interface WorkerResponse {
  type: 'success' | 'error';
  data?: PatternResult[];
  error?: string;
}

/**
 * Hook to manage communication with pattern.worker.ts.
 * @param candles Array of candlestick data.
 * @param config Worker configuration.
 * @returns Pattern detection results.
 */
export function usePatternWorker(candles: Candle[], config: WorkerConfig): PatternResult[] {
  const [results, setResults] = useState<PatternResult[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Validate inputs
    if (!candles.length || !candles.every(c =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume) &&
      c.high >= c.low
    )) {
      console.error('Invalid candles: must be non-empty with valid properties');
      return;
    }

    // Create worker
    workerRef.current = new Worker(new URL('./pattern.worker.ts', import.meta.url), { type: 'module' });

    // Handle messages
    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'success' && event.data.data) {
        const validResults = event.data.data.filter(result => validatePatternResult(result));
        setResults(validResults);
        if (event.data.data.length !== validResults.length) {
          console.warn('Some PatternResult objects were invalid and filtered out');
        }
      } else if (event.data.type === 'error') {
        console.error(`Pattern worker error: ${event.data.error}`);
      }
    };

    // Handle errors
    workerRef.current.onerror = (error: ErrorEvent) => {
      console.error(`Pattern worker error: ${error.message}`);
    };

    // Send data to worker
    workerRef.current.postMessage({
      command: 'detectPatterns',
      candles,
      config,
    });

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [candles, config]);

  return results;
}
```