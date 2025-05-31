// Candle.ts
// Type definition for candlestick data

/**
 * Represents a single candlestick in a financial chart, containing OHLCV (Open, High, Low, Close, Volume) data and a timestamp.
 * @interface
 */
export interface Candle {
  /**
   * Opening price of the candlestick (must be positive).
   */
  open: number;

  /**
   * Highest price during the candlestick period (must be positive and ≥ low).
   */
  high: number;

  /**
   * Lowest price during the candlestick period (must be positive and ≤ high).
   */
  low: number;

  /**
   * Closing price of the candlestick (must be positive and between low and high).
   */
  close: number;

  /**
   * Trading volume during the candlestick period (must be positive).
   */
  volume: number;

  /**
   * Unix timestamp in milliseconds indicating the start of the candlestick period (must be positive).
   */
  time: number;

  /**
   * Optional asset symbol (e.g., "BTCUSD").
   */
  symbol?: string;

  /**
   * Optional timeframe of the candlestick (e.g., "1m", "1h", "1d").
   */
  timeframe?: string;

  /**
   * Optional flag indicating if the candlestick is finalized (for real-time data).
   */
  isFinal?: boolean;
}
