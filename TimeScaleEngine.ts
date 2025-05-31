import { TimeScaleOptions, TimeScaleResult, TimeScaleTick } from './ChartTypes';
import { KineticAnimation } from './KineticAnimation';
import { debounce } from 'lodash';

export class TimeScaleEngine {
  private times: number[];
  private options: TimeScaleOptions;
  private visibleStart: number;
  private visibleEnd: number;
  private candleWidth: number;
  private kineticAnimation: KineticAnimation;
  private listeners: (() => void)[];
  private linkedEngines: TimeScaleEngine[];

  constructor(options: Partial<TimeScaleOptions> = {}) {
    this.times = [];
    this.options = {
      minCandleWidth: 2,
      maxCandleWidth: 20,
      timezone: 'UTC',
      locale: 'en-US',
      optimalHeight: 40,
      ...options,
    };
    this.visibleStart = 0;
    this.visibleEnd = 100;
    this.candleWidth = 10;
    this.kineticAnimation = new KineticAnimation((dx) => this.scroll(dx));
    this.listeners = [];
    this.linkedEngines = [];
    this.setupZoomHandler();
  }

  private setupZoomHandler() {
    this.zoomAt = debounce(this.zoomAt.bind(this), 16); // ~60 FPS
  }

  setData(times: number[]) {
    this.times = times.filter(t => Number.isFinite(t)).sort((a, b) => a - b);
    if (this.times.length === 0) return;
    this.visibleStart = Math.max(0, this.times.length - 100);
    this.visibleEnd = this.times.length;
    this.adjustCandleWidth();
    this.notifyListeners();
  }

  setOptions(options: Partial<TimeScaleOptions>) {
    this.options = { ...this.options, ...options };
    this.adjustCandleWidth();
    this.notifyListeners();
  }

  scroll(dx: number) {
    const deltaIndex = dx / this.candleWidth;
    this.visibleStart = Math.max(0, Math.min(this.times.length - (this.visibleEnd - this.visibleStart), this.visibleStart - deltaIndex));
    this.visibleEnd = this.visibleStart + (this.visibleEnd - this.visibleStart);
    this.notifyListeners();
    this.linkedEngines.forEach(engine => {
      engine.scroll(dx);
    });
  }

  zoomAt(x: number, delta: number) {
    this.candleWidth *= delta;
    this.candleWidth = Math.max(this.options.minCandleWidth, Math.min(this.options.maxCandleWidth, this.candleWidth));
    const index = this.unscaleX(x);
    const visibleCount = this.visibleEnd - this.visibleStart;
    const newCount = visibleCount / delta;
    this.visibleStart = index - (x / this.candleWidth) * newCount;
    this.visibleEnd = this.visibleStart + newCount;
    this.visibleStart = Math.max(0, Math.min(this.times.length - newCount, this.visibleStart));
    this.visibleEnd = this.visibleStart + newCount;
    this.notifyListeners();
    this.linkedEngines.forEach(engine => {
      engine.zoomAt(x, delta);
    });
  }

  link(engine: TimeScaleEngine) {
    if (!this.linkedEngines.includes(engine)) {
      this.linkedEngines.push(engine);
      engine.link(this); // Bidirectional sync
    }
  }

  computeTimeScale(): TimeScaleResult | null {
    if (this.times.length === 0) return null;

    const visibleCount = this.visibleEnd - this.visibleStart;
    if (visibleCount <= 0) return null;

    const ticks: TimeScaleTick[] = [];
    const tickInterval = this.calculateTickInterval(visibleCount);
    let currentIndex = Math.floor(this.visibleStart / tickInterval) * tickInterval;

    while (currentIndex <= this.visibleEnd) {
      if (currentIndex >= 0 && currentIndex < this.times.length) {
        const time = this.times[Math.floor(currentIndex)];
        const x = this.scaleX(currentIndex);
        ticks.push({
          time,
          x,
          label: new Date(time).toLocaleTimeString(this.options.locale, { timeZone: this.options.timezone }),
        });
      }
      currentIndex += tickInterval;
    }

    return {
      visibleStart: this.visibleStart,
      visibleEnd: this.visibleEnd,
      candleWidth: this.candleWidth,
      ticks,
      scaleX: (index: number) => (index - this.visibleStart) * this.candleWidth,
      unscaleX: (x: number) => x / this.candleWidth + this.visibleStart,
    };
  }

  private calculateTickInterval(visibleCount: number): number {
    const idealTickCount = Math.max(5, Math.min(10, Math.floor(visibleCount / 10)));
    return Math.max(1, Math.floor(visibleCount / idealTickCount));
  }

  private adjustCandleWidth() {
    const visibleCount = this.visibleEnd - this.visibleStart;
    if (visibleCount > 0) {
      this.candleWidth = Math.max(
        this.options.minCandleWidth,
        Math.min(this.options.maxCandleWidth, 800 / visibleCount)
      );
    }
  }

  timeToIndex(time: number): number {
    return this.times.findIndex(t => t >= time) || this.times.length - 1;
  }

  onChange(callback: () => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb());
  }

  destroy() {
    this.times = [];
    this.listeners = [];
    this.linkedEngines = [];
    this.kineticAnimation.destroy();
  }
}
