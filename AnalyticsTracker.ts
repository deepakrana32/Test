import { PerformanceMonitor } from './PerformanceMonitor';
import { ErrorHandler } from './ErrorHandler';

interface Metric {
  id: string;
  type: 'interaction' | 'render' | 'error';
  timestamp: number;
  value: number | string;
}

export class AnalyticsTracker {
  private performanceMonitor: PerformanceMonitor;
  private errorHandler: ErrorHandler;
  private metrics: Metric[];
  private listeners: ((metric: Metric) => void)[];

  constructor(performanceMonitor: PerformanceMonitor, errorHandler: ErrorHandler) {
    if (!performanceMonitor || !errorHandler) throw new Error('Missing dependencies');
    this.performanceMonitor = performanceMonitor;
    this.errorHandler = errorHandler;
    this.metrics = [];
    this.listeners = [];
    this.setupTracking();
  }

  private setupTracking() {
    this.performanceMonitor.onPerformanceUpdate((fps, memory) => {
      this.trackMetric({ id: `fps_${Date.now()}`, type: 'render', timestamp: Date.now(), value: fps });
      this.trackMetric({ id: `memory_${Date.now()}`, type: 'render', timestamp: Date.now(), value: memory });
    });
    this.errorHandler.onError((error) => {
      this.trackMetric({ id: error.id, type: 'error', timestamp: error.timestamp, value: error.message });
    });
  }

  trackInteraction(type: string) {
    this.trackMetric({ id: `${type}_${Date.now()}`, type: 'interaction', timestamp: Date.now(), value: type });
  }

  private trackMetric(metric: Metric) {
    this.metrics.push(metric);
    if (this.metrics.length > 1000) this.metrics.shift();
    this.notifyListeners(metric);
  }

  getMetrics(): Metric[] {
    return this.metrics;
  }

  onMetric(callback: (metric: Metric) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(metric: Metric) {
    this.listeners.forEach(cb => cb(metric));
  }

  destroy() {
    this.metrics = [];
    this.listeners = [];
  }
}
