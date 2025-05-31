// ChartEngineCore.ts
import { ChartRenderer } from './ChartRenderer';
import { ChartEventManager } from './ChartEventManager';
import { ChartPlugins, ChartPlugin } from './ChartPlugins';
import { ChartConfig, DrawingTool, DrawingToolState, PriceScaleOptions, TimeScaleOptions, validateChartConfig, Candle } from './ChartTypes';
import { DrawingToolManager } from './DrawingToolManager';
import { throttle } from 'lodash';

/**
 * Interface for chart engine options.
 * @interface
 */
interface ChartEngineOptions {
  /** The HTML canvas element to render on */
  canvas: HTMLCanvasElement;
  /** Whether to attempt GPU rendering (default: false) */
  useGPU?: boolean;
  /** Canvas width in CSS pixels */
  width: number;
  /** Canvas height in CSS pixels */
  height: number;
  /** Device pixel ratio for high-DPI displays (default: window.devicePixelRatio) */
  dpr?: number;
  /** Initial chart configuration or data URL */
  config?: ChartConfig | string;
  /** Initial drawing tools */
  tools?: DrawingTool[];
  /** Price scale options */
  priceScale?: PriceScaleOptions;
  /** Time scale options */
  timeScale?: TimeScaleOptions;
}

/**
 * Interface for plugin context to provide event emission and container access.
 * @interface
 */
interface PluginContext {
  emit?: (event: string, data: any) => void;
  getContainer?: () => HTMLElement;
}

/**
 * Core charting engine for custom financial charting, managing rendering, events, plugins, and drawing tools.
 * @class
 */
export class ChartEngineCore {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ChartRenderer;
  private readonly eventManager: ChartEventManager;
  private readonly plugins: ChartPlugins;
  private readonly toolManager: DrawingToolManager;
  private readonly context: PluginContext;
  private width: number;
  private height: number;
  private dpr: number;
  private useGPU: boolean;
  private animationFrame: number = 0;
  private isInitialized: boolean = false;
  private isPaused: boolean = false;
  private isChartMode: boolean = true;
  private undoStack: DrawingToolState[] = [];
  private redoStack: DrawingToolState[] = [];
  private offscreenCanvas: OffscreenCanvas | null = null;
  private priceScale: PriceScaleOptions;
  private timeScale: TimeScaleOptions;
  private currentSymbol: string | null = null;
  private currentTimeframe: string | null = null;
  private currentConfig: ChartConfig | null = null;

  /**
   * Creates a new ChartEngineCore instance.
   * @param options Configuration options for the chart engine.
   * @throws Error if options are invalid.
   */
  constructor(options: ChartEngineOptions) {
    if (!(options.canvas instanceof HTMLCanvasElement)) throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    if (!Number.isFinite(options.width) || options.width <= 0) throw new Error('Invalid width: must be a positive number');
    if (!Number.isFinite(options.height) || options.height <= 0) throw new Error('Invalid height: must be a positive number');
    if (options.dpr !== undefined && (!Number.isFinite(options.dpr) || options.dpr <= 0)) throw new Error('Invalid dpr: must be a positive number');

    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.dpr = options.dpr ?? window.devicePixelRatio ?? 1;
    this.useGPU = options.useGPU ?? false;
    this.priceScale = options.priceScale ?? { height: this.height, minRangeMargin: 0.1, pixelPerTick: 50, minTicks: 5, maxTicks: 20 };
    this.timeScale = options.timeScale ?? { width: this.width, candleWidth: 10, minCandleWidth: 5, maxCandleWidth: 20, totalCandles: 100 };
    this.context = {
      emit: (event, data) => console.log(`Event: ${event}`, data),
      getContainer: () => this.canvas.parentElement ?? document.body,
    };
    this.renderer = new ChartRenderer(this.canvas, this.canvas.getContext('2d')!);
    this.eventManager = new ChartEventManager(this.canvas, { passive: false });
    this.plugins = new ChartPlugins();
    this.toolManager = new DrawingToolManager(
      this.canvas,
      this.canvas.getContext('2d')!,
      (tools) => {
        this.undoStack.push({ tools: [...tools], timestamp: Date.now() });
        this.redoStack = [];
        this.context.emit?.('toolsUpdated', { tools });
      },
      this.computeScaleX.bind(this),
      this.computeScaleY.bind(this),
      this.computeUnscaleX.bind(this),
      this.computeUnscaleY.bind(this)
    );
    this.offscreenCanvas = new OffscreenCanvas(this.width * this.dpr, this.height * this.dpr);
    if (options.tools) {
      this.toolManager.deserializeTools(JSON.stringify(options.tools));
    }
    this.setupGUI();
    this.setupEventListeners();
  }

