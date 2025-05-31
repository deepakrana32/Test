// ChartEngineCore.ts
import { ChartRenderer } from './ChartRenderer';
import { ChartEventManager } from './ChartEventManager';
import { ChartPlugins, ChartPlugin } from './ChartPlugins';
import { ChartConfig, DrawingTool, DrawingToolState, PriceScaleOptions, TimeScaleOptions, validateChartConfig, Candle } from './ChartTypes';
import { DrawingToolManager } from './DrawingToolManager';
import { detectCandlePatterns, PATTERN_FLAG_MAP } from './patterns/candlePatterns';
import { PatternEngine } from './PatternEngine';
import { PatternEngineGPU } from './PatternEngineGPU';
import { computePatternEngineNextGen } from './PatternEngineNextGen';
import { createPatternOverlayPlugin } from './PatternOverlayRenderer';
import { usePatternWorker } from './usePatternWorker';
import { VWAPOverlay } from './indicators/VWAPOverlay';
import { HybridMAOverlay } from './indicators/HybridMAOverlay';
import { IchimokuCloud } from './indicators/IchimokuCloud';
import { ALMAOverlay } from './indicators/ALMAOverlay';
import { StochasticRSIOverlay } from './indicators/StochasticRSIOverlay';
import { BollingerBandRenderer } from './indicators/BollingerBandRenderer';
import { ATRHeatmapRenderer } from './indicators/ATRHeatmapRenderer';
import { ADRIndicator } from './indicators/ADRIndicator';
import { MACDIndicator } from './indicators/MACDIndicator';
import { SupertrendOverlay } from './indicators/SupertrendOverlay';
import { createMcGinleyDynamic } from './indicators/useMcGinleyDynamic';
import { createDrawingToolsPlugin } from './DrawingToolsPlugin';
import { throttle } from 'lodash';

interface ChartEngineOptions {
  canvas: HTMLCanvasElement;
  useGPU?: boolean;
  width: number;
  height: number;
  dpr?: number;
  config?: ChartConfig | string;
  tools?: DrawingTool[];
  priceScale?: PriceScaleOptions;
  timeScale?: TimeScaleOptions;
  indicators?: {
    vwap?: boolean;
    hybridMA?: boolean;
    ichimoku?: boolean;
    alma?: boolean;
    stochasticRSI?: boolean;
    bollinger?: boolean;
    atrHeatmap?: boolean;
    adr?: boolean;
    macd?: boolean;
    mcginley?: boolean;
    supertrend?: boolean;
    candlePatterns?: boolean;
    patternEngine?: boolean;
    patternEngineGPU?: boolean;
    patternEngineNextGen?: boolean;
    patternWorker?: boolean;
    patternOverlay?: boolean;
  };
}

interface PluginContext {
  emit?: (event: string, data: any) => void;
  getContainer?: () => HTMLElement;
}

export class ChartEngineCore {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ChartRenderer;
  private readonly eventManager: ChartEventManager;
  private readonly plugins: ChartPlugins;
  private readonly toolManager: DrawingToolManager;
  private readonly context: PluginContext;
  private readonly indicators: Required<ChartEngineOptions['indicators']>;
  private readonly device: GPUDevice | null = null; // Placeholder
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

