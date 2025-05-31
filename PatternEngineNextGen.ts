import { Candle, Tick, Pattern } from './PatternTypes';
import { ChartRenderer } from './ChartRenderer';
import { CrosshairManager } from './CrosshairManager';

class DataStream {
  private listeners: ((tick: Tick) => void)[];
  private socket: WebSocket | null;

  constructor(url: string) {
    this.listeners = [];
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const tick: Tick = JSON.parse(event.data);
      this.listeners.forEach(listener => listener(tick));
    };
  }

  onTick(callback: (tick: Tick) => void) {
    this.listeners.push(callback);
  }

  destroy() {
    this.socket?.close();
    this.listeners = [];
  }
}

export class PatternEngineNextGen {
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private patterns: Pattern[];
  private renderer: ChartRenderer;
  private crosshairManager: CrosshairManager;
  private stream: DataStream | null;
  private modelWeights: Float32Array; // Simplified ML model

  constructor(renderer: ChartRenderer, crosshairManager: CrosshairManager, streamUrl: string = 'wss://data.example.com') {
    if (!renderer || !crosshairManager) throw new Error('Renderer or crosshair manager missing');
    this.candles = null;
    this.ticks = null;
    this.patterns = [];
    this.renderer = renderer;
    this.crosshairManager = crosshairManager;
    this.stream = new DataStream(streamUrl);
    this.modelWeights = new Float32Array(10).fill(0.1); // Dummy weights
    this.setupEventListeners();
    this.setupStreaming();
  }

  private setupEventListeners() {
    this.crosshairManager.on('crosshair', () => this.renderer.requestRender());
  }

  private setupStreaming() {
    this.stream?.onTick((tick) => {
      if (!this.ticks) this.ticks = [];
      this.ticks.push(tick);
      if (this.ticks.length > 1_000_000) this.ticks.shift(); // Limit to 1M ticks
      this.computePatterns();
    });
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
    this.computePatterns();
  }

  private computePatterns() {
    this.patterns = [];
    const data = this.candles || this.ticks?.map(t => ({
      open: t.price,
      high: t.price,
      low: t.price,
      close: t.price,
      time: t.time,
      volume: t.volume,
    })) || [];

    if (data.length < 5) return;

    // ML-based prediction (simplified linear regression)
    this.predictPatterns(data);

    // Standard Elliott Wave, Gartley, BPM
    this.detectElliottWave(data);
    this.detectGartley(data);
    this.detectBPM(data);

    this.renderer.setIndicator('patterns', new Float32Array(this.patterns.flatMap(p => p.points.flatMap(pt => [pt.index, pt.price]))));
  }

  private predictPatterns(data: any[]) {
    // Simplified ML: Predict next price movement
    for (let i = data.length - 10; i < data.length; i++) {
      const input = new Float32Array(data.slice(i - 10, i).map(d => d.close));
      let prediction = 0;
      for (let j = 0; j < input.length; j++) {
        prediction += input[j] * this.modelWeights[j];
      }
      if (prediction > data[i - 1].close * 1.01) {
        this.patterns.push({
          type: 'predicted_bullish',
          points: [{ index: i, price: data[i - 1].close }, { index: i + 1, price: prediction }],
        });
      }
    }
  }

  private detectElliottWave(data: any[]) {
    for (let i = 4; i < data.length - 3; i++) {
      if (
        data[i - 4].close < data[i - 3].close &&
        data[i - 3].close > data[i - 2].close &&
        data[i - 2].close < data[i - 1].close &&
        data[i - 1].close > data[i].close &&
        data[i].close < data[i + 1].close
      ) {
        this.patterns.push({
          type: 'elliott_wave',
          points: [i - 4, i - 3, i - 2, i - 1, i, i + 1].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  private detectGartley(data: any[]) {
    for (let i = 4; i < data.length; i++) {
      const xa = data[i - 4].close;
      const ab = data[i - 3].close;
      const bc = data[i - 2].close;
      const cd = data[i - 1].close;
      const xd = data[i].close;
      const abRet = Math.abs(ab - xa) * 0.618;
      const bcRet = Math.abs(bc - ab) * 0.382;
      const cdRet = Math.abs(cd - bc) * 1.272;
      if (
        Math.abs(ab - xa - abRet) < 0.1 &&
        Math.abs(bc - ab - bcRet) < 0.1 &&
        Math.abs(xd - cd - cdRet) < 0.1
      ) {
        this.patterns.push({
          type: 'gartley',
          points: [i - 4, i - 3, i - 2, i - 1, i].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  private detectBPM(data: any[]) {
    for (let i = 4; i < data.length; i++) {
      const xa = data[i - 4].close;
      const ab = data[i - 3].close;
      const bc = data[i - 2].close;
      const cd = data[i - 1].close;
      const xd = data[i].close;
      const abRet = Math.abs(ab - xa) * 0.786;
      const bcRet = Math.abs(bc - ab) * 0.618;
      const cdRet = Math.abs(cd - bc) * 1.618;
      if (
        Math.abs(ab - xa - abRet) < 0.1 &&
        Math.abs(bc - ab - bcRet) < 0.1 &&
        Math.abs(xd - cd - cdRet) < 0.1
      ) {
        this.patterns.push({
          type: 'bpm',
          points: [i - 4, i - 3, i - 2, i - 1, i].map(idx => ({
            index: idx,
            price: data[idx].close,
          })),
        });
      }
    }
  }

  getPatterns(): Pattern[] {
    return this.patterns;
  }

  destroy() {
    this.candles = null;
    this.ticks = null;
    this.patterns = [];
    this.stream?.destroy();
    this.stream = null;
    this.modelWeights = new Float32Array(0);
  }
}