  /**
   * Sets up the GUI toolbar for chart controls, including symbol and timeframe display.
   * @private
   */
  private setupGUI(): void {
    const container = this.context.getContainer?.();
    if (container) {
      const gui = document.createElement('div');
      gui.setAttribute('role', 'toolbar');
      gui.setAttribute('aria-label', 'Chart Controls');
      gui.style.cssText = 'position: absolute; top: 10px; left: 10px; background: #fff; padding: 5px; border: 1px solid #ccc;';
      gui.innerHTML = `
        <div id="chartInfo" style="margin-bottom: 5px;" aria-label="Chart Information">
          ${this.currentSymbol || 'Unknown Symbol'} ${this.currentTimeframe || 'Unknown Timeframe'}
        </div>
        <button id="chartMode" aria-label="Click to switch to Chart Mode">Chart Mode</button>
        <button id="drawMode" aria-label="Click to switch to Drawing Mode">Draw Mode</button>
        <button id="undo" aria-label="Click to undo last action">Undo</button>
        <button id="redo" aria-label="Click to redo last action">Redo</button>
        <select id="toolSelect" aria-label="Select a drawing tool">
          <option value="">Select Tool</option>
          <option value="trendline">Trendline</option>
          <option value="rectangle">Rectangle</option>
          <option value="fibonacci">Fibonacci</option>
          <option value="horizontalLine">Horizontal Line</option>
          <option value="verticalLine">Vertical Line</option>
          <option value="arrow">Arrow</option>
          <option value="brush">Brush</option>
          <option value="highlighter">Highlighter</option>
          <option value="callout">Callout</option>
          <option value="circle">Circle</option>
          <option value="extendedLine">Extended Line</option>
          <option value="parallelChannel">Parallel Channel</option>
          <option value="path">Path</option>
          <option value="priceRange">Price Range</option>
          <option value="ray">Ray</option>
          <option value="text">Text</option>
        </select>
      `;
      container.appendChild(gui);
      this.updateGUI();
    }
  }

  /**
   * Updates the GUI to reflect current symbol and timeframe.
   * @private
   */
  private updateGUI(): void {
    const chartInfo = this.context.getContainer?.().querySelector('#chartInfo') as HTMLElement;
    if (chartInfo) {
      chartInfo.textContent = `${this.currentSymbol || 'Unknown Symbol'} ${this.currentTimeframe || 'Unknown Timeframe'}`;
      chartInfo.setAttribute('aria-label', `Chart Information: ${chartInfo.textContent}`);
    }
  }

