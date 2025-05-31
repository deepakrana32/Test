import { TimeScaleEngine } from './TimeScaleEngine';
import { PriceScaleEngine } from './PriceScaleEngine';
import { IndicatorManager } from './IndicatorManager';

interface ChartStateData {
  visibleStart: number;
  visibleEnd: number;
  candleWidth: number;
  minPrice: number;
  maxPrice: number;
  indicators: string[];
}

export class ChartState {
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private indicatorManager: IndicatorManager;
  private listeners: ((state: ChartStateData) => void)[];

  constructor(timeScale: TimeScaleEngine, priceScale: PriceScaleEngine, indicatorManager: IndicatorManager) {
    if (!timeScale || !priceScale || !indicatorManager) throw new Error('Missing dependencies');
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.indicatorManager = indicatorManager;
    this.listeners = [];
    this.setupListeners();
  }

  private setupListeners() {
    this.timeScale.onChange(() => this.notifyListeners());
    this.priceScale.onChange(() => this.notifyListeners());
  }

  getState(): ChartStateData {
    const timeScaleResult = this.timeScale.computeTimeScale();
    const priceScaleResult = this.priceScale.computePriceScale();
    return {
      visibleStart: timeScaleResult?.visibleStart || 0,
      visibleEnd: timeScaleResult?.visibleEnd || 100,
      candleWidth: timeScaleResult?.candleWidth || 10,
      minPrice: priceScaleResult?.minPrice || 0,
      maxPrice: priceScaleResult?.maxPrice || 100,
      indicators: this.indicatorManager['activeIndicators'] || [],
    };
  }

  restoreState(state: ChartStateData) {
    this.timeScale.setOptions({ minCandleWidth: state.candleWidth / 2, maxCandleWidth: state.candleWidth * 2 });
    this.timeScale.scroll((state.visibleEnd - state.visibleStart) / 2 - state.visibleStart);
    this.priceScale.setOptions({ height: state.maxPrice - state.minPrice });
    state.indicators.forEach(id => this.indicatorManager.addIndicator(id));
    this.notifyListeners();
  }

  onStateChange(callback: (state: ChartStateData) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  destroy() {
    this.listeners = [];
  }
}
