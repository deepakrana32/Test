import { ChartWidget } from './ChartWidget';
import { PriceScaleEngine } from './PriceScaleEngine';
import { TimeScaleEngine } from './TimeScaleEngine';
import { CrosshairManager } from './CrosshairManager';
import { DataManager } from './DataManager';
import { AnimationManager } from './AnimationManager';
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
import { ChartPlugins } from './ChartPlugins';
import { PatternRenderer } from './PatternRenderer';

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

    // Initialize core components
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute('aria-label', 'Financial chart');
    container.appendChild(canvas);

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
    const animationManager = new AnimationManager(timeScaleEngine, priceScaleEngine);
    const tooltipManager = new TooltipManager(priceScaleEngine, timeScaleEngine, styleManager.getTooltipOptions());
    const gestureManager = new GestureManager(canvas, timeScaleEngine, priceScaleEngine, animationManager);
    const interactionManager = new InteractionManager(
      { canvas } as ChartWidget,
      crosshairManager,
      timeScaleEngine,
      priceScaleEngine,
      animationManager,
      styleManager
    );

    const chartPlugins = new ChartPlugins();
    const indicatorRenderer = new IndicatorRenderer(chartPlugins, styleManager, canvas);
    const patternRenderer = new PatternRenderer();
    const patternManager = new PatternManager(patternRenderer);
    const indicatorConfig = new IndicatorConfig({ addIndicator: () => {}, removeIndicator: () => {}, activeIndicators: [] } as IndicatorManager, styleManager);
    const pluginManager = new PluginManager(chartPlugins, errorHandler);

    const chartState = new ChartState(timeScaleEngine, priceScaleEngine, { addIndicator: () => {}, removeIndicator: () => {}, activeIndicators: [] } as IndicatorManager);
    const exportManager = new ExportManager({ canvas } as ChartWidget, styleManager);
    const chartLayout = new ChartLayout(container, styleManager);
    const themeEditor = new ThemeEditor(styleManager);

    // Initialize ChartWidget
    const widget = new ChartWidget(canvas);
    chartLayout.addChart(widget, crosshairManager, timeScaleEngine);

    // Connect data flow
    dataManager.onData((candles, ticks) => {
      const validatedCandles = dataValidator.validateCandles(candles);
      const validatedTicks = dataValidator.validateTicks(ticks);
      crosshairManager.setData(validatedCandles, validatedTicks);
      tooltipManager.setData(validatedCandles, validatedTicks);
      patternManager.setCandles(validatedCandles);
      analyticsTracker.trackInteraction('data_update');
    });

    chartHistory.onData((candles, ticks) => {
      dataManager.setData(candles, ticks);
    });

    // Apply accessibility
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', `Chart container initialized at ${localizationManager.formatTime(Date.now())}`);

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
