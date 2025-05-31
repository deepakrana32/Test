import { Candle, Tick, Series, PriceScaleResult, TimeScaleResult, DrawingTool } from './ChartTypes';
import { LabelsImageCache } from './LabelsImageCache';

export class Chart2DCanvasFallback {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private labelCache: LabelsImageCache;
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private drawingTools: DrawingTool[];
  private indicators: Map<string, Float32Array>;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ) {
    if (!canvas || !ctx) throw new Error('Canvas or context missing');
    this.canvas = canvas;
    this.ctx = ctx;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = canvas.width;
    this.offscreenCanvas.height = canvas.height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
    this.labelCache = new LabelsImageCache();
    this.candles = null;
    this.ticks = null;
    this.drawingTools = [];
    this.indicators = new Map();
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
  }

  setDrawingTools(tools: DrawingTool[]) {
    this.drawingTools = tools;
  }

  setIndicator(id: string, data: Float32Array) {
    this.indicators.set(id, data);
  }

  renderSeries(series: Series, priceScale: PriceScaleResult, timeScale: TimeScaleResult) {
    this.offscreenCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.offscreenCtx.save();
    this.offscreenCtx.scale(devicePixelRatio, devicePixelRatio);

    if (series.type === 'candle' && this.candles) {
      this.candles.forEach((candle, i) => {
        const x = timeScale.scaleX(i);
        const openY = priceScale.scaleY(candle.open);
        const closeY = priceScale.scaleY(candle.close);
        const highY = priceScale.scaleY(candle.high);
        const lowY = priceScale.scaleY(candle.low);
        const width = timeScale.candleWidth / 2;

        this.offscreenCtx.strokeStyle = candle.open <= candle.close ? '#00ff00' : '#ff0000';
        this.offscreenCtx.lineWidth = 1;

        // Wick
        this.offscreenCtx.beginPath();
        this.offscreenCtx.moveTo(x, highY);
        this.offscreenCtx.lineTo(x, lowY);
        this.offscreenCtx.stroke();

        // Body
        this.offscreenCtx.fillStyle = candle.open <= candle.close ? '#00ff00' : '#ff0000';
        this.offscreenCtx.fillRect(x - width / 2, Math.min(openY, closeY), width, Math.abs(openY - closeY));
      });
    } else if (this.ticks) {
      // Render ticks as line
      this.offscreenCtx.beginPath();
      this.offscreenCtx.strokeStyle = series.options.color || '#0000ff';
      this.offscreenCtx.lineWidth = series.options.lineWidth || 1;
      this.ticks.forEach((tick, i) => {
        const x = timeScale.scaleX(i);
        const y = priceScale.scaleY(tick.price);
        if (i === 0) this.offscreenCtx.moveTo(x, y);
        else this.offscreenCtx.lineTo(x, y);
      });
      this.offscreenCtx.stroke();
    }

    this.offscreenCtx.restore();
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
  }

  renderIndicator(id: string, priceScale: PriceScaleResult, timeScale: TimeScaleResult) {
    const data = this.indicators.get(id);
    if (!data) return;

    this.offscreenCtx.save();
    this.offscreenCtx.scale(devicePixelRatio, devicePixelRatio);
    this.offscreenCtx.beginPath();
    this.offscreenCtx.strokeStyle = id === 'sma' ? '#ff0000' : '#0000ff';
    this.offscreenCtx.lineWidth = 1;

    data.forEach((value, i) => {
      if (isNaN(value)) return;
      const x = timeScale.scaleX(i);
      const y = priceScale.scaleY(value);
      if (i === 0) this.offscreenCtx.moveTo(x, y);
      else this.offscreenCtx.lineTo(x, y);
    });

    this.offscreenCtx.stroke();
    this.offscreenCtx.restore();
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
  }

  destroy() {
    this.candles = null;
    this.ticks = null;
    this.drawingTools = [];
    this.indicators.clear();
    this.labelCache.clear();
  }
}
