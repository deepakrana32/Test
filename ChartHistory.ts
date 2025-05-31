import { Candle, Tick } from './PatternTypes';
import { DataValidator } from './DataValidator';
import { ErrorHandler } from './ErrorHandler';

interface HistoryOptions {
  apiUrl?: string;
  cacheSize?: number;
}

export class ChartHistory {
  private validator: DataValidator;
  private errorHandler: ErrorHandler;
  private candles: Candle[];
  private ticks: Tick[];
  private cache: Map<string, { candles: Candle[]; ticks: Tick[] }>;
  private options: HistoryOptions;
  private listeners: ((candles: Candle[], ticks: Tick[]) => void)[];

  constructor(validator: DataValidator, errorHandler: ErrorHandler, options: Partial<HistoryOptions> = {}) {
    if (!validator || !errorHandler) throw new Error('Missing dependencies');
    this.validator = validator;
    this.errorHandler = errorHandler;
    this.candles = [];
    this.ticks = [];
    this.cache = new Map();
    this.options = {
      apiUrl: 'https://api.example.com/history',
      cacheSize: 100,
      ...options,
    };
    this.listeners = [];
  }

  async loadHistory(symbol: string, startTime: number, endTime: number) {
    const cacheKey = `${symbol}_${startTime}_${endTime}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      this.candles = cached.candles;
      this.ticks = cached.ticks;
      this.notifyListeners();
      return;
    }

    try {
      const response = await fetch(`${this.options.apiUrl}?symbol=${symbol}&start=${startTime}&end=${endTime}`);
      const data = await response.json();
      const candles = this.validator.validateCandles(data.candles || []);
      const ticks = this.validator.validateTicks(data.ticks || []);
      this.candles = candles;
      this.ticks = ticks;
      this.cache.set(cacheKey, { candles, ticks });
      if (this.cache.size > this.options.cacheSize!) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
      this.notifyListeners();
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  getCandles(): Candle[] {
    return this.candles;
  }

  getTicks(): Tick[] {
    return this.ticks;
  }

  onData(callback: (candles: Candle[], ticks: Tick[]) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.candles, this.ticks));
  }

  destroy() {
    this.candles = [];
    this.ticks = [];
    this.cache.clear();
    this.listeners = [];
  }
}
