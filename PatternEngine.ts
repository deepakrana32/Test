import { Candle, Tick, Pattern } from './PatternTypes';
import { ChartRenderer } from './ChartRenderer';
import { CrosshairManager } from './CrosshairManager';

export class PatternEngine {
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private patterns: Pattern[];
  private cache: Map<string, Pattern[]>;
  private renderer: ChartRenderer;
  private crosshairManager: CrosshairManager;

  constructor(renderer: ChartRenderer, crosshairManager: CrosshairManager) {
    if (!renderer || !crosshairManager) throw new Error('Renderer or crosshair manager missing');
    this.candles = null;
    this.ticks = null;
    this.patterns = [];
    this.cache = new Map();
    this.renderer = renderer;
    this.crosshairManager = crosshairManager;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.crosshairManager.on('crosshair', () => this.renderer.requestRender());
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

    // Elliott Wave (5-3 structure)
    this.detectElliottWave(data);

    // Gartley Pattern
    this.detectGartley(data);

    // BPM Pattern
    this.detectBPM(data);

    this.cache.set('patterns', this.patterns);
  }

  private detectElliottWave(data: any[]) {
    for (let i = 4; i < data.length - 3; i++) {
      const wave1 = data[i - 4].close < data[i - 3].close;
      const wave2 = data[i - 3].close > data[i - 2].close;
      const wave3 = data[i - 2].close < data[i - 1].close;
      const wave4 = data[i - 1].close > data[i].close;
      const wave5 = data[i].close < data[i + 1].close;
      if (wave1 && wave2 && wave3 && wave4 && wave5) {
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
    this.cache.clear();
  }
}
