import { Candle, Tick, Series, CrosshairEvent, PriceScaleResult, TimeScaleResult, DrawingTool } from './ChartTypes';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { ChartGPUBackend } from './ChartGPUBackend';
import { Chart2DCanvasFallback } from './Chart2DCanvasFallback';
import { DrawingToolManager } from './DrawingToolManager';
import { CrosshairManager } from './CrosshairManager';

export class ChartRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null;
  private gpuBackend: ChartGPUBackend;
  private canvasFallback: Chart2DCanvasFallback;
  private candles: Candle[] | null;
  private ticks: Tick[] | null;
  private drawingTools: DrawingTool[];
  private crosshair: CrosshairEvent | null;
  private indicators: Map<string, Float32Array>;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null
  ) {
    if (!canvas || !ctx) throw new Error('Canvas or context missing');
    this.canvas = canvas;
    this.ctx = ctx;
    this.gl = gl;
    this.gpuBackend = new ChartGPUBackend(canvas, gl);
    this.canvasFallback = new Chart2DCanvasFallback(canvas, ctx);
    this.candles = null;
    this.ticks = null;
    this.drawingTools = [];
    this.crosshair = null;
    this.indicators = new Map();
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    this.candles = candles;
    this.ticks = ticks;
    this.gpuBackend.setData(candles, ticks);
    this.canvasFallback.setData(candles, ticks);
  }

  setDrawingTools(tools: DrawingTool[]) {
    this.drawingTools = tools;
    this.gpuBackend.setDrawingTools(tools);
    this.canvasFallback.setDrawingTools(tools);
  }

  setCrosshair(crosshair: CrosshairEvent) {
    this.crosshair = crosshair;
  }

  setIndicator(id: string, data: Float32Array) {
    this.indicators.set(id, data);
    this.gpuBackend.setIndicator(id, data);
    this.canvasFallback.setIndicator(id, data);
  }

  renderSeries(
    series: Series,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null,
    priceScale: PriceScaleEngine,
    timeScale: TimeScaleEngine
  ) {
    const priceResult = priceScale.computePriceScale();
    const timeResult = timeScale.computeTimeScale();
    if (!priceResult || !timeResult) return;

    if (gl) {
      this.gpuBackend.renderSeries(series, priceResult, timeResult);
    } else {
      this.canvasFallback.renderSeries(series, priceResult, timeResult);
    }

    // Render indicators
    this.indicators.forEach((data, id) => {
      if (gl) {
        this.gpuBackend.renderIndicator(id, priceResult, timeResult);
      } else {
        this.canvasFallback.renderIndicator(id, priceResult, timeResult);
      }
    });
  }

  getGPUDevice(): GPUDevice | null {
    return this.gpuBackend.getDevice();
  }

  getGPURenderPass(): GPURenderPassEncoder | null {
    return this.gpuBackend.getRenderPass();
  }

  destroy() {
    this.gpuBackend.destroy();
    this.canvasFallback.destroy();
    this.candles = null;
    this.ticks = null;
    this.drawingTools = [];
    this.indicators.clear();
  }
}
