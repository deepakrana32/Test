// ChartGPUBackend.ts
import { ChartPlugins } from './ChartPlugins';

interface ChartGPUConfig {
  alphaMode?: GPUCanvasAlphaMode;
  format?: GPUTextureFormat;
  clearColor?: GPUColorDict;
  pixelRatio?: number;
}

export class ChartGPUBackend {
  private readonly canvas: HTMLCanvasElement;
  private readonly plugins: ChartPlugins;
  private readonly config: ChartGPUConfig;
  private context: GPUCanvasContext | null = null;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat | null = null;
  private isInitialized: boolean = false;
  private renderPassDescriptor: GPURenderPassDescriptor;

  constructor(canvas: HTMLCanvasElement, plugins: ChartPlugins, config: ChartGPUConfig = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    }

    this.canvas = canvas;
    this.plugins = plugins;
    this.config = {
      alphaMode: config.alphaMode ?? 'opaque',
      format: config.format ?? navigator.gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm',
      clearColor: config.clearColor ?? { r: 0, g: 0, b: 0, a: 1 },
      pixelRatio: config.pixelRatio ?? window.devicePixelRatio ?? 1,
    };

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: {} as GPUTextureView,
          clearValue: this.config.clearColor,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
        },
      ],
    };
  }

  async initialize(width: number, height: number): Promise<void> {
    if (this.isInitialized) {
      console.warn('ChartGPUBackend already initialized');
      return;
    }

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('GPU adapter not found');
    }

    this.device = await adapter.requestDevice();
    if (!this.device) {
      throw new Error('Failed to create GPU device');
    }

    const context = this.canvas.getContext('webgpu');
    if (!context) {
      this.device.destroy();
      this.device = null;
      throw new Error('WebGPU context not supported or canvas is invalid');
    }
    this.context = context;
    this.format = this.config.format;

    try {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: this.config.alphaMode,
      });

      this.canvas.width = width * this.config.pixelRatio;
      this.canvas.height = height * this.config.pixelRatio;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      await this.plugins.initializeGPU(this.device);
      this.isInitialized = true;
    } catch (error) {
      this.cleanup();
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  render(): void {
    if (!this.isInitialized || !this.context || !this.device || !this.format) {
      console.warn('Cannot render: ChartGPUBackend not initialized');
      return;
    }

    try {
      const commandEncoder = this.device.createCommandEncoder();
      const textureView = this.context.getCurrentTexture().createView();

      this.renderPassDescriptor.colorAttachments[0].view = textureView;

      const pass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
      try {
        this.plugins.renderGPU(pass);
      } catch (error) {
        console.error(`Plugin render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        pass.end();
      }

      this.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      console.error(`Render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  updateConfig(config: Partial<ChartGPUConfig>): void {
    let needsReinitialize = false;

    if (config.alphaMode && config.alphaMode !== this.config.alphaMode) {
      this.config.alphaMode = config.alphaMode;
      needsReinitialize = true;
    }
    if (config.format && config.format !== this.config.format) {
      this.config.format = config.format;
      needsReinitialize = true;
    }
    if (config.clearColor) {
      this.config.clearColor = config.clearColor;
      this.renderPassDescriptor.colorAttachments[0].clearValue = config.clearColor;
    }
    if (config.pixelRatio && config.pixelRatio !== this.config.pixelRatio) {
      this.config.pixelRatio = config.pixelRatio;
      needsReinitialize = true;
    }

    if (needsReinitialize && this.isInitialized) {
      this.destroy();
      this.initialize(this.canvas.width / this.config.pixelRatio, this.canvas.height / this.config.pixelRatio).catch(error => {
        console.error(`Reinitialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    }
  }

  destroy(): void {
    if (!this.isInitialized) {
      return;
    }
    this.cleanup();
  }

  private cleanup(): void {
    try {
      this.plugins.destroy();
    } catch (error) {
      console.warn(`Plugin cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    if (this.context) {
      this.context.unconfigure();
      this.context = null;
    }

    this.format = null;
    this.isInitialized = false;
  }

  getDevice(): GPUDevice | null {
    return this.device;
  }
}