  constructor(options: ChartEngineOptions) {
    if (!(options.canvas instanceof HTMLCanvasElement)) throw new Error('Invalid canvas');
    if (!Number.isFinite(options.width) || options.width <= 0) throw new Error('Invalid width');
    if (!Number.isFinite(options.height) || options.height <= 0) throw new Error('Invalid height');
    if (options.dpr !== undefined && (!Number.isFinite(options.dpr) || options.dpr <= 0)) throw new Error('Invalid dpr');

    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.dpr = options.dpr ?? window.devicePixelRatio ?? 1;
    this.useGPU = options.useGPU ?? false;
    this.indicators = {
      vwap: true,
      hybridMA: true,
      ichimoku: true,
      alma: true,
      stochasticRSI: true,
      bollinger: true,
      atrHeatmap: true,
      adr: true,
      macd: true,
      mcginley: true,
      supertrend: true,
      candlePatterns: true,
      patternEngine: true,
      patternEngineGPU: true,
      patternEngineNextGen: true,
      patternWorker: true,
      patternOverlay: true,
      ...options.indicators,
    };
    this.priceScale = options.priceScale ?? {
      height: this.height,
      minPrice: 0,
      maxPrice: 100,
      minRangeMargin: 0.1,
      pixelPerTick: 50,
      minTicks: 5,
      maxTicks: 20,
    };
    this.timeScale = options.timeScale ?? {
      width: this.width,
      candleWidth: 10,
      minCandleWidth: 5,
      maxCandleWidth: 20,
      totalCandles: 100,
      offset: 0,
    };
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
        <button id="chartMode" aria-label="Switch to Chart Mode">Chart Mode</button>
        <button id="drawMode" aria-label="Switch to Drawing Mode">Draw Mode</button>
        <button id="undo" aria-label="Undo last action">Undo</button>
        <button id="redo" aria-label="Redo last action">Redo</button>
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

  private updateGUI(): void {
    const chartInfo = this.context.getContainer?.().querySelector('#chartInfo') as HTMLElement;
    if (chartInfo) {
      chartInfo.textContent = `${this.currentSymbol || 'Unknown Symbol'} ${this.currentTimeframe || 'Unknown Timeframe'}`;
      chartInfo.setAttribute('aria-label', `Chart Information: ${chartInfo.textContent}`);
    }
  }

  private setupEventListeners(): void {
    this.eventManager.on('zoom', ({ delta, x }: any) => {
      if (this.isChartMode) {
        const zoomFactor = 1 + delta;
        this.timeScale.candleWidth = Math.min(
          this.timeScale.maxCandleWidth,
          Math.max(this.timeScale.minCandleWidth, this.timeScale.candleWidth * zoomFactor)
        );
        this.context.emit?.('zoom', { candleWidth: this.timeScale.candleWidth, x });
        this.plugins.dispatchEvent('zoom', { delta, x });
        this.render();
      }
    });

    this.eventManager.on('pan', ({ dx }: any) => {
      if (this.isChartMode) {
        this.timeScale.offset = (this.timeScale.offset || 0) + dx / this.timeScale.candleWidth;
        this.context.emit?.('pan', { dx, offset: this.timeScale.offset });
        this.plugins.dispatchEvent('pan', { dx });
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
      this.plugins.dispatchEvent('click', { x, y });
    });

    this.eventManager.on('hover', ({ x, y }: any) => {
      if (!this.isChartMode) {
        const index = this.computeUnscaleX(x);
        const price = this.computeUnscaleY(y);
        this.toolManager.handleHover({ index, price });
        this.context.emit?.('toolHovered', { x, y, index, price });
        this.render();
      }
      this.plugins.dispatchEvent('hover', { x, y });
    });

    this.eventManager.on('rightclick', ({ x, y }: any) => {
      if (!this.isChartMode) {
        const index = this.computeUnscaleX(x);
        const price = this.computeUnscaleY(y);
        this.toolManager.handleContextMenu({ index, price });
        this.context.emit?.('toolContextMenu', { x, y, index, price });
        this.render();
      }
      this.plugins.dispatchEvent('rightclick', { x, y });
    });

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
  }

  private setupPlugins(): void {
    if (!this.currentConfig) return;

    const candles = this.currentConfig.candles;
    const prices = candles.map(c => c.close);
    const highs = Float32Array.from(candles.map(c => c.high));
    const lows = Float32Array.from(candles.map(c => c.low));
    const closes = Float32Array.from(candles.map(c => c.close));
    const volumes = Float32Array.from(candles.map(c => c.volume));
    const times = candles.map(c => c.time);
    const volatility = candles.map((_, i) => i > 0 ? Math.abs(candles[i].close - candles[i-1].close) : 0);
    const atrValues = candles.map((c, i) => i > 0 ? Math.max(
      c.high - c.low,
      Math.abs(c.high - candles[i-1].close),
      Math.abs(c.low - candles[i-1].close)
    ) : c.high - c.low);
    const workerResults = usePatternWorker(candles, {
      enableCandlestick: this.indicators.patternWorker,
      enableStructure: this.indicators.patternWorker,
      maxPatternLookback: 100,
      batchSize: 1000,
    });

    // Time Axis
    this.plugins.register({
      name: 'TimeAxis',
      priority: -2,
      render2D: (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        times.forEach((time, i) => {
          if (i % 10 === 0) {
            const x = this.computeScaleX(i);
            ctx.fillText(new Date(time).toLocaleTimeString(), x, this.height + 5);
          }
        });
        ctx.restore();
      },
      renderGPU: () => {},
    });

    // Price Axis
    this.plugins.register({
      name: 'PriceAxis',
      priority: -1,
      render2D: (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const range = this.priceScale.maxPrice - this.priceScale.minPrice;
        const tickCount = Math.floor(this.height / this.priceScale.pixelPerTick);
        for (let i = 0; i <= tickCount; i++) {
          const price = this.priceScale.minPrice + (i / tickCount) * range;
          const y = this.computeScaleY(price);
          ctx.fillText(price.toFixed(2), this.width - 5, y);
        }
        ctx.restore();
      },
      renderGPU: () => {},
    });

    // Indicators
    if (this.indicators.vwap) {
      this.plugins.register(new VWAPOverlay(candles, this.device, this.width, this.height, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.hybridMA) {
      this.plugins.register(new HybridMAOverlay(prices, this.device, this.width, this.height, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.ichimoku) {
      this.plugins.register(new IchimokuCloud(highs, lows, candles.length, this.device, this.width, this.height, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.alma) {
      this.plugins.register(new ALMAOverlay(candles, this.width, this.height, this.device, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.stochasticRSI) {
      this.plugins.register(new StochasticRSIOverlay(prices, this.width, this.height, 1, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.bollinger) {
      this.plugins.register(new BollingerBandRenderer(this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.atrHeatmap) {
      this.plugins.register(new ATRHeatmapRenderer(Float32Array.from(atrValues), 0.6, 1.5, this.device, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.adr) {
      this.plugins.register(new ADRIndicator(candles, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.macd) {
      this.plugins.register(new MACDIndicator(prices, this.width, 100, 1, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }
    if (this.indicators.mcginley) {
      const mcginley = createMcGinleyDynamic(closes, Float32Array.from(volatility));
      this.plugins.register({
        name: 'McGinleyDynamic',
        priority: 0,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          ctx.beginPath();
          mcginley.md.forEach((v, i) => {
            const x = this.computeScaleX(i);
            const y = this.computeScaleY(v);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = '#ff5722';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.8;
          ctx.stroke();
          ctx.restore();
        },
        renderGPU: () => {},
      });
    }
    if (this.indicators.supertrend) {
      this.plugins.register(new SupertrendOverlay(candles, this.device, this.width, this.height, this.computeScaleX.bind(this), this.computeScaleY.bind(this)));
    }

    // Pattern Engines
    if (this.indicators.candlePatterns) {
      this.plugins.register({
        name: 'CandlePatterns',
        priority: 0,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          candles.forEach((_, i) => {
            const pattern = detectCandlePatterns(candles, i);
            if (pattern) {
              const x = this.computeScaleX(i);
              const y = this.computeScaleY(candles[i].close);
              const isBullish = pattern.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
              ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
              ctx.fillRect(x - 5, y - 5, 10, 10);
            }
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(this.computeUnscaleX(data.x));
            const pattern = detectCandlePatterns(candles, index);
            if (pattern) {
              console.log(`Clicked pattern at index ${index} (CandlePatterns): ${pattern.typeLabels.join(', ')}`);
            }
          }
        },
      });
    }

    if (this.indicators.patternEngine) {
      const patternEngine = new PatternEngine(candles);
      this.plugins.register({
        name: 'PatternEngine',
        priority: 1,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          const results = patternEngine.run();
          results.forEach(result => {
            const x = this.computeScaleX(result.index);
            const y = this.computeScaleY(candles[result.index].close);
            const isBullish = result.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
            ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(this.computeUnscaleX(data.x));
            const result = patternEngine.getResults().find(r => r.index === index);
            if (result) {
              console.log(`Clicked pattern at index ${index} (PatternEngine): ${result.typeLabels.join(', ')}`);
            }
          }
        },
      });
    }

    if (this.indicators.patternEngineGPU && this.device) {
      const patternEngineGPU = new PatternEngineGPU(this.device);
      patternEngineGPU.initialize(candles).then(() => {
        this.plugins.register({
          name: 'PatternEngineGPU',
          priority: 2,
          render2D: async (ctx: CanvasRenderingContext2D) => {
            ctx.save();
            const matches = await patternEngineGPU.compute();
            matches.forEach(match => {
              const x = this.computeScaleX(match.index);
              const y = this.computeScaleY(candles[match.index].close);
              const isBullish = match.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
              ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.restore();
          },
          renderGPU: async () => {},
          onEvent: async (event: string, data: any) => {
            if (event === 'click' && 'x' in data) {
              const index = Math.floor(this.computeUnscaleX(data.x));
              const matches = await patternEngineGPU.compute();
              const match = matches.find(m => m.index === index);
              if (match) {
                console.log(`Clicked pattern at index ${index} (PatternEngineGPU): ${match.typeLabels.join(', ')}`);
              }
            }
          },
          destroy: () => {
            patternEngineGPU.dispose();
          },
        });
      }).catch(error => {
        console.error(`PatternEngineGPU initialization failed: ${error.message}`);
      });
    }

    if (this.indicators.patternEngineNextGen) {
      this.plugins.register({
        name: 'PatternEngineNextGen',
        priority: 3,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          const result = computePatternEngineNextGen(candles);
          result.clusters.forEach(cluster => {
            const x = this.computeScaleX(cluster.index);
            const y = this.computeScaleY(candles[cluster.index].close);
            ctx.fillStyle = cluster.clusterType === 'Bullish Momentum Cluster' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 5 * cluster.confidenceScore, 0, Math.PI * 2);
            ctx.fill();
          });
          result.structures.forEach(structure => {
            const x = this.computeScaleX(structure.index);
            const y = this.computeScaleY(structure.type === 'Swing High' ? candles[structure.index].high : candles[structure.index].low);
            ctx.fillStyle = structure.strength === 'Major' ? 'rgba(255, 165, 0, 0.8)' : 'rgba(255, 165, 0, 0.4)';
            ctx.fillRect(x - 3, y - 3, 6, 6);
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(this.computeUnscaleX(data.x));
            const result = computePatternEngineNextGen(candles);
            const cluster = result.clusters.find(c => c.index === index);
            const structure = result.structures.find(s => s.index === index);
            const embedding = result.embeddings.find(e => e.index === index);
            if (cluster || structure || embedding) {
              console.log(`Clicked pattern at index ${index} (PatternEngineNextGen):`, {
                cluster: cluster ? `${cluster.clusterType} (Confidence: ${cluster.confidenceScore})` : null,
                structure: structure ? `${structure.type} (${structure.strength})` : null,
                embedding: embedding ? `Similar to ${embedding.similarTo}` : null,
              });
            }
          }
        },
      });
    }

    if (this.indicators.patternWorker) {
      this.plugins.register({
        name: 'PatternWorker',
        priority: 4,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          workerResults.forEach(result => {
            const x = this.computeScaleX(result.index);
            const y = this.computeScaleY(candles[result.index].close);
            const isBullish = result.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
            ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(this.computeUnscaleX(data.x));
            const result = workerResults.find(r => r.index === index);
            if (result) {
              console.log(`Clicked pattern at index ${index} (PatternWorker): ${result.typeLabels.join(', ')}`);
            }
          }
        },
      });
    }

    if (this.indicators.patternOverlay) {
      this.plugins.register(createPatternOverlayPlugin({
        patterns: workerResults,
        scaleX: this.computeScaleX.bind(this),
        scaleY: this.computeScaleY.bind(this),
        candles,
        lodLevel: 1,
      }));
    }

    this.plugins.register(createDrawingToolsPlugin({
      tools: this.toolManager.getTools(),
      candles,
      scaleX: this.computeScaleX.bind(this),
      scaleY: this.computeScaleY.bind(this),
      unscaleX: this.computeUnscaleX.bind(this),
      unscaleY: this.computeUnscaleY.bind(this),
    }));
  }

  private computeScaleX(index: number): number {
    return (index - (this.timeScale.offset || 0)) * this.timeScale.candleWidth + this.timeScale.candleWidth / 2;
  }

  private computeScaleY(price: number): number {
    const range = this.priceScale.maxPrice - this.priceScale.minPrice;
    return this.height - ((price - this.priceScale.minPrice) / range) * this.height;
  }

  private computeUnscaleX(x: number): number {
    return Math.round(x / this.timeScale.candleWidth + (this.timeScale.offset || 0));
  }

  private computeUnscaleY(y: number): number {
    const range = this.priceScale.maxPrice - this.priceScale.minPrice;
    return this.priceScale.minPrice + ((this.height - y) / this.height) * range;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('ChartEngineCore already initialized');
      return;
    }

    this.updateCanvasDimensions();
    try {
      if (this.useGPU && this.device) {
        await this.plugins.initializeGPU(this.device);
      }
      if (this.options.config) {
        await this.init(this.options.config);
      }
      this.plugins.initialize2D(this.canvas.getContext('2d')!);
      this.isInitialized = true;
      this.startLoop();
      this.context.emit?.('initialized', {});
    } catch (error) {
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private updateCanvasDimensions(): void {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.offscreenCanvas!.width = this.canvas.width;
    this.offscreenCanvas!.height = this.canvas.height;
    this.renderer.setCanvasSize(this.width, this.height);
  }

  private startLoop(): void {
    const loop = throttle(() => {
      if (!this.isPaused && this.isInitialized) {
        this.render();
      }
      this.animationFrame = requestAnimationFrame(loop);
    }, 16);
    loop();
  }

  private render(): void {
    if (!this.isInitialized || !this.currentConfig) {
      console.warn('Cannot render: ChartEngineCore not initialized or no config');
      return;
    }
    try {
      const ctx = this.offscreenCanvas!.getContext('2d')!;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const candles = this.currentConfig.candles.filter(candle => candle.isFinal !== false);
      this.renderer.renderCandles(
        candles,
        ctx,
        this.timeScale,
        this.priceScale,
        this.computeScaleX.bind(this),
        this.computeScaleY.bind(this)
      );
      this.toolManager.renderTools(ctx);
      this.plugins.render2D(ctx);
      if (this.useGPU && this.device) {
        // Placeholder for GPU rendering
      }
      this.canvas.getContext('2d')!.drawImage(this.offscreenCanvas!, 0, 0);
    } catch (error) {
      console.error(`Render failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

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
    if (symbol !== undefined && typeof symbol !== 'string') throw new Error('Invalid symbol');
    if (timeframe !== undefined && typeof timeframe !== 'string') throw new Error('Invalid timeframe');
    if (isFinal !== undefined && typeof isFinal !== 'boolean') throw new Error('Invalid isFinal');
  }

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
      const config: ChartConfig = { candles: data.candles, symbol, timeframe };
      return config;
    } catch (error) {
      throw new Error(`Failed to fetch chart data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async init(urlOrConfig: string | ChartConfig): Promise<void> {
    const config = typeof urlOrConfig === 'string' ? await this.fetchData(urlOrConfig) : urlOrConfig;
    validateChartConfig(config);
    this.currentConfig = config;
    this.currentSymbol = config.symbol || null;
    this.currentTimeframe = config.timeframe || null;
    this.updateGUI();
    this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    this.renderer.renderCandles(
      config.candles,
      this.canvas.getContext('2d')!,
      this.timeScale,
      this.priceScale,
      this.computeScaleX.bind(this),
      this.computeScaleY.bind(this)
    );
    this.setupPlugins();
    this.plugins.initialize2D(this.canvas.getContext('2d')!);
    this.eventManager.setChartMode(this.isChartMode);
    this.toolManager.setChartMode(this.isChartMode);
    this.context.emit?.('chartInitialized', { config });
  }

  render(config: ChartConfig): void {
    validateChartConfig(config);
    this.currentConfig = config;
    if (config.symbol !== this.currentSymbol || config.timeframe !== this.currentTimeframe) {
      this.currentSymbol = config.symbol || null;
      this.currentTimeframe = config.timeframe || null;
      this.updateGUI();
      this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    }
    this.renderer.renderCandles(
      config.candles,
      this.canvas.getContext('2d')!,
      this.timeScale,
      this.priceScale,
      this.computeScaleX.bind(this),
      this.computeScaleY.bind(this)
    );
    this.setupPlugins();
    this.plugins.render2D(this.canvas.getContext('2d')!);
    this.context.emit?.('chartRendered', { config });
  }

  update(config: ChartConfig): void {
    validateChartConfig(config);
    this.currentConfig = config;
    if (config.symbol !== this.currentSymbol || config.timeframe !== this.currentTimeframe) {
      this.currentSymbol = config.symbol || null;
      this.currentTimeframe = config.timeframe || null;
      this.updateGUI();
      this.context.emit?.('metadataUpdated', { symbol: this.currentSymbol, timeframe: this.currentTimeframe });
    }
    this.renderer.updateCandles(
      config.candles,
      this.canvas.getContext('2d')!,
      this.timeScale,
      this.priceScale,
      this.computeScaleX.bind(this),
      this.computeScaleY.bind(this)
    );
    this.setupPlugins();
    this.plugins.render2D(this.canvas.getContext('2d')!);
    this.context.emit?.('chartUpdated', { config });
  }

  addPlugin(plugin: ChartPlugin): void {
    this.plugins.register(plugin);
    this.context.emit?.('pluginAdded', { plugin });
  }

  addEventListener(type: string, callback: Function): void {
    this.eventManager.on(type as any, callback as any);
    this.context.emit?.('eventListenerAdded', { type });
  }

  setChartMode(isChartMode: boolean): void {
    this.isChartMode = isChartMode;
    this.eventManager.setChartMode(isChartMode);
    this.toolManager.setChartMode(isChartMode);
    this.context.emit?.('modeChanged', { isChartMode });
  }

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

    if (options.indicators) {
      this.indicators = { ...this.indicators, ...options.indicators };
      this.setupPlugins();
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

  undo(): void {
    if (this.undoStack.length <= 1) return;
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);
    const previousState = this.undoStack[this.undoStack.length - 1];
    this.toolManager.deserializeTools(JSON.stringify(previousState.tools));
    this.context.emit?.('undo', { tools: previousState.tools });
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const nextState = this.redoStack.pop()!;
    this.undoStack.push(nextState);
    this.toolManager.deserializeTools(JSON.stringify(nextState.tools));
    this.context.emit?.('redo', { tools: nextState.tools });
  }

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

  pause(): void {
    this.isPaused = true;
    this.context.emit?.('paused', {});
  }

  resume(): void {
    this.isPaused = false;
    this.context.emit?.('resumed', {});
  }

  destroy(): void {
    if (!this.isInitialized) return;

    cancelAnimationFrame(this.animationFrame);
    this.eventManager.detach();
    this.plugins.destroy();
    this.toolManager.destroy();
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
