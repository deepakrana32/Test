```typescript
// ChartGPUBackend.ts
import { ChartPlugins } from './ChartPlugins';

// Interface for WebGPU configuration options
interface ChartGPUConfig {
  /** Alpha mode for the canvas (default: 'opaque') */
  alphaMode?: GPUCanvasAlphaMode;
  /** Texture format for the canvas (default: navigator.gpu.getPreferredCanvasFormat()) */
  format?: GPUTextureFormat;
  /** Clear color for the render pass (default: { r: 0, g: 0, b: 0, a: 1 }) */
  clearColor?: GPUColorDict;
  /** Device pixel ratio for canvas scaling (default: window.devicePixelRatio) */
  pixelRatio?: number;
}

/**
 * WebGPU-based rendering backend for charts.
 * Manages GPU context, device, and plugin rendering.
 */
export class ChartGPUBackend {
  private readonly canvas: HTMLCanvasElement;
  private readonly plugins: ChartPlugins;
  private readonly config: ChartGPUConfig;
  private context: GPUCanvasContext | null = null;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat | null = null;
  private isInitialized: boolean = false;
  private renderPassDescriptor: GPURenderPassDescriptor;

  /**
   * Creates a new ChartGPUBackend instance.
   * @param canvas The HTML canvas element to render on.
   * @param plugins The chart plugins for GPU rendering logic.
   * @param config Optional WebGPU configuration.
   * @throws Error if canvas or plugins are invalid.
   */
  constructor(canvas: HTMLCanvasElement, plugins: ChartPlugins, config: ChartGPUConfig = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    }
    if (!plugins || typeof plugins.initializeGPU !== 'function' || typeof plugins.renderGPU !== 'function') {
      throw new Error('Invalid plugins: must implement initializeGPU and renderGPU methods');
    }

    this.canvas = canvas;
    this.plugins = plugins;
    this.config = {
      alphaMode: config.alphaMode ?? 'opaque',
      format: config.format ?? navigator.gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm',
      clearColor: config.clearColor ?? { r: 0, g: 0, b: 0, a: 1 },
      pixelRatio: config.pixelRatio ?? window.devicePixelRatio ?? 1,
    };

    // Initialize render pass descriptor
    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: {} as GPUTextureView, // Will be updated in render
          clearValue: this.config.clearColor,
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
        },
      ],
    };
  }

  /**
   * Initializes the WebGPU context and plugins.
   * @throws Error if WebGPU is unavailable or initialization fails.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('ChartGPUBackend already initialized');
      return;
    }

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Request GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('GPU adapter not found');
    }

    // Request GPU device
    this.device = await adapter.requestDevice();
    if (!this.device) {
      throw new Error('Failed to create GPU device');
    }

    // Get WebGPU context
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      this.device.destroy();
      this.device = null;
      throw new Error('WebGPU context not supported or canvas is invalid');
    }
    this.context = context;
    this.format = this.config.format;

    // Configure canvas
    try {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: this.config.alphaMode,
      });

      // Adjust canvas for pixel ratio
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * this.config.pixelRatio;
      this.canvas.height = rect.height * this.config.pixelRatio;

      // Initialize plugins
      await this.plugins.initializeGPU(this.device);
      this.isInitialized = true;
    } catch (error) {
      this.cleanup();
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Renders the chart using WebGPU.
   */
  render(): void {
    if (!this.isInitialized || !this.context || !this.device || !this.format) {
      console.warn('Cannot render: ChartGPUBackend not initialized');
      return;
    }

    try {
      const commandEncoder = this.device.createCommandEncoder();
      const textureView = this.context.getCurrentTexture().createView();

      // Update render pass descriptor
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

  /**
   * Updates the WebGPU configuration dynamically.
   * @param config Partial configuration to update.
   */
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
      this.initialize().catch(error => {
        console.error(`Reinitialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    }
  }

  /**
   * Cleans up WebGPU resources and notifies plugins.
   */
  destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    this.cleanup();
  }

  /**
   * Internal cleanup method to release resources.
   */
  private cleanup(): void {
    try {
      if (typeof (this.plugins as any).destroy === 'function') {
        (this.plugins as any).destroy();
      }
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

  /**
   * Gets the GPU device (for external use, e.g., plugin configuration).
   * @returns The GPUDevice or null if not initialized.
   */
  getDevice(): GPUDevice | null {
    return this.device;
  }
}
```