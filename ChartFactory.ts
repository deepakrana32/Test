import { ChartWidget } from './ChartWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { CrosshairManager } from './CrosshairManager';
import { DataManager } from './DataManager';
import { KineticAnimation } from './KineticAnimation';
import { TooltipManager } from './TooltipManager';
import { StyleManager } from './StyleManager';
import { ChartState } from './ChartState';
import { ExportManager } from './ExportManager';
import { GestureManager } from './GestureManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { IndicatorRenderer } from './IndicatorRenderer';
import { PatternManager } from './PatternManager';
import { LocalizationManager } from './LocalizationManager';
import { ErrorHandler } from './ErrorHandler';
import { DataValidator } from './DataValidator';
import { ChartLayout } from './ChartLayout';
import { IndicatorConfig } from './IndicatorConfig';
import { PluginManager } from './PluginManager';
import { ChartHistory } from './ChartHistory';
import { InteractionManager } from './InteractionManager';
import { ThemeEditor } from './ThemeEditor';
import { AnalyticsTracker } from './AnalyticsTracker';
import { DrawingToolManager } from './DrawingToolManager';
import { PatternRenderer } from './PatternRenderer';
import { ChartOptions, Candle, Tick } from './ChartTypes';

interface ChartConfig {
  container: HTMLElement;
  width?: number;
  height?: number;
  theme?: string;
  locale?: string;
  timezone?: string;
  streamUrl?: string;
  historyUrl?: string;
}

export class ChartFactory {
  static createChart(config: ChartConfig): ChartWidget {
    const {
      container,
      width = 800,
      height = 400,
      theme = 'default',
      locale = 'en-IN',
      timezone = 'Asia/Kolkata',
      streamUrl = 'wss://data.example.com',
      historyUrl = 'https://api.example.com/history',
    } = config;

    if (!container) throw new Error('Container element required');

    // Initialize canvas
    const canvas = document.createElement('canvas');
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.setAttribute('aria-label', 'Financial chart');
    container.appendChild(canvas);

    // Initialize core components
    const styleManager = new StyleManager();
    styleManager.setTheme(theme);

    const errorHandler = new ErrorHandler(styleManager);
    const localizationManager = new LocalizationManager(locale, timezone);
    const performanceMonitor = new PerformanceMonitor();
    const analyticsTracker = new AnalyticsTracker(performanceMonitor, errorHandler);
    const dataValidator = new DataValidator(errorHandler);
    const chartHistory = new ChartHistory(dataValidator, errorHandler, { apiUrl: historyUrl });
    const dataManager = new DataManager({ streamUrl });

    const priceScaleEngine = new PriceScaleEngine({ height, locale });
    const timeScaleEngine = new TimeScaleEngine({ locale, timezone });
    const crosshairManager = new CrosshairManager(priceScaleEngine, timeScaleEngine, styleManager.getCrosshairParams());

    // Initialize kinetic animation
    const kineticAnimation = new KineticAnimation((dx: number) => {
      widget.handleScroll(dx / timeScaleEngine.computeTimeScale().scaleX(1));
    });

    const tooltipManager = new TooltipManager(priceScaleEngine, timeScaleEngine, styleManager.getTooltipOptions());
    const gestureManager = new GestureManager(canvas, timeScaleEngine, priceScaleEngine, kineticAnimation);
    const interactionManager = new InteractionManager(
      { canvas } as ChartWidget,
      crosshairManager,
      timeScaleEngine,
      priceScaleEngine,
      kineticAnimation,
      styleManager
    );

    // Initialize drawing tool manager
    const drawingToolManager = new DrawingToolManager(
      canvas,
      canvas.getContext('2d')!,
      canvas.getContext('webgl2'),
      { canvas } as ChartWidget,
      crosshairManager,
      (tools) => widget['tools'] = tools,
      timeScaleEngine.computeTimeScale().scaleX,
      priceScaleEngine.computePriceScale().scaleY,
      timeScaleEngine.computeTimeScale().unscaleX,
      priceScaleEngine.computePriceScale().unscaleY,
      timeScaleEngine.timeToIndex,
      errorHandler,
      localizationManager,
      styleManager,
      kineticAnimation
    );

    const indicatorRenderer = new IndicatorRenderer(drawingToolManager, styleManager, canvas);
    const patternRenderer = new PatternRenderer();
    const patternManager = new PatternManager(patternRenderer);
    const indicatorConfig = new IndicatorConfig(
      { addIndicator: () => {}, removeIndicator: () => {}, activeIndicators: [] } as any,
      styleManager
    );
    const pluginManager = new PluginManager(drawingToolManager, errorHandler);

    const chartState = new ChartState(timeScaleEngine, priceScaleEngine, {
      addIndicator: () => {},
      removeIndicator: () => {},
      activeIndicators: [],
    } as any);
    const exportManager = new ExportManager({ canvas } as ChartWidget, styleManager);
    const chartLayout = new ChartLayout(container, styleManager);
    const themeEditor = new ThemeEditor(styleManager);

    // Initialize ChartWidget
    const chartOptions: Partial<ChartOptions> = {
      width,
      height,
      locale,
      timezone,
      priceScale: { height, locale },
      timeScale: { locale, timezone },
      crosshair: styleManager.getCrosshairParams(),
    };
    const widget = new ChartWidget(canvas);
    chartLayout.addChart(widget, crosshairManager, timeScaleEngine);

    // Connect data flow
    dataManager.onData((candles: Candle[], ticks: Tick[]) => {
      const validatedCandles = dataValidator.validateCandles(candles);
      const validatedTicks = dataValidator.validateTicks(ticks);
      crosshairManager.setData(validatedCandles, validatedTicks);
      tooltipManager.setData(validatedCandles, validatedTicks);
      patternManager.setCandles(validatedCandles);
      analyticsTracker.trackInteraction('data_update');
    });

    chartHistory.onData((candles: Candle[], ticks: Tick[]) => {
      dataManager.setData(candles, ticks);
    });

    // Apply accessibility
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', `Chart container initialized at ${localizationManager.formatTime(Date.now())}`);

    // Assign managers to widget for access
    widget['crosshairManager'] = crosshairManager;
    widget['drawingToolManager'] = drawingToolManager;
    widget['indicatorRenderer'] = indicatorRenderer;
    widget['tooltipManager'] = tooltipManager;
    widget['gestureManager'] = gestureManager;
    widget['interactionManager'] = interactionManager;

    return widget;
  }

  static destroyChart(widget: ChartWidget) {
    widget.destroy();
    const container = widget['canvas'].parentElement;
    if (container) {
      container.innerHTML = '';
    }
  }
}
