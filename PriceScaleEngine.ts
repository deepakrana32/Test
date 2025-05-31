import { PriceScaleOptions, PriceScaleResult, PriceScaleTick } from './ChartTypes';
import { debounce } from 'lodash';

export class PriceScaleEngine {
  private prices: number[];
  private options: PriceScaleOptions;
  private minPrice: number;
  private maxPrice: number;
  private scaleFactor: number;
  private listeners: (() => void)[];

  constructor(options: Partial<PriceScaleOptions> = {}) {
    this.prices = [];
    this.options = {
      height: 400,
      minRangeMargin: 0.1,
      pixelPerTick: 50,
      minTicks: 5,
      maxTicks: 10,
      inverted: false,
      logarithmic: false,
      locale: 'en-US',
      optimalWidth: 80,
      ...options,
    };
    this.minPrice = 0;
    this.maxPrice = 0;
    this.scaleFactor = 1;
    this.listeners = [];
    this.setupZoomHandler();
  }

  private setupZoomHandler() {
    this.zoomAt = debounce(this.zoomAt.bind(this), 16); // ~60 FPS
  }

  setData(prices: number[]) {
    this.prices = prices.filter(p => Number.isFinite(p));
    if (this.prices.length === 0) return;
    this.minPrice = Math.min(...this.prices);
    this.maxPrice = Math.max(...this.prices);
    this.notifyListeners();
  }

  setOptions(options: Partial<PriceScaleOptions>) {
    this.options = { ...this.options, ...options };
    this.notifyListeners();
  }

  zoomAt(y: number, delta: number) {
    this.scaleFactor *= delta;
    this.scaleFactor = Math.max(0.1, Math.min(10, this.scaleFactor));
    const price = this.unscaleY(y);
    const range = this.maxPrice - this.minPrice;
    const newRange = range / delta;
    this.minPrice = price - (y / this.options.height) * newRange;
    this.maxPrice = this.minPrice + newRange;
    this.notifyListeners();
  }

  computePriceScale(): PriceScaleResult | null {
    if (this.prices.length === 0) return null;

    const range = this.maxPrice - this.minPrice;
    if (range <= 0) return null;

    const margin = range * this.options.minRangeMargin;
    let min = this.minPrice - margin;
    let max = this.maxPrice + margin;

    if (this.options.logarithmic) {
      min = Math.log10(Math.max(1e-10, min));
      max = Math.log10(Math.max(1e-10, max));
    }

    const tickSpacing = this.calculateTickSpacing(max - min);
    const ticks: PriceScaleTick[] = [];
    let currentTick = Math.floor(min / tickSpacing) * tickSpacing;

    while (currentTick <= max) {
      let price = this.options.logarithmic ? Math.pow(10, currentTick) : currentTick;
      const y = this.scaleY(price);
      if (y >= 0 && y <= this.options.height) {
        ticks.push({
          price,
          y,
          label: price.toLocaleString(this.options.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        });
      }
      currentTick += tickSpacing;
    }

    return {
      minPrice: min,
      maxPrice: max,
      ticks,
      scaleY: (price: number) => {
        if (this.options.logarithmic) price = Math.log10(Math.max(1e-10, price));
        const normalized = (price - min) / (max - min);
        return this.options.inverted
          ? normalized * this.options.height
          : (1 - normalized) * this.options.height;
      },
      unscaleY: (y: number) => {
        const normalized = this.options.inverted
          ? y / this.options.height
          : 1 - y / this.options.height;
        let price = normalized * (max - min) + min;
        return this.options.logarithmic ? Math.pow(10, price) : price;
      },
    };
  }

  private calculateTickSpacing(range: number): number {
    const idealTickCount = Math.max(
      this.options.minTicks,
      Math.min(this.options.maxTicks, Math.floor(this.options.height / this.options.pixelPerTick))
    );
    const rawSpacing = range / idealTickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)));
    const normalized = rawSpacing / magnitude;
    const steps = [1, 2, 5, 10];
    const closestStep = steps.reduce((prev, curr) =>
      Math.abs(curr - normalized) < Math.abs(prev - normalized) ? curr : prev
    );
    return closestStep * magnitude;
  }

  onChange(callback: () => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb());
  }

  destroy() {
    this.prices = [];
    this.listeners = [];
  }
}
