import { Candle, Tick, Pattern } from './PatternTypes';
import { ChartRenderer } from './ChartRenderer';

export class PatternWorkerManager {
  private worker: Worker | null;
  private renderer: ChartRenderer;
  private patterns: Pattern[];
  private callbacks: ((patterns: Pattern[]) => void)[];

  constructor(renderer: ChartRenderer) {
    if (!renderer) throw new Error('Renderer missing');
    this.worker = new Worker(new URL('./pattern.worker.ts', import.meta.url));
    this.renderer = renderer;
    this.patterns = [];
    this.callbacks = [];
    this.setupWorker();
  }

  private setupWorker() {
    this.worker?.addEventListener('message', (event: MessageEvent) => {
      if (event.data.type === 'patterns') {
        this.patterns = event.data.patterns;
        this.renderer.setIndicator('patterns', new Float32Array(this.patterns.flatMap(p => p.points.flatMap(pt => [pt.index, pt.price]))));
        this.callbacks.forEach(cb => cb(this.patterns));
      }
    });
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.worker?.postMessage({
      type: 'setData',
      candles: candles || undefined,
      ticks: ticks || undefined,
    });
  }

  onPatterns(callback: (patterns: Pattern[]) => void) {
    this.callbacks.push(callback);
  }

  getPatterns(): Pattern[] {
    return this.patterns;
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.patterns = [];
    this.callbacks = [];
  }
}
