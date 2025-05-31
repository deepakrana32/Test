import { Candle, Tick, Series, PriceScaleResult, TimeScaleResult, DrawingTool } from './ChartTypes';

export class ChartGPUBackend {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private device: GPUDevice | null;
  private context: GPUCanvasContext | null;
  private renderPass: GPURenderPassEncoder | null;
  private buffers: Map<string, GPUBuffer>;

  constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext | null
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.device = null;
    this.context = null;
    this.renderPass = null;
    this.buffers = new Map();
    this.initializeWebGPU().catch(console.error);
  }

  private async initializeWebGPU() {
    if (!navigator.gpu) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu')!;
    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });
  }

  setData(candles: Candle[] | null, ticks: Tick[] | null) {
    if (this.device && (candles || ticks)) {
      const data = candles || ticks!;
      const buffer = this.device.createBuffer({
        size: data.length * 4 * 4, // Float32 per attribute
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buffer, 0, new Float32Array(data.flatMap(d => 'open' in d ? [d.open, d.high, d.low, d.close] : [d.price, d.time, d.volume, 0])));
      this.buffers.set('data', buffer);
    }
  }

  setDrawingTools(tools: DrawingTool[]) {
    if (this.device) {
      const buffer = this.device.createBuffer({
        size: tools.length * 4 * 4, // Float32 for positions
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buffer, 0, new Float32Array(tools.flatMap(t => {
        const d = t.data as any;
        return [d.startIndex || d.index || 0, d.startPrice || d.price || 0, d.endIndex || d.targetIndex || 0, d.endPrice || d.targetPrice || 0];
      })));
      this.buffers.set('tools', buffer);
    }
  }

  setIndicator(id: string, data: Float32Array) {
    if (this.device) {
      const buffer = this.device.createBuffer({
        size: data.length * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buffer, 0, data);
      this.buffers.set(`indicator_${id}`, buffer);
    }
  }

  renderSeries(series: Series, priceScale: PriceScaleResult, timeScale: TimeScaleResult) {
    if (this.gl) {
      // WebGL rendering
      this.renderWebGL(series, priceScale, timeScale);
    } else if (this.device && this.context) {
      // WebGPU rendering
      const commandEncoder = this.device.createCommandEncoder();
      this.renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      // Placeholder for shader pipeline
      this.renderPass.end();
      this.device.queue.submit([commandEncoder.finish()]);
    }
  }

  private renderWebGL(series: Series, priceScale: PriceScaleResult, timeScale: TimeScaleResult) {
    if (!this.gl) return;
    // Placeholder for WebGL rendering
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    // Render series using instanced rendering
  }

  renderIndicator(id: string, priceScale: PriceScaleResult, timeScale: TimeScaleResult) {
    if (this.gl) {
      // WebGL indicator rendering
    } else if (this.device && this.renderPass) {
      // WebGPU indicator rendering
    }
  }

  getDevice(): GPUDevice | null {
    return this.device;
  }

  getRenderPass(): GPURenderPassEncoder | null {
    return this.renderPass;
  }

  destroy() {
    this.buffers.forEach(b => b.destroy());
    this.buffers.clear();
    this.device = null;
    this.context = null;
    this.renderPass = null;
  }
}
