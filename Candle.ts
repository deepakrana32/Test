```typescript
// Candle.ts
// Type definition for candlestick data

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number; // Unix timestamp in milliseconds
}
```