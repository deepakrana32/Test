import { ChartRenderer } from './ChartRenderer';

interface IndicatorResult {
  id: string;
  data: Float32Array;
}

interface Plugin {
  id: string;
  initializeWebGL?: (gl: WebGL2RenderingContext) => void;
  initializeGPU?: (device: GPUDevice) => Promise<void>;
  initialize2D?: (ctx: CanvasRenderingContext2D) => void;
  renderWebGL?: (gl: WebGL2RenderingContext) => void;
  renderGPU?: (renderPass: GPURenderPassEncoder) => void;
  render2D?: (ctx: CanvasRenderingContext2D) => void;
  renderScreenshot?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  onAnimationFrame?: (timestamp: number, deltaTime: number) => void;
  compute?: (data: Float32Array) => IndicatorResult[];
  destroy?: () => void;
}

export class ChartPlugins {
  private plugins: Map<string, Plugin>;
  private renderer: ChartRenderer | null;

  constructor() {
    this.plugins = new Map();
    this.renderer = null;
    this.registerIndicators();
  }

  private registerIndicators() {
    const indicators: Plugin[] = [
      {
        id: 'bollinger_bands',
        compute: (data: Float32Array) => {
          const period = 20;
          const stdDev = 2;
          const sma = this.computeSMA(data, period);
          const bbUpper = new Float32Array(data.length);
          const bbLower = new Float32Array(data.length);
          for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const std = Math.sqrt(slice.reduce((sum, v) => sum + (v - sma[i]) ** 2, 0) / period);
            bbUpper[i] = sma[i] + stdDev * std;
            bbLower[i] = sma[i] - stdDev * std;
          }
          return [
            { id: 'bb_upper', data: bbUpper },
            { id: 'bb_lower', data: bbLower },
            { id: 'bb_sma', data: new Float32Array(sma) },
          ];
        },
      },
      {
        id: 'macd',
        compute: (data: Float32Array) => {
          const ema12 = this.computeEMA(data, 12);
          const ema26 = this.computeEMA(data, 26);
          const macd = new Float32Array(data.length);
          const signal = new Float32Array(data.length);
          for (let i = 0; i < data.length; i++) {
            macd[i] = ema12[i] - ema26[i];
          }
          for (let i = 8; i < data.length; i++) {
            signal[i] = this.computeEMA(macd, 9)[i];
          }
          return [
            { id: 'macd_line', data: macd },
            { id: 'macd_signal', data: signal },
          ];
        },
      },
      {
        id: 'stochastic',
        compute: (data: Float32Array) => {
          const period = 14;
          const k = new Float32Array(data.length);
          for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const high = Math.max(...slice);
            const low = Math.min(...slice);
            k[i] = ((data[i] - low) / (high - low)) * 100;
          }
          const d = this.computeSMA(k, 3);
          return [
            { id: 'stochastic_k', data: k },
            { id: 'stochastic_d', data: new Float32Array(d) },
          ];
        },
      },
      {
        id: 'rsi',
        compute: (data: Float32Array) => {
          const period = 14;
          const rsi = new Float32Array(data.length);
          let gain = 0;
          let loss = 0;
          for (let i = 1; i < period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gain += diff;
            else loss -= diff;
          }
          let avgGain = gain / period;
          let avgLoss = loss / period;
          for (let i = period; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const currGain = diff > 0 ? diff : 0;
            const currLoss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + currGain) / period;
            avgLoss = (avgLoss * (period - 1) + currLoss) / period;
            const rs = avgGain / (avgLoss || 1);
            rsi[i] = 100 - 100 / (1 + rs);
          }
          return [{ id: 'rsi', data: rsi }];
        },
      },
      {
        id: 'atr',
        compute: (data: Float32Array) => {
          const period = 14;
          const atr = new Float32Array(data.length);
          let trSum = 0;
          for (let i = 1; i < period; i++) {
            const tr = Math.max(data[i] - data[i - 1], Math.abs(data[i] - data[i - 1]));
            trSum += tr;
          }
          atr[period - 1] = trSum / period;
          for (let i = period; i < data.length; i++) {
            const tr = Math.max(data[i] - data[i - 1], Math.abs(data[i] - data[i - 1]));
            atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
          }
          return [{ id: 'atr', data: atr }];
        },
      },
    ];

    indicators.forEach(plugin => this.registerPlugin(plugin));
  }

  private computeSMA(data: Float32Array, period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
        continue;
      }
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  private computeEMA(data: Float32Array, period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    let ema = data[0];
    result.push(NaN);
    for (let i = 1; i < data.length; i++) {
      if (i < period) {
        result.push(NaN);
        continue;
      }
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
    return result;
  }

  registerPlugin(plugin: Plugin) {
    this.plugins.set(plugin.id, plugin);
  }

  initializeWebGL(gl: WebGL2RenderingContext) {
    this.plugins.forEach(p => p.initializeWebGL?.(gl));
  }

  async initializeGPU(device: GPUDevice) {
    for (const p of this.plugins.values()) {
      await p.initializeGPU?.(device);
    }
  }

  initialize2D(ctx: CanvasRenderingContext2D) {
    this.plugins.forEach(p => p.initialize2D?.(ctx));
  }

  renderWebGL(gl: WebGL2RenderingContext) {
    this.plugins.forEach(p => p.renderWebGL?.(gl));
  }

  renderGPU(renderPass: GPURenderPassEncoder) {
    this.plugins.forEach(p => p.renderGPU?.(renderPass));
  }

  render2D(ctx: CanvasRenderingContext2D) {
    this.plugins.forEach(p => p.render2D?.(ctx));
  }

  renderScreenshot(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.plugins.forEach(p => p.renderScreenshot?.(ctx, width, height));
  }

  onAnimationFrame(timestamp: number, deltaTime: number) {
    this.plugins.forEach(p => p.onAnimationFrame?.(timestamp, deltaTime));
  }

  computeIndicators(data: Float32Array) {
    this.plugins.forEach(p => {
      if (p.compute) {
        const results = p.compute(data);
        results.forEach(result => {
          this.renderer?.setIndicator(result.id, result.data);
        });
      }
    });
  }

  setRenderer(renderer: ChartRenderer) {
    this.renderer = renderer;
  }

  destroy() {
    this.plugins.forEach(p => p.destroy?.());
    this.plugins.clear();
    this.renderer = null;
  }
}
