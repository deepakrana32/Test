import { Candle, Tick } from './PatternTypes';

interface DataManagerOptions {
  streamUrl?: string;
  candleInterval?: number; // ms
}

export class DataManager {
  private candles: Candle[];
  private ticks: Tick[];
  private stream: WebSocket | null;
  private options: DataManagerOptions;
  private listeners: ((candles: Candle[], ticks: Tick[]) => void)[];
  private candleInterval: number;

  constructor(options: Partial<DataManagerOptions> = {}) {
    this.candles = [];
    this.ticks = [];
    this.stream = null;
    this.options = {
      streamUrl: 'wss://data.example.com',
      candleInterval: 60_000, // 1 minute
      ...options,
    };
    this.listeners = [];
    this.candleInterval = this.options.candleInterval;
    this.setupStreaming();
  }

  private setupStreaming() {
    if (this.options.streamUrl) {
      this.stream = new WebSocket(this.options.streamUrl);
      this.stream.onmessage = (event) => {
        const tick: Tick = JSON.parse(event.data);
        this.addTick(tick);
      };
      this.stream.onerror = () => console.error('WebSocket error');
    }
  }

  addTick(tick: Tick) {
    if (!tick.price || !tick.time || !tick.volume) return;
    this.ticks.push(tick);
    if (this.ticks.length > 1_000_000) this.ticks.shift(); // Limit to 1M ticks

    // Update candles
    const lastCandle = this.candles[this.candles.length - 1];
    const timeBucket = Math.floor(tick.time / this.candleInterval) * this.candleInterval;
    if (!lastCandle || lastCandle.time < timeBucket) {
      this.candles.push({
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        time: timeBucket,
        volume: tick.volume,
      });
    } else {
      lastCandle.high = Math.max(lastCandle.high, tick.price);
      lastCandle.low = Math.min(lastCandle.low, tick.price);
      lastCandle.close = tick.price;
      lastCandle.volume = (lastCandle.volume || 0) + tick.volume;
    }

    if (this.candles.length > 10_000) this.candles.shift(); // Limit to 10K candles
    this.notifyListeners();
  }

  setData(candles: Candle[], ticks: Tick[] = []) {
    this.candles = candles.filter(c => c.open && c.high && c.low && c.close && c.time);
    this.ticks = ticks.filter(t => t.price && t.time && t.volume);
    this.notifyListeners();
  }

  onData(callback: (candles: Candle[], ticks: Tick[]) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.candles, this.ticks));
  }

  getCandles(): Candle[] {
    return this.candles;
  }

  getTicks(): Tick[] {
    return this.ticks;
  }

  destroy() {
    this.stream?.close();
    this.stream = null;
    this.candles = [];
    this.ticks = [];
    this.listeners = [];
  }
}