  /**
   * Sets up event listeners via ChartEventManager.
   * @private
   */
  private setupEventListeners(): void {
    this.eventManager.on('zoom', ({ delta, x }: any) => {
      if (this.isChartMode) {
        const zoomFactor = 1 + delta;
        this.timeScale.candleWidth = Math.min(
          this.timeScale.maxCandleWidth,
          Math.max(this.timeScale.minCandleWidth, this.timeScale.candleWidth * zoomFactor)
        );
        this.context.emit?.('zoom', { candleWidth: this.timeScale.candleWidth, x });
        this.render();
      }
    });

    this.eventManager.on('pan', ({ dx }: any) => {
      if (this.isChartMode) {
        // Simplified panning: adjust visible candle range
        this.timeScale.offset = (this.timeScale.offset || 0) + dx / this.timeScale.candleWidth;
        this.context.emit?.('pan', { dx, offset: this.timeScale.offset });
        this.render();
      }
    });

    this.eventManager.on('click', ({ x, y }: any) => {
      if (!this.isChartMode) {
        const index = this.computeUnscaleX(x);
        const price = this.computeUnscaleY(y);
        this.toolManager.handleClick({ index, price });
        this.context.emit?.('toolClicked', { x, y, index, price });
        this.render();
      }
    });

    this.eventManager.on('hover', ({ x, y }: any) => {
      if (!this.isChartMode) {
        const index = this.computeUnscaleX(x);
        const price = this.computeUnscaleY(y);
        this.toolManager.handleHover({ index, price });
        this.context.emit?.('toolHovered', { x, y, index, price });
        this.render();
      }
    });

    this.eventManager.on('rightclick', ({ x, y }: any) => {
      if (!this.isChartMode) {
        const index = this.computeUnscaleX(x);
        const price = this.computeUnscaleY(y);
        this.toolManager.handleContextMenu({ index, price });
        this.context.emit?.('toolContextMenu', { x, y, index, price });
        this.render();
      }
    });

    // GUI events
    const container = this.context.getContainer?.();
    if (container) {
      container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'chartMode') {
          this.setChartMode(true);
        } else if (target.id === 'drawMode') {
          this.setChartMode(false);
        } else if (target.id === 'undo') {
          this.undo();
        } else if (target.id === 'redo') {
          this.redo();
        }
      });
      container.querySelector('#toolSelect')?.addEventListener('change', (e) => {
        const tool = (e.target as HTMLSelectElement).value;
        this.toolManager.setActiveTool(tool || null);
        this.context.emit?.('toolSelected', { tool });
      });
    }

    // Keyboard accessibility
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this.eventManager.emit('pan', { dx: 10 });
      } else if (e.key === 'ArrowRight') {
        this.eventManager.emit('pan', { dx: -10 });
      } else if (e.key === 'ArrowUp') {
        this.eventManager.emit('zoom', { delta: 0.1, x: this.width / 2 });
      } else if (e.key === 'ArrowDown') {
        this.eventManager.emit('zoom', { delta: -0.1, x: this.width / 2 });
      } else if (e.key === 'Enter' && !this.isChartMode) {
        const toolSelect = this.context.getContainer?.().querySelector('#toolSelect') as HTMLSelectElement;
        if (toolSelect) {
          this.toolManager.setActiveTool(toolSelect.value || null);
          this.context.emit?.('toolSelected', { tool: toolSelect.value });
        }
      }
    });
  }

  /**
   * Computes x-coordinate from candle index.
   * @private
   */
  private computeScaleX(index: number): number {
    return (index - (this.timeScale.offset || 0)) * this.timeScale.candleWidth + this.timeScale.candleWidth / 2;
  }

  /**
   * Computes y-coordinate from price.
   * @private
   */
  private computeScaleY(price: number): number {
    const range = this.priceScale.maxPrice - this.priceScale.minPrice;
    return this.height - ((price - this.priceScale.minPrice) / range) * this.height;
  }

  /**
   * Computes candle index from x-coordinate.
   * @private
   */
  private computeUnscaleX(x: number): number {
    return Math.round(x / this.timeScale.candleWidth + (this.timeScale.offset || 0));
  }

  /**
   * Computes price from y-coordinate.
   * @private
   */
  private computeUnscaleY(y: number): number {
    const range = this.priceScale.maxPrice - this.priceScale.minPrice;
    return this.priceScale.minPrice + ((this.height - y) / this.height) * range;
  }

  /**
   * Initializes the chart engine.
   * @throws Error if initialization fails.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('ChartEngineCore already initialized');
      return;
    }

    this.updateCanvasDimensions();
    try {
      if (this.useGPU) {
        console.warn('GPU rendering not implemented; using 2D canvas');
      }
      if (this.options.config) {
        await this.init(this.options.config);
      }
      this.plugins.initialize();
      this.isInitialized = true;
      this.startLoop();
      this.context.emit?.('initialized', {});
    } catch (error) {
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates canvas dimensions based on width, height, and DPR.
   * @private
   */
  private updateCanvasDimensions(): void {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.offscreenCanvas!.width = this.canvas.width;
    this.offscreenCanvas!.height = this.canvas.height;
    this.renderer.setCanvasSize(this.width, this.height);
  }

  /**
   * Starts the throttled animation loop for rendering.
   * @private
   */
  private startLoop(): void {
    const loop = throttle(() => {
      if (!this.isPaused && this.isInitialized) {
        this.render();
      }
      this.animationFrame = requestAnimationFrame(loop);
    }, 16); // ~60fps
    loop();
  }

  /**
   * Renders the chart and tools using offscreen canvas, respecting isFinal.
   * @private
   */
  private render(): void {
    if (!this.isInitialized || !this.currentConfig) {
      console.warn('Cannot render: ChartEngineCore not initialized or no config');
      return;
    }
    try {
      const ctx = this.offscreenCanvas!.getContext('2d')!;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const candles = this.currentConfig.candles.filter(candle => candle.isFinal !== false);
      this.renderer.renderCandles(candles, ctx, this.timeScale, this.priceScale);
      this.toolManager.renderTools(ctx);
      this.canvas.getContext('2d')!.drawImage(this.offscreenCanvas!, 0, 0);
    } catch (error) {
      console.error(`Render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates a single candlestick data point.
   * @private
   */
  private validateCandle(candle: Candle): void {
    const { open, high, low, close, volume, time, symbol, timeframe, isFinal } = candle;
    if (!Number.isFinite(open) || open < 0) throw new Error('Invalid open price');
    if (!Number.isFinite(high) || high < 0) throw new Error('Invalid high price');
    if (!Number.isFinite(low) || low < 0) throw new Error('Invalid low price');
    if (!Number.isFinite(close) || close < 0) throw new Error('Invalid close price');
    if (!Number.isFinite(volume) || volume < 0) throw new Error('Invalid volume');
    if (!Number.isFinite(time) || time <= 0) throw new Error('Invalid timestamp');
    if (low > high) throw new Error('Low price cannot exceed high price');
    if (open < low || open > high) throw new Error('Open price must be between low and high');
    if (close < low || close > high) throw new Error('Close price must be between low and high');
    if (symbol !== undefined && typeof symbol !== 'string') throw new Error('Invalid symbol: must be a string');
    if (timeframe !== undefined && typeof timeframe !== 'string') throw new Error('Invalid timeframe: must be a string');
    if (isFinal !== undefined && typeof isFinal !== 'boolean') throw new Error('Invalid isFinal: must be a boolean');
  }

  /**
   * Fetches chart data from a URL and updates symbol/timeframe.
   * @param url Data endpoint.
   * @returns Chart configuration.
   */
  async fetchData(url: string): Promise<ChartConfig> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.candles)) throw new Error('Invalid data: candles must be an array');
      let symbol: string | null = null;
      let timeframe: string | null = null;
      data.candles.forEach((candle: Candle, index: number) => {
        try {
          this.validateCandle(candle);
          if (candle.symbol && !symbol) symbol = candle.symbol;
          if (candle.timeframe && !timeframe) timeframe = candle.timeframe;
        } catch (error) {
          throw new Error(`Invalid candle at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
      const config: ChartConfig = {
        candles: data.candles,
        symbol,
        timeframe,
      };
      if (symbol !== this.currentSymbol || timeframe !== this.currentTimeframe) {
        this.currentSymbol = symbol;
        this.currentTimeframe = timeframe;
        this.updateGUI();
        this.context.emit?.('metadataUpdated', { symbol, timeframe });
      }
      return config;
    } catch (error) {
      throw new Error(`Failed to fetch chart data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initializes the chart with a configuration or URL.
   * @param urlOrConfig Chart configuration or data URL.
   */
  async init(urlOrConfig: string | ChartConfig): Promise<void> {
    const config = typeof urlOrConfig === 'string' ? await this.fetchData(urlOrConfig) : urlOrConfig;
    validateChartConfig(config);
    this.currentConfig = config;
    this.currentSymbol = config.symbol || null;
    this.currentTimeframe = config.timeframe || null;
    this.updateGUI();
    this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    this.renderer.renderCandles(config.candles, this.canvas.getContext('2d')!, this.timeScale, this.priceScale);
    this.plugins.initialize();
    this.eventManager.setChartMode(this.isChartMode);
    this.toolManager.setChartMode(this.isChartMode);
    this.context.emit?.('chartInitialized', { config });
  }

  /**
   * Renders the chart with a configuration.
   * @param config Chart configuration.
   */
  render(config: ChartConfig): void {
    validateChartConfig(config);
    this.currentConfig = config;
    if (config.symbol !== this.currentSymbol || config.timeframe !== this.currentTimeframe) {
      this.currentSymbol = config.symbol || null;
      this.currentTimeframe = config.timeframe || null;
      this.updateGUI();
      this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    }
    this.renderer.renderCandles(config.candles, this.canvas.getContext('2d')!, this.timeScale, this.priceScale);
    this.context.emit?.('chartRendered', { config });
  }

  /**
   * Updates the chart with a new configuration.
   * @param config Chart configuration.
   */
  update(config: ChartConfig): void {
    validateChartConfig(config);
    this.currentConfig = config;
    if (config.symbol !== this.currentSymbol || config.timeframe !== this.currentTimeframe) {
      this.currentSymbol = config.symbol || null;
      this.currentTimeframe = config.timeframe || null;
      this.updateGUI();
      this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    }
    this.renderer.updateCandles(config.candles, this.canvas.getContext('2d')!, this.timeScale, this.priceScale);
    this.context.emit?.('chartUpdated', { config });
  }

  /**
   * Registers a plugin with the chart engine.
   * @param plugin The plugin to register.
   */
  addPlugin(plugin: ChartPlugin): void {
    this.plugins.register(plugin);
    this.context.emit?.('pluginAdded', { plugin });
  }

  /**
   * Adds an event listener for chart events.
   * @param type Event type.
   * @param callback Event handler.
   */
  addEventListener(type: string, callback: Function): void {
    this.eventManager.on(type as any, callback as any);
    this.context.emit?.('eventListenerAdded', { type });
  }

  /**
   * Sets chart or draw mode.
   * @param isChartMode True for chart mode, false for draw mode.
   */
  setChartMode(isChartMode: boolean): void {
    this.isChartMode = isChartMode;
    this.eventManager.setChartMode(isChartMode);
    this.toolManager.setChartMode(isChartMode);
    this.context.emit?.('modeChanged', { isChartMode });
  }

  /**
   * Updates chart engine options dynamically.
   * @param options Partial options to update.
   */
  updateOptions(options: Partial<ChartEngineOptions>): void {
    let needsReinitialize = false;

    if (options.canvas && options.canvas !== this.canvas) {
      if (!(options.canvas instanceof HTMLCanvasElement)) throw new Error('Invalid canvas');
      this.canvas = options.canvas;
      this.eventManager.detach();
      this.eventManager = new ChartEventManager(this.canvas, { passive: false });
      this.setupEventListeners();
      needsReinitialize = true;
    }

    if (options.width !== undefined) {
      if (!Number.isFinite(options.width) || options.width <= 0) throw new Error('Invalid width');
      this.width = options.width;
      needsReinitialize = true;
    }

    if (options.height !== undefined) {
      if (!Number.isFinite(options.height) || options.height <= 0) throw new Error('Invalid height');
      this.height = options.height;
      needsReinitialize = true;
    }

    if (options.dpr !== undefined) {
      if (!Number.isFinite(options.dpr) || options.dpr <= 0) throw new Error('Invalid dpr');
      this.dpr = options.dpr;
      needsReinitialize = true;
    }

    if (options.useGPU !== undefined) {
      this.useGPU = options.useGPU;
      needsReinitialize = true;
    }

    if (options.priceScale) {
      this.priceScale = { ...this.priceScale, ...options.priceScale };
    }

    if (options.timeScale) {
      this.timeScale = { ...this.timeScale, ...options.timeScale };
    }

    if (needsReinitialize && this.isInitialized) {
      this.destroy();
      this.initialize().catch(error => {
        console.error(`Reinitialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    } else if (needsReinitialize) {
      this.updateCanvasDimensions();
      this.updateGUI();
    }
  }

  /**
   * Undoes the last tool action.
   */
  undo(): void {
    if (this.undoStack.length <= 1) return;
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);
    const previousState = this.undoStack[this.undoStack.length - 1];
    this.toolManager.deserializeTools(JSON.stringify(previousState.tools));
    this.context.emit?.('undo', { tools: previousState.tools });
  }

  /**
   * Redoes the last undone tool action.
   */
  redo(): void {
    if (this.redoStack.length === 0) return;
    const nextState = this.redoStack.pop()!;
    this.undoStack.push(nextState);
    this.toolManager.deserializeTools(JSON.stringify(nextState.tools));
    this.context.emit?.('redo', { tools: nextState.tools });
  }

  /**
   * Serializes the current chart and tool state.
   * @returns JSON string of the state.
   */
  serializeState(): string {
    try {
      return JSON.stringify({
        config: this.currentConfig,
        tools: this.toolManager.serializeTools(),
        symbol: this.currentSymbol,
        timeframe: this.currentTimeframe,
      });
    } catch (error) {
      console.error('Serialization failed:', error);
      return '{}';
    }
  }

  /**
   * Deserializes and restores chart and tool state.
   * @param state JSON string of the state.
   */
  deserializeState(state: string): void {
    try {
      const { config, tools, symbol, timeframe } = JSON.parse(state);
      if (config) {
        this.render(config);
      }
      if (tools) {
        this.toolManager.deserializeTools(tools);
      }
      if (symbol || timeframe) {
        this.currentSymbol = symbol || null;
        this.currentTimeframe = timeframe || null;
        this.updateGUI();
        this.context.emit?.('metadataUpdated', { symbol, timeframe });
      }
      this.context.emit?.('stateRestored', { config, tools, symbol, timeframe });
    } catch (error) {
      console.error('Deserialization failed:', error);
    }
  }

  /**
   * Pauses the animation loop.
   */
  pause(): void {
    this.isPaused = true;
    this.context.emit?.('paused', {});
  }

  /**
   * Resumes the animation loop.
   */
  resume(): void {
    this.isPaused = false;
    this.context.emit?.('resumed', {});
  }

  /**
   * Cleans up resources and stops the chart engine.
   */
  destroy(): void {
    if (!this.isInitialized) return;

    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;

    try {
      this.eventManager.detach();
    } catch (error) {
      console.warn(`Event manager cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      this.plugins.destroy();
    } catch (error) {
      console.warn(`Plugin cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      this.toolManager.destroy();
    } catch (error) {
      console.warn(`Tool manager cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const gui = this.context.getContainer?.().querySelector('[role="toolbar"]');
    if (gui) gui.remove();

    this.canvas.width = 0;
    this.canvas.height = 0;
    this.offscreenCanvas = null;
    this.isInitialized = false;
    this.isPaused = false;
    this.currentSymbol = null;
    this.currentTimeframe = null;
    this.currentConfig = null;
    this.context.emit?.('destroyed', {});
  }
}
