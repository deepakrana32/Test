```typescript
// TimeScaleEngine.ts
// Computes time axis scaling and handles zoom/scroll interactions for financial charts

import { TimeScaleOptions, TimeScaleResult, TimeScaleTick } from '@/types/ChartTypes';

/**
 * Default time scale options.
 */
const DEFAULT_OPTS: Partial<TimeScaleOptions> = {
  minCandleWidth: 2,
  maxCandleWidth: 40,
};

/**
 * Formats a time tick label based on a Unix timestamp.
 * @param time Unix timestamp in milliseconds.
 * @param index Candle index.
 * @param total Total number of candles.
 * @returns Formatted time label.
 */
function formatTimeTick(time: number, index: number, total: number): string {
  const date = new Date(time);
  if (total > 1000) return date.toLocaleDateString(); // Daily for large datasets
  if (total > 100) return `${date.getHours()}:00`; // Hourly
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Minute
}

/**
 * Computes time axis scaling based on scroll and zoom.
 * @param scrollOffset Scroll offset in candle indices.
 * @param zoomFactor Zoom factor for candle width.
 * @param opts Time scale options.
 * @param times Array of candle timestamps (optional for accurate tick labels).
 * @returns Time scale result with ticks and scaling functions.
 */
export function computeTimeScale(
  scrollOffset: number,
  zoomFactor: number,
  opts: TimeScaleOptions,
  times: number[] = []
): TimeScaleResult {
  const config: TimeScaleOptions = { ...DEFAULT_OPTS, ...opts };

  // Validate inputs
  if (
    !Number.isFinite(config.width) ||
    config.width <= 0 ||
    !Number.isFinite(config.candleWidth) ||
    config.candleWidth <= 0 ||
    !Number.isFinite(config.totalCandles) ||
    config.totalCandles < 0 ||
    !Number.isFinite(scrollOffset) ||
    !Number.isFinite(zoomFactor) ||
    zoomFactor <= 0
  ) {
    return {
      startIndex: 0,
      endIndex: 0,
      candleWidth: config.candleWidth,
      scaleX: () => 0,
      unscaleX: () => 0,
      ticks: [],
    };
  }

  const scaledCandleWidth = Math.min(
    config.maxCandleWidth,
    Math.max(config.minCandleWidth, config.candleWidth * zoomFactor)
  );

  const visibleCount = Math.floor(config.width / scaledCandleWidth);
  const startIndex = Math.max(0, Math.floor(scrollOffset));
  const endIndex = Math.min(startIndex + visibleCount, config.totalCandles);

  const scaleX = (i: number) => (i - startIndex) * scaledCandleWidth;
  const unscaleX = (x: number) => x / scaledCandleWidth + startIndex;

  // Tick generation
  const tickEvery = Math.max(1, Math.ceil(60 / (scaledCandleWidth + 0.1)));
  const ticks: TimeScaleTick[] = [];
  for (let i = startIndex; i <= endIndex; i += tickEvery) {
    const time = times[i] ?? i * 1000; // Fallback to index-based time
    ticks.push({
      x: scaleX(i),
      label: config.formatTimeLabel
        ? config.formatTimeLabel(time, i, config.totalCandles)
        : formatTimeTick(time, i, config.totalCandles),
    });
  }

  return {
    startIndex,
    endIndex,
    candleWidth: scaledCandleWidth,
    scaleX,
    unscaleX,
    ticks,
  };
}

/**
 * Controller for managing time axis zoom and scroll.
 */
export class TimeZoomController {
  private zoomFactor = 1;
  private scrollOffset = 0;

  constructor(private opts: TimeScaleOptions) {
    // Validate options
    if (
      !Number.isFinite(opts.width) ||
      opts.width <= 0 ||
      !Number.isFinite(opts.candleWidth) ||
      opts.candleWidth <= 0 ||
      !Number.isFinite(opts.totalCandles) ||
      opts.totalCandles < 0 ||
      !Number.isFinite(opts.minCandleWidth) ||
      !Number.isFinite(opts.maxCandleWidth)
    ) {
      throw new Error('Invalid TimeScaleOptions');
    }
  }

  /**
   * Zooms in at the specified x-coordinate.
   * @param centerX X-coordinate of zoom center.
   */
  zoomIn(centerX: number): void {
    this.zoom(centerX, 1.15);
  }

  /**
   * Zooms out at the specified x-coordinate.
   * @param centerX X-coordinate of zoom center.
   */
  zoomOut(centerX: number): void {
    this.zoom(centerX, 0.85);
  }

  /**
   * Zooms by a factor at the specified x-coordinate.
   * @param centerX X-coordinate of zoom center.
   * @param factor Zoom factor (e.g., 1.15 for zoom in, 0.85 for zoom out).
   */
  zoom(centerX: number, factor: number): void {
    if (!Number.isFinite(centerX) || !Number.isFinite(factor) || factor <= 0) {
      return;
    }

    const oldCandleWidth = this.opts.candleWidth * this.zoomFactor;
    const indexAtCursor = this.scrollOffset + centerX / oldCandleWidth;
    this.zoomFactor *= factor;
    this.zoomFactor = Math.max(
      this.opts.minCandleWidth / this.opts.candleWidth,
      Math.min(this.zoomFactor, this.opts.maxCandleWidth / this.opts.candleWidth)
    );

    const newCandleWidth = this.opts.candleWidth * this.zoomFactor;
    this.scrollOffset = indexAtCursor - centerX / newCandleWidth;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.opts.totalCandles));
  }

  /**
   * Scrolls the time axis by a delta in candle indices.
   * @param delta Scroll delta in candle indices.
   */
  scroll(delta: number): void {
    if (!Number.isFinite(delta)) return;
    this.scrollOffset += delta;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.opts.totalCandles));
  }

  /**
   * Computes the current time scale.
   * @param times Array of candle timestamps (optional).
   * @returns Time scale result.
   */
  compute(times: number[] = []): TimeScaleResult {
    return computeTimeScale(this.scrollOffset, this.zoomFactor, this.opts, times);
  }
}
```