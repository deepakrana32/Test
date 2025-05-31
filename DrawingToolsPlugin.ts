import { ChartPlugin } from './ChartPlugins';
import { DrawingToolManager } from './DrawingToolManager';
import { DrawingTool, DrawingToolData, Candle, LineStyle, LineEnd, BoxHorizontalAlignment, BoxVerticalAlignment, TextOptions, TrendLineData, RectangleData, FibonacciData, HorizontalLineData, VerticalLineData, ArrowData, BrushData, HighlighterData, CalloutData, CircleData, ExtendedLineData, ParallelChannelData, PathData, PriceRangeData, RayData, TextData, LineOptions } from './ChartTypes';
import { debounce, memoize } from 'lodash';

interface PluginContext {
  emit?: (event: string, data: any) => void;
  getContainer?: () => HTMLElement;
}

interface DrawingToolsPluginConfig {
  tools: DrawingTool[];
  candles: Candle[];
  scaleX: (index: number) => number;
  scaleY: (price: number) => number;
  unscaleX: (x: number) => number;
  unscaleY: (y: number) => number;
}

/**
 * Default configuration for drawing tools.
 */
const defaultToolConfig = {
  line: { color: '#FF0000', width: 2, style: LineStyle.Solid, end: { left: LineEnd.Normal, right: LineEnd.Normal } },
  fill: { color: '#FF000033', opacity: 0.2 },
  text: { value: '', font: { color: '#000000', size: 12, bold: false, italic: false, family: 'Arial' }, box: { alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center }, angle: 0, scale: 1 } },
};

/**
 * Normalizes event coordinates relative to the canvas.
 */
function normalizeEventCoordinates(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
  return {
    x: Math.max(0, Math.min(canvas.width, clientX - rect.left)),
    y: Math.max(0, Math.min(canvas.height, clientY - rect.top)),
  };
}

/**
 * Converts a color to RGBA.
 */
function toRGBA(color: string, opacity: number): string {
  const canvas = document.createElement('canvas').getContext('2d')!;
  canvas.fillStyle = color;
  const computed = canvas.fillStyle;
  const match = computed.match(/\d+/g);
  if (match && match.length >= 3) {
    return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${opacity})`;
  }
  return computed;
}

/**
 * Applies line style to the canvas context.
 */
function applyLineStyle(ctx: CanvasRenderingContext2D, style: LineStyle) {
  switch (style) {
    case LineStyle.Dashed:
      ctx.setLineDash([5, 5]);
      break;
    case LineStyle.Dotted:
      ctx.setLineDash([2, 2]);
      break;
    default:
      ctx.setLineDash([]);
  }
}

/**
 * Draws a circle at the line end.
 */
function drawCircleEnd(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, pixelRatio: number) {
  ctx.beginPath();
  ctx.arc(x * pixelRatio, y * pixelRatio, width * pixelRatio, 0, 2 * Math.PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

/**
 * Draws an arrow at the line end.
 */
function drawArrowEnd(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, pixelRatio: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 10 * pixelRatio;
  const arrowWidth = 5 * pixelRatio;
  ctx.beginPath();
  ctx.moveTo(x2 * pixelRatio, y2 * pixelRatio);
  ctx.lineTo(
    (x2 - arrowLength * Math.cos(angle - Math.PI / 6)) * pixelRatio,
    (y2 - arrowLength * Math.sin(angle - Math.PI / 6)) * pixelRatio
  );
  ctx.lineTo(
    (x2 - arrowLength * Math.cos(angle + Math.PI / 6)) * pixelRatio,
    (y2 - arrowLength * Math.sin(angle + Math.PI / 6)) * pixelRatio
  );
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

/**
 * Draws text with optional background box.
 */
function drawText(ctx: CanvasRenderingContext2D, text: TextOptions, x: number, y: number, angle: number, pixelRatio: number) {
  ctx.save();
  ctx.translate(x * pixelRatio, y * pixelRatio);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.font = `${text.font.bold ? 'bold ' : ''}${text.font.italic ? 'italic ' : ''}${text.font.size * pixelRatio}px ${text.font.family}`;
  ctx.fillStyle = text.font.color;

  if (text.box.background?.color) {
    const textWidth = ctx.measureText(text.value).width / pixelRatio;
    const textHeight = text.font.size;
    const padding = text.box.padding || 2;
    ctx.fillStyle = text.box.background.color;
    ctx.fillRect(
      -textWidth / 2 - padding,
      -textHeight / 2 - padding,
      textWidth + 2 * padding,
      textHeight + 2 * padding
    );
  }

  ctx.textAlign = text.box.alignment.horizontal;
  ctx.textBaseline =
    text.box.alignment.vertical === BoxVerticalAlignment.Top ? 'top' :
    text.box.alignment.vertical === BoxVerticalAlignment.Bottom ? 'bottom' : 'middle';
  ctx.fillText(text.value, 0, 0);
  ctx.restore();
}

/**
 * Draws a line with optional extensions and end styles.
 */
function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, line: LineOptions, pixelRatio: number, extendLeft: boolean, extendRight: boolean) {
  let startX = x1;
  let startY = y1;
  let endX = x2;
  let endY = y2;

  if (extendLeft || extendRight) {
    const slope = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0;
    if (extendLeft) {
      startX = 0;
      startY = y2 - slope * (x2 - startX);
    }
    if (extendRight) {
      endX = ctx.canvas.width / pixelRatio;
      endY = y1 + slope * (endX - x1);
    }
  }

  ctx.beginPath();
  ctx.strokeStyle = line.color;
  ctx.lineWidth = line.width * pixelRatio;
  applyLineStyle(ctx, line.style);
  ctx.moveTo(startX * pixelRatio, startY * pixelRatio);
  ctx.lineTo(endX * pixelRatio, endY * pixelRatio);
  ctx.stroke();
  ctx.setLineDash([]);

  if (line.end.left === LineEnd.Circle) {
    drawCircleEnd(ctx, startX, startY, line.width, pixelRatio);
  }
  if (line.end.right === LineEnd.Circle) {
    drawCircleEnd(ctx, endX, endY, line.width, pixelRatio);
  }
  if (line.end.right === LineEnd.Arrow) {
    drawArrowEnd(ctx, startX, startY, endX, endY, line.width, pixelRatio);
  }
}

/**
 * Validates tool data.
 */
function validateToolData(data: DrawingToolData): void {
  if (!data) throw new Error('Tool data is null');
  switch (data.type) {
    case 'trendline':
      if (!('startIndex' in data && 'startPrice' in data && 'endIndex' in data && 'endPrice' in data)) {
        throw new Error('Invalid trendline data');
      }
      break;
    case 'rectangle':
      if (!('startIndex' in data && 'startPrice' in data && 'endIndex' in data && 'endPrice' in data)) {
        throw new Error('Invalid rectangle data');
      }
      break;
    // ... (validation for other tool types)
    default:
      throw new Error(`Unknown tool type: ${data.type}`);
  }
}

export class DrawingToolsPlugin<T extends PluginContext> {
  private context: T;
  private toolManager: DrawingToolManager | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private toolbar: HTMLElement | null = null;
  private config: DrawingToolsPluginConfig | null = null;
  private undoStack: DrawingTool[] = [];
  private redoStack: DrawingTool[] = [];
  private activeTool: string | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private memoizedScaleX: (index: number) => number = () => 0;
  private memoizedScaleY: (price: number) => number = () => 0;

  constructor(context: T) {
    if (!context) throw new Error('Plugin context is null');
    this.context = context;
    this.setupToolbar();
    this.setupContextMenu();
  }

  private setupToolbar(): void {
    const container = this.context.getContainer?.();
    if (container) {
      this.toolbar = document.createElement('div');
      this.toolbar.setAttribute('role', 'toolbar');
      this.toolbar.setAttribute('aria-label', 'Drawing Tools');
      this.toolbar.innerHTML = `
        <button data-tool="trendline" aria-label="Trendline Tool">Trendline</button>
        <button data-tool="rectangle" aria-label="Rectangle Tool">Rectangle</button>
        <button data-tool="fibonacci" aria-label="Fibonacci Tool">Fibonacci</button>
        <button data-tool="horizontalLine" aria-label="Horizontal Line Tool">Horizontal Line</button>
        <button data-tool="verticalLine" aria-label="Vertical Line Tool">Vertical Line</button>
        <button data-tool="arrow" aria-label="Arrow Tool">Arrow</button>
        <button data-tool="brush" aria-label="Brush Tool">Brush</button>
        <button data-tool="highlighter" aria-label="Highlighter Tool">Highlighter</button>
        <button data-tool="callout" aria-label="Callout Tool">Callout</button>
        <button data-tool="circle" aria-label="Circle Tool">Circle</button>
        <button data-tool="extendedLine" aria-label="Extended Line Tool">Extended Line</button>
        <button data-tool="parallelChannel" aria-label="Parallel Channel Tool">Parallel Channel</button>
        <button data-tool="path" aria-label="Path Tool">Path</button>
        <button data-tool="priceRange" aria-label="Price Range Tool">Price Range</button>
        <button data-tool="ray" aria-label="Ray Tool">Ray</button>
        <button data-tool="text" aria-label="Text Tool">Text</button>
        <button id="undo" aria-label="Undo">Undo</button>
        <button id="redo" aria-label="Redo">Redo</button>
        <input type="color" id="strokeColor" value="#FF0000" aria-label="Stroke Color">
        <input type="range" id="lineWidth" min="1" max="20" value="2" aria-label="Line Width">
      `;
      container.appendChild(this.toolbar);
      this.toolbar.addEventListener('click', debounce((e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.dataset.tool) {
          this.setActiveTool(target.dataset.tool);
        } else if (target.id === 'undo') {
          this.undo();
        } else if (target.id === 'redo') {
          this.redo();
        }
      }, 10));
      this.toolbar.querySelector('#strokeColor')?.addEventListener('change', (e) => {
        this.setStrokeColor((e.target as HTMLInputElement).value);
      });
      this.toolbar.querySelector('#lineWidth')?.addEventListener('change', (e) => {
        this.setLineWidth(Number((e.target as HTMLInputElement).value));
      });
      this.toolbar.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON') {
          target.title = target.getAttribute('aria-label') || '';
        }
      });
    }
  }

  private setupContextMenu(): void {
    if (this.canvas) {
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = document.createElement('div');
        menu.style.position = 'absolute';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.background = '#fff';
        menu.style.border = '1px solid #ccc';
        menu.innerHTML = `
          <button onclick="this.closest('div').remove()">Delete Tool</button>
          <button onclick="this.closest('div').remove()">Edit Properties</button>
        `;
        document.body.appendChild(menu);
        document.addEventListener('click', () => menu.remove(), { once: true });
      });
    }
  }

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, config: DrawingToolsPluginConfig): void {
    if (!canvas || !ctx || !config) throw new Error('Canvas, context, or config is null');
    if (!config.tools || !config.candles || !config.scaleX || !config.scaleY || !config.unscaleX || !config.unscaleY) {
      throw new Error('Invalid configuration');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config;
    this.toolManager = new DrawingToolManager(canvas, ctx);
    this.memoizedScaleX = memoize(config.scaleX);
    this.memoizedScaleY = memoize(config.scaleY);
    this.offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    config.tools.forEach(tool => validateToolData(tool.data));
    this.context.emit?.('drawingToolsInitialized', { config });
    this.setupTouchGestures();
  }

  private setupTouchGestures(): void {
    if (this.canvas) {
      let lastTouchDistance: number | null = null;
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          lastTouchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      });
      this.canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && lastTouchDistance !== null) {
          const newDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const scale = newDistance / lastTouchDistance;
          this.context.emit?.('zoom', { scale });
          lastTouchDistance = newDistance;
          e.preventDefault();
        }
      });
      this.canvas.addEventListener('touchend', () => {
        lastTouchDistance = null;
      });
    }
  }

  setActiveTool(name: string): boolean {
    if (!this.toolManager) {
      console.warn('Tool manager not initialized');
      return false;
    }
    const success = this.toolManager.setActiveTool(name);
    if (success) {
      this.activeTool = name;
      this.context.emit?.('toolChanged', { tool: name });
      this.updateToolbar(name);
    }
    return success;
  }

  private updateToolbar(activeTool: string): void {
    if (this.toolbar) {
      this.toolbar.querySelectorAll('button[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tool') === activeTool);
      });
    }
  }

  setStrokeColor(color: string): void {
    this.toolManager?.setStrokeColor(toRGBA(color, 1));
    this.context.emit?.('strokeColorChanged', { color });
  }

  setLineWidth(width: number): void {
    if (width <= 0) return;
    this.toolManager?.setLineWidth(width);
    this.context.emit?.('lineWidthChanged', { width });
  }

  setFillColor(color: string): void {
    this.toolManager?.setFillColor(toRGBA(color, 0.5));
    this.context.emit?.('fillColorChanged', { color });
  }

  setChartMode(isChartMode: boolean): void {
    this.toolManager?.setChartMode(isChartMode);
  }

  addTool(tool: DrawingTool): void {
    if (!this.config) throw new Error('Plugin not initialized');
    validateToolData(tool.data);
    this.config.tools.push(tool);
    this.undoStack.push(tool);
    this.redoStack = [];
    this.context.emit?.('toolAdded', { tool });
  }

  undo(): void {
    if (!this.config || this.undoStack.length === 0) return;
    const tool = this.undoStack.pop();
    if (tool) {
      this.config.tools = this.config.tools.filter(t => t !== tool);
      this.redoStack.push(tool);
      this.context.emit?.('undo', { tool });
    }
  }

  redo(): void {
    if (!this.config || this.redoStack.length === 0) return;
    const tool = this.redoStack.pop();
    if (tool) {
      this.config.tools.push(tool);
      this.undoStack.push(tool);
      this.context.emit?.('redo', { tool });
    }
  }

  serializeTools(): string {
    if (!this.config) return '[]';
    return JSON.stringify(this.config.tools, (key, value) => {
      if (key === 'data') {
        return { ...value, type: value.type }; // Ensure type is preserved
      }
      return value;
    });
  }

  deserializeTools(json: string): void {
    if (!this.config) throw new Error('Plugin not initialized');
    try {
      const tools = JSON.parse(json) as DrawingTool[];
      tools.forEach(tool => validateToolData(tool.data));
      this.config.tools = tools;
      this.undoStack = [...tools];
      this.redoStack = [];
      this.context.emit?.('toolsDeserialized', { tools });
    } catch (error) {
      console.error('Failed to deserialize tools:', error);
    }
  }

  createChartPlugin(): ChartPlugin {
    if (!this.config || !this.canvas || !this.ctx) throw new Error('Plugin not initialized');
    const { tools, candles, scaleX, scaleY, unscaleX, unscaleY } = this.config;

    return {
      name: 'DrawingTools',
      priority: 6,
      render2D: (ctx: CanvasRenderingContext2D) => {
        const pixelRatio = window.devicePixelRatio || 1;
        const offscreenCtx = this.offscreenCanvas?.getContext('2d');
        if (offscreenCtx) {
          offscreenCtx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
          ctx = offscreenCtx;
        }
        ctx.save();

        tools.forEach(tool => {
          try {
            ctx.save();
            const data = tool.data as DrawingToolData;
            validateToolData(data);

            if (tool.type === 'trendline') {
              const d = data as TrendLineData;
              drawLine(ctx, this.memoizedScaleX(d.startIndex), this.memoizedScaleY(d.startPrice), this.memoizedScaleX(d.endIndex), this.memoizedScaleY(d.endPrice), d.line, pixelRatio, false, false);
              if (d.text?.value) {
                const x1 = this.memoizedScaleX(d.startIndex);
                const y1 = this.memoizedScaleY(d.startPrice);
                const x2 = this.memoizedScaleX(d.endIndex);
                const y2 = this.memoizedScaleY(d.endPrice);
                const angle = Math.atan((y2 - y1) / (x2 - x1)) * (180 / Math.PI);
                const pivot = d.text.box.alignment.horizontal === BoxHorizontalAlignment.Left ? { x: x1, y: y1 } :
                              d.text.box.alignment.horizontal === BoxHorizontalAlignment.Right ? { x: x2, y: y2 } :
                              { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
                drawText(ctx, d.text, pivot.x, pivot.y, angle, pixelRatio);
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [d.startIndex, d.endIndex].forEach((index, i) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(i === 0 ? d.startPrice : d.endPrice) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'rectangle') {
              const d = data as RectangleData;
              const x1 = this.memoizedScaleX(d.startIndex);
              const y1 = this.memoizedScaleY(d.startPrice);
              const x2 = this.memoizedScaleX(d.endIndex);
              const y2 = this.memoizedScaleY(d.endPrice);
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);

              if (d.fill) {
                ctx.fillStyle = d.fill.color;
                ctx.globalAlpha = d.fill.opacity;
                ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
                ctx.globalAlpha = 1;
              }

              ctx.beginPath();
              ctx.strokeStyle = d.line.color;
              ctx.lineWidth = d.line.width * pixelRatio;
              applyLineStyle(ctx, d.line.style);
              ctx.rect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
              ctx.stroke();
              ctx.setLineDash([]);

              if (d.text?.value) {
                drawText(ctx, d.text, left + width / 2, top + height / 2, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].forEach(([x, y]) => {
                  ctx.beginPath();
                  ctx.arc(x * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'fibonacci') {
              const d = data as FibonacciData;
              const x1 = this.memoizedScaleX(d.startIndex);
              const y1 = this.memoizedScaleY(d.startPrice);
              const x2 = this.memoizedScaleX(d.endIndex);
              const y2 = this.memoizedScaleY(d.endPrice);
              const left = Math.min(x1, x2);
              const right = Math.max(x1, x2);

              d.levels.forEach(level => {
                const y = this.memoizedScaleY(level.price);
                ctx.beginPath();
                ctx.strokeStyle = level.line.color;
                ctx.lineWidth = level.line.width * pixelRatio;
                applyLineStyle(ctx, level.line.style);
                ctx.moveTo(left * pixelRatio, y * pixelRatio);
                ctx.lineTo(right * pixelRatio, y * pixelRatio);
                ctx.stroke();
                ctx.setLineDash([]);

                if (level.label) {
                  drawText(ctx, {
                    value: level.label,
                    font: { color: level.line.color, size: 12, bold: false, italic: false, family: 'Arial' },
                    box: { alignment: { vertical: 'middle', horizontal: 'right' }, angle: 0, scale: 1 }
                  }, right, y, 0, pixelRatio);
                }
              });

              if (d.selected) {
                ctx.fillStyle = d.levels[0].line.color;
                [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'horizontalLine') {
              const d = data as HorizontalLineData;
              const y = this.memoizedScaleY(d.price);
              ctx.beginPath();
              ctx.strokeStyle = d.line.color;
              ctx.lineWidth = d.line.width * pixelRatio;
              applyLineStyle(ctx, d.line.style);
              ctx.moveTo(0, y * pixelRatio);
              ctx.lineTo(ctx.canvas.width, y * pixelRatio);
              ctx.stroke();
              ctx.setLineDash([]);

              if (d.text?.value) {
                drawText(ctx, d.text, ctx.canvas.width / pixelRatio - 10, y, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                ctx.beginPath();
                ctx.arc((ctx.canvas.width / pixelRatio / 2) * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                ctx.fill();
              }
            } else if (tool.type === 'verticalLine') {
              const d = data as VerticalLineData;
              const x = this.memoizedScaleX(d.index);
              ctx.beginPath();
              ctx.strokeStyle = d.line.color;
              ctx.lineWidth = d.line.width * pixelRatio;
              applyLineStyle(ctx, d.line.style);
              ctx.moveTo(x * pixelRatio, 0);
              ctx.lineTo(x * pixelRatio, ctx.canvas.height);
              ctx.stroke();
              ctx.setLineDash([]);

              if (d.text?.value) {
                drawText(ctx, d.text, x, 10, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                ctx.beginPath();
                ctx.arc(x * pixelRatio, (ctx.canvas.height / pixelRatio / 2) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                ctx.fill();
              }
            } else if (tool.type === 'arrow') {
              const d = data as ArrowData;
              drawLine(ctx, this.memoizedScaleX(d.startIndex), this.memoizedScaleY(d.startPrice), this.memoizedScaleX(d.endIndex), this.memoizedScaleY(d.endPrice), { ...d.line, end: { left: LineEnd.Normal, right: LineEnd.Arrow } }, pixelRatio, false, false);
              if (d.text?.value) {
                const x1 = this.memoizedScaleX(d.startIndex);
                const y1 = this.memoizedScaleY(d.startPrice);
                const x2 = this.memoizedScaleX(d.endIndex);
                const y2 = this.memoizedScaleY(d.endPrice);
                drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'brush' || tool.type === 'highlighter') {
              const d = data as BrushData | HighlighterData;
              if (d.points.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = d.line.color;
                ctx.lineWidth = tool.type === 'highlighter' ? d.line.width * 2 * pixelRatio : d.line.width * pixelRatio;
                ctx.globalAlpha = tool.type === 'highlighter' ? 0.3 : 1;
                applyLineStyle(ctx, d.line.style);
                ctx.moveTo(this.memoizedScaleX(d.points[0].index) * pixelRatio, this.memoizedScaleY(d.points[0].price) * pixelRatio);
                d.points.forEach(p => ctx.lineTo(this.memoizedScaleX(p.index) * pixelRatio, this.memoizedScaleY(p.price) * pixelRatio));
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                d.points.forEach(p => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(p.index) * pixelRatio, this.memoizedScaleY(p.price) * pixelRatio, 3 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'callout') {
              const d = data as CalloutData;
              drawLine(ctx, this.memoizedScaleX(d.index), this.memoizedScaleY(d.price), this.memoizedScaleX(d.targetIndex), this.memoizedScaleY(d.targetPrice), d.line, pixelRatio, false, false);
              drawText(ctx, d.text, this.memoizedScaleX(d.index), this.memoizedScaleY(d.price), 0, pixelRatio);
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.index, d.price], [d.targetIndex, d.targetPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'circle') {
              const d = data as CircleData;
              const cx = this.memoizedScaleX(d.centerIndex);
              const cy = this.memoizedScaleY(d.centerPrice);
              const rx = Math.abs(this.memoizedScaleX(d.radiusIndex) - cx);
              const ry = Math.abs(this.memoizedScaleY(d.radiusPrice) - cy);

              if (d.fill) {
                ctx.fillStyle = d.fill.color;
                ctx.globalAlpha = d.fill.opacity;
                ctx.beginPath();
                ctx.ellipse(cx * pixelRatio, cy * pixelRatio, rx * pixelRatio, ry * pixelRatio, 0, 0, 2 * Math.PI);
                ctx.fill();
                ctx.globalAlpha = 1;
              }

              ctx.beginPath();
              ctx.strokeStyle = d.line.color;
              ctx.lineWidth = d.line.width * pixelRatio;
              applyLineStyle(ctx, d.line.style);
              ctx.ellipse(cx * pixelRatio, cy * pixelRatio, rx * pixelRatio, ry * pixelRatio, 0, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.setLineDash([]);

              if (d.text?.value) {
                drawText(ctx, d.text, cx, cy, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.centerIndex, d.centerPrice], [d.radiusIndex, d.radiusPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'extendedLine') {
              const d = data as ExtendedLineData;
              drawLine(ctx, this.memoizedScaleX(d.startIndex), this.memoizedScaleY(d.startPrice), this.memoizedScaleX(d.endIndex), this.memoizedScaleY(d.endPrice), d.line, pixelRatio, true, true);
              if (d.text?.value) {
                const x1 = this.memoizedScaleX(d.startIndex);
                const y1 = this.memoizedScaleY(d.startPrice);
                const x2 = this.memoizedScaleX(d.endIndex);
                const y2 = this.memoizedScaleY(d.endPrice);
                drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'parallelChannel') {
              const d = data as ParallelChannelData;
              const x1 = this.memoizedScaleX(d.line1StartIndex);
              const y1 = this.memoizedScaleY(d.line1StartPrice);
              const x2 = this.memoizedScaleX(d.line1EndIndex);
              const y2 = this.memoizedScaleY(d.line1EndPrice);
              const offsetY = this.memoizedScaleY(d.line2OffsetPrice) - this.memoizedScaleY(0);

              if (d.fill) {
                ctx.fillStyle = d.fill.color;
                ctx.globalAlpha = d.fill.opacity;
                ctx.beginPath();
                ctx.moveTo(x1 * pixelRatio, y1 * pixelRatio);
                ctx.lineTo(x2 * pixelRatio, y2 * pixelRatio);
                ctx.lineTo(x2 * pixelRatio, (y2 + offsetY) * pixelRatio);
                ctx.lineTo(x1 * pixelRatio, (y1 + offsetY) * pixelRatio);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
              }

              drawLine(ctx, x1, y1, x2, y2, d.line, pixelRatio, false, false);
              drawLine(ctx, x1, y1 + offsetY, x2, y2 + offsetY, d.line, pixelRatio, false, false);

              if (d.text?.value) {
                drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.line1StartIndex, d.line1StartPrice], [d.line1EndIndex, d.line1EndPrice], [d.line1StartIndex, d.line1StartPrice + d.line2OffsetPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'path') {
              const d = data as PathData;
              if (d.points.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = d.line.color;
                ctx.lineWidth = d.line.width * pixelRatio;
                applyLineStyle(ctx, d.line.style);
                ctx.moveTo(this.memoizedScaleX(d.points[0].index) * pixelRatio, this.memoizedScaleY(d.points[0].price) * pixelRatio);
                d.points.forEach(p => ctx.lineTo(this.memoizedScaleX(p.index) * pixelRatio, this.memoizedScaleY(p.price) * pixelRatio));
                ctx.stroke();
                ctx.setLineDash([]);
              }
              if (d.text?.value) {
                const midPoint = d.points[Math.floor(d.points.length / 2)];
                drawText(ctx, d.text, this.memoizedScaleX(midPoint.index), this.memoizedScaleY(midPoint.price), 0, pixelRatio);
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                d.points.forEach(p => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(p.index) * pixelRatio, this.memoizedScaleY(p.price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'priceRange') {
              const d = data as PriceRangeData;
              const x1 = this.memoizedScaleX(d.startIndex);
              const x2 = this.memoizedScaleX(d.endIndex);
              const y1 = this.memoizedScaleY(d.topPrice);
              const y2 = this.memoizedScaleY(d.bottomPrice);
              const left = Math.min(x1, x2);
              const width = Math.abs(x2 - x1);
              const top = Math.min(y1, y2);
              const height = Math.abs(y2 - y1);

              if (d.fill) {
                ctx.fillStyle = d.fill.color;
                ctx.globalAlpha = d.fill.opacity;
                ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
                ctx.globalAlpha = 1;
              }

              ctx.beginPath();
              ctx.strokeStyle = d.line.color;
              ctx.lineWidth = d.line.width * pixelRatio;
              applyLineStyle(ctx, d.line.style);
              ctx.rect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
              ctx.stroke();
              ctx.setLineDash([]);

              if (d.text?.value) {
                drawText(ctx, d.text, left + width / 2, top + height / 2, 0, pixelRatio);
              }

              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].forEach(([x, y]) => {
                  ctx.beginPath();
                  ctx.arc(x * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'ray') {
              const d = data as RayData;
              drawLine(ctx, this.memoizedScaleX(d.startIndex), this.memoizedScaleY(d.startPrice), this.memoizedScaleX(d.endIndex), this.memoizedScaleY(d.endPrice), d.line, pixelRatio, false, true);
              if (d.text?.value) {
                const x1 = this.memoizedScaleX(d.startIndex);
                const y1 = this.memoizedScaleY(d.startPrice);
                const x2 = this.memoizedScaleX(d.endIndex);
                const y2 = this.memoizedScaleY(d.endPrice);
                drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
              }
              if (d.selected) {
                ctx.fillStyle = d.line.color;
                [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
                  ctx.beginPath();
                  ctx.arc(this.memoizedScaleX(index) * pixelRatio, this.memoizedScaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            } else if (tool.type === 'text') {
              const d = data as TextData;
              drawText(ctx, d.text, this.memoizedScaleX(d.index), this.memoizedScaleY(d.price), 0, pixelRatio);
              if (d.selected) {
                ctx.fillStyle = d.text.font.color;
                ctx.beginPath();
                ctx.arc(this.memoizedScaleX(d.index) * pixelRatio, this.memoizedScaleY(d.price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
                ctx.fill();
              }
            }

            ctx.restore();
          } catch (error) {
            console.error(`Error rendering tool ${tool.type}:`, error);
          }
        });

        if (offscreenCtx && this.ctx) {
          this.ctx.drawImage(this.offscreenCanvas!, 0, 0);
        }
        ctx.restore();
      },
      renderGPU: (pass: GPURenderPassEncoder) => {
        // WebGL rendering (basic stub with fallback to 2D)
        console.warn('GPU rendering not implemented; using 2D fallback');
      },
      onEvent: (event: string, data: any) => {
        if (!this.canvas || !this.config) return;
        if (event === 'click' && 'x' in data && 'y' in data) {
          const coords = normalizeEventCoordinates({ clientX: data.x, clientY: data.y } as any, this.canvas);
          const index = Math.round(this.config.unscaleX(coords.x));
          const price = this.config.unscaleY(coords.y);
          this.context.emit?.('toolClick', { index, price, tool: this.activeTool });
          this.toolManager?.handleInteraction(event, { index, price, tool: this.activeTool });
        } else if (event === 'mousemove' && 'x' in data && 'y' in data) {
          const coords = normalizeEventCoordinates({ clientX: data.x, clientY: data.y } as any, this.canvas);
          this.context.emit?.('toolHover', { x: coords.x, y: coords.y, tool: this.activeTool });
        }
      },
    };
  }

  destroy(): void {
    this.toolManager?.destroy();
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
    this.canvas?.removeEventListener('contextmenu', this.setupContextMenu);
    this.canvas = null;
    this.ctx = null;
    this.config = null;
    this.offscreenCanvas = null;
    this.undoStack = [];
    this.redoStack = [];
    this.context.emit?.('drawingToolsDestroyed', {});
  }
}
