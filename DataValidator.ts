import { Candle, Tick } from './PatternTypes';
import { ErrorHandler } from './ErrorHandler';

export class DataValidator {
  private errorHandler: ErrorHandler;

  constructor(errorHandler: ErrorHandler) {
    if (!errorHandler) throw new Error('ErrorHandler missing');
    this.errorHandler = errorHandler;
  }

  validateCandles(candles: Candle[]): Candle[] {
    const validCandles: Candle[] = [];
    let lastTime = 0;

    candles.forEach((candle, index) => {
      try {
        if (!candle.open || !candle.high || !candle.low || !candle.close || !candle.time) {
          throw new Error(`Invalid candle at index ${index}: missing required fields`);
        }
        if (candle.high < candle.low || candle.open < 0 || candle.close < 0) {
          throw new Error(`Invalid candle at index ${index}: invalid price values`);
        }
        if (candle.time <= lastTime) {
          throw new Error(`Invalid candle at index ${index}: non-chronological time`);
        }
        lastTime = candle.time;
        validCandles.push(candle);
      } catch (error) {
        this.errorHandler.handleError(error as Error);
      }
    });

    return validCandles;
  }

  validateTicks(ticks: Tick[]): Tick[] {
    const validTicks: Tick[] = [];
    let lastTime = 0;

    ticks.forEach((tick, index) => {
      try {
        if (!tick.price || !tick.time || !tick.volume) {
          throw new Error(`Invalid tick at index ${index}: missing required fields`);
        }
        if (tick.price < 0 || tick.volume < 0) {
          throw new Error(`Invalid tick at index ${index}: negative values`);
        }
        if (tick.time <= lastTime) {
          throw new Error(`Invalid tick at index ${index}: non-chronological time`);
        }
        lastTime = tick.time;
        validTicks.push(tick);
      } catch (error) {
        this.errorHandler.handleError(error as Error);
      }
    });

    return validTicks;
  }
}
