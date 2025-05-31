import { DrawingTool, DrawingToolData, LineOptions, TextOptions, Point, LineStyle, LineEnd, BoxHorizontalAlignment, BoxVerticalAlignment, TrendLineData, RectangleData, FibonacciData, HorizontalLineData, VerticalLineData, ArrowData, BrushData, HighlighterData, CalloutData, CircleData, ExtendedLineData, ParallelChannelData, PathData, PriceRangeData, RayData, TextData, Tick, CrosshairEvent } from './ChartTypes';
import { v4 as uuidv4 } from 'uuid';
import { debounce, memoize } from 'lodash';
import { CrosshairManager } from './CrosshairManager';
import { ChartWidget } from './ChartWidget';
import { KineticAnimation } from './KineticAnimation';
import { ErrorHandler } from './ErrorHandler';
import { LocalizationManager } from './LocalizationManager';
import { StyleManager } from './StyleManager';
import { drawLine, drawRect, drawText } from './canvas-utils';

const FIB_LEVELS = [
  { percent: '0.0%', level: 0 },
  { percent: '23.6%', level: 0.236 },
  { percent: '38.2%', level: 0.382 },
  { percent: '50.0%', level: 0.5 },
  { percent: '61.8%', level: 0.618 },
  { percent: '100.0%', level: 1 },
];

interface InteractionData {
  x: number;
  y: number;
  index: number;
  price: number;
  time: number;
  tool?: string | null;
}

const defaultLineOptions: LineOptions = {
  color: '#007bff',
  width: 2,
  style: LineStyle.Solid,
  end: { left: LineEnd.Normal, right: LineEnd.Normal },
  extend: { left: false, right: false },
};

const defaultTextOptions: TextOptions = {
  value: 'Label',
  font: { color: '#007bff', size: 12, bold: false, italic: false, family: 'Arial' },
  box: { alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center }, angle: 0, scale: 1, padding: 2 },
};

function normalizeEventCoordinates(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
  return {
    x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * devicePixelRatio)),
    y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * devicePixelRatio)),
  };
}

function validateToolData(data: DrawingToolData): void {
  if (!data || !data.id || typeof data.id !== 'string') throw new Error('Tool data or ID is missing');
  if (!data.type || !['trendline', 'rectangle', 'fibonacci', 'horizontalLine', 'verticalLine', 'arrow', 'brush', 'highlighter', 'callout', 'circle', 'extendedLine', 'parallelChannel', 'path', 'priceRange', 'ray', 'text'].includes(data.type)) {
    throw new Error(`Invalid tool type: ${data.type}`);
  }
  const validateNumber = (value: any, field: string) => {
    if (value !== undefined && !Number.isFinite(value)) throw new Error(`Invalid ${field} in ${data.type}`);
  };
  switch (data.type) {
    case 'trendline':
    case 'arrow':
    case 'extendedLine':
    case 'ray':
    case 'rectangle':
    case 'priceRange':
      validateNumber(data.startIndex, 'startIndex');
      validateNumber(data.startPrice, 'startPrice');
      validateNumber(data.endIndex, 'endIndex');
      validateNumber(data.endPrice, 'endPrice');
      break;
    case 'fibonacci':
      validateNumber(data.startIndex, 'startIndex');
      validateNumber(data.startPrice, 'startPrice');
      validateNumber(data.endIndex, 'endIndex');
      validateNumber(data.endPrice, 'endPrice');
      if (!Array.isArray(data.levels) || data.levels.some(l => !Number.isFinite(l.price))) throw new Error('Invalid fibonacci levels');
      break;
    case 'horizontalLine':
      validateNumber(data.price, 'price');
      break;
    case 'verticalLine':
      validateNumber(data.index, 'index');
      break;
    case 'brush':
    case 'highlighter':
    case 'path':
      if (!Array.isArray(data.points) || data.points.some(p => !Number.isFinite(p.index) || !Number.isFinite(p.price))) {
        throw new Error(`Invalid points in ${data.type}`);
      }
      break;
    case 'callout':
      validateNumber(data.index, 'index');
      validateNumber(data.price, 'price');
      validateNumber(data.targetIndex, 'targetIndex');
      validateNumber(data.targetPrice, 'targetPrice');
      break;
    case 'circle':
      validateNumber(data.centerIndex, 'centerIndex');
      validateNumber(data.centerPrice, 'centerPrice');
      validateNumber(data.radiusIndex, 'radiusIndex');
      validateNumber(data.radiusPrice, 'radiusPrice');
      break;
    case 'parallelChannel':
      validateNumber(data.line1StartIndex, 'line1StartIndex');
      validateNumber(data.line1StartPrice, 'line1StartPrice');
      validateNumber(data.line1EndIndex, 'line1EndIndex');
      validateNumber(data.line1EndPrice, 'line1EndPrice');
      validateNumber(data.line2OffsetPrice, 'line2OffsetPrice');
      break;
    case 'text':
      validateNumber(data.index, 'index');
      validateNumber(data.price, 'price');
      if (typeof data.text?.value !== 'string') throw new Error('Invalid text value');
      break;
  }
  if (data.line) {
    if (!data.line.color || typeof data.line.color !== 'string') throw new Error(`Invalid line color in ${data.type}`);
    validateNumber(data.line.width, 'line.width');
  }
  if (data.text && data.text.value !== '') {
    if (!data.text.font || typeof data.text.font.color !== 'string' || !Number.isFinite(data.text.font.size)) {
      throw new Error(`Invalid text font in ${data.type}`);
    }
  }
}

export class DrawingToolManager {
  private tools: DrawingTool[];
  private setTools: (tools: DrawingTool[]) => void;
  private activeTool: string | null;
  private creatingTool: Partial<DrawingToolData> | null;
  private selectedToolId: string | null;
  private editingPoint: number | null;
  private isDrawing: boolean;
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private gl: WebGL2RenderingContext | null;
  private widget: ChartWidget | null;
  private crosshairManager: CrosshairManager | null;
  private kineticAnimation: KineticAnimation | null;
  private errorHandler: ErrorHandler;
  private localizationManager: LocalizationManager;
  private styleManager: StyleManager;
  private undoStack: DrawingTool[][] = [];
  private redoStack: DrawingTool[][] = [];
  private scaleX: (index: number) => number;
  private scaleY: (price: number) => number;
  private unscaleX: (x: number) => number;
  private unscaleY: (y: number) => number;
  private timeToIndex: (time: number) => number;
  private ticks: Float32Array | null;
  private highlightedToolId: string | null;
  private liveRegion: HTMLElement;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext | null,
    widget: ChartWidget,
    crosshairManager: CrosshairManager,
    setTools: (tools: DrawingTool[]) => void,
    scaleX: (index: number) => number,
    scaleY: (price: number) => number,
    unscaleX: (x: number) => number,
    unscaleY: (y: number) => number,
    timeToIndex: (time: number) => number,
    errorHandler: ErrorHandler,
    localizationManager: LocalizationManager,
    styleManager: StyleManager,
    kineticAnimation: KineticAnimation
  ) {
    if (!canvas || !ctx || !widget || !crosshairManager || !setTools || !errorHandler || !localizationManager || !styleManager || !kineticAnimation) {
      throw new Error('Missing dependencies');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.gl = gl;
    this.widget = widget;
    this.crosshairManager = crosshairManager;
    this.errorHandler = errorHandler;
    this.localizationManager = localizationManager;
    this.styleManager = styleManager;
    this.kineticAnimation = kineticAnimation;
    this.tools = [];
    this.setTools = setTools;
    this.activeTool = null;
    this.creatingTool = null;
    this.selectedToolId = null;
    this.editingPoint = null;
    this.isDrawing = false;
    this.scaleX = memoize(scaleX);
    this.scaleY = memoize(scaleY);
    this.unscaleX = unscaleX;
    this.unscaleY = unscaleY;
    this.timeToIndex = timeToIndex;
    this.ticks = null;
    this.highlightedToolId = null;
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-label', 'Drawing tool updates');
    document.body.appendChild(this.liveRegion);
    this.setupEventListeners();
    if (this.gl) this.setupWebGL();
  }

  private setupWebGL() {
    if (!this.gl) return;
    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;
    const program = this.gl.createProgram()!;
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(vs, vsSource);
    this.gl.shaderSource(fs, fsSource);
    this.gl.compileShader(vs);
    this.gl.compileShader(fs);
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    this.gl.useProgram(program);
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', debounce(this.handleMouseMove.bind(this), 5));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', debounce(this.handleTouchMove.bind(this), 5));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.crosshairManager?.onChange(this.handleCrosshair.bind(this));
  }

  setActiveTool(tool: string | null): boolean {
    const validTools = ['trendline', 'rectangle', 'fibonacci', 'horizontalLine', 'verticalLine', 'arrow', 'brush', 'highlighter', 'callout', 'circle', 'extendedLine', 'parallelChannel', 'path', 'priceRange', 'ray', 'text', 'select'];
    if (tool && !validTools.includes(tool)) {
      this.errorHandler.handleError(new Error(`Unknown tool: ${tool}`));
      return false;
    }
    this.activeTool = tool;
    this.creatingTool = null;
    this.selectedToolId = null;
    this.editingPoint = null;
    this.isDrawing = false;
    this.canvas!.style.cursor = tool && tool !== 'select' ? 'crosshair' : 'default';
    this.updateLiveRegion(`Active tool set to ${tool || 'none'}`);
    return true;
  }

  setStrokeColor(color: string): void {
    if (!/^#[0-9A-F]{6}$/i.test(color)) return;
    if (this.creatingTool && this.creatingTool.line) {
      this.creatingTool.line.color = color;
    }
    this.updateSelectedTool({ line: { color } });
    this.updateLiveRegion(`Stroke color set to ${color}`);
  }

  setLineWidth(width: number): void {
    if (!Number.isFinite(width) || width <= 0) return;
    if (this.creatingTool && this.creatingTool.line) {
      this.creatingTool.line.width = width;
    }
    this.updateSelectedTool({ line: { width } });
    this.updateLiveRegion(`Line width set to ${width}`);
  }

  setFillColor(color: string): void {
    if (!/^#[0-9A-F]{6}$/i.test(color)) return;
    if (this.creatingTool && this.creatingTool.fill) {
      this.creatingTool.fill.color = color;
    }
    this.updateSelectedTool({ fill: { color } });
    this.updateLiveRegion(`Fill color set to ${color}`);
  }

  setChartMode(isChartMode: boolean): void {
    this.isDrawing = !isChartMode;
    this.canvas!.style.cursor = isChartMode ? 'default' : this.activeTool && this.activeTool !== 'select' ? 'crosshair' : 'pointer';
    this.updateLiveRegion(`Mode set to ${isChartMode ? 'chart' : 'drawing'}`);
  }

  setTicks(ticks: Tick[]): void {
    try {
      this.ticks = new Float32Array(ticks.length * 3);
      ticks.forEach((tick, i) => {
        this.ticks![i * 3] = tick.price;
        this.ticks![i * 3 + 1] = tick.time;
        this.ticks![i * 3 + 2] = tick.volume;
      });
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private updateSelectedTool(updates: Partial<DrawingToolData>): void {
    if (!this.selectedToolId) return;
    try {
      this.tools = this.tools.map(t => {
        if (t.id === this.selectedToolId) {
          const newData = { ...t.data };
          if (updates.line && t.data.line) newData.line = { ...t.data.line, ...updates.line };
          if (updates.fill && t.data.fill) newData.fill = { ...t.data.fill, ...updates.fill };
          if (updates.text && t.data.text) newData.text = { ...t.data.text, ...updates.text };
          return { ...t, data: newData };
        }
        return t;
      });
      this.saveState();
      this.updateLiveRegion(`Updated tool ${this.selectedToolId}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.start(data.x);
      this.handleInteraction('mousedown', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.canvas) return;
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.update(data.x);
      this.handleInteraction('mousemove', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.canvas) return;
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.stop();
      this.handleInteraction('mouseup', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleTouchStart(event: TouchEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.start(data.x);
      this.handleInteraction('mousedown', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.update(data.x);
      this.handleInteraction('mousemove', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      this.kineticAnimation?.stop();
      this.handleInteraction('mouseup', data);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      this.widget?.handleZoom(data.x, event.deltaY > 0 ? 0.9 : 1.1);
      this.updateLiveRegion(`Zoomed at ${this.localizationManager.formatPrice(data.price)}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleContextMenu(event: MouseEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    try {
      const data = this.getInteractionData(event);
      if (!this.selectedToolId) return;
      const theme = this.styleManager.getTheme();
      const menu = document.createElement('div');
      menu.style.position = 'absolute';
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      menu.style.background = theme.tooltipBackground;
      menu.style.color = theme.tooltipColor;
      menu.style.border = `1px solid ${theme.crosshairColor}`;
      menu.style.padding = '5px';
      menu.style.zIndex = '1000';
      menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
      menu.innerHTML = `
        <button style="display:block;width:100%;text-align:left;padding:5px;" onclick="this.closest('div').dispatchEvent(new CustomEvent('delete'))">Delete Tool</button>
        <button style="display:block;width:100%;text-align:left;padding:5px;" onclick="this.closest('div').dispatchEvent(new CustomEvent('edit'))">Edit Properties</button>
        <button style="display:block;width:100%;text-align:left;padding:5px;" onclick="this.closest('div').dispatchEvent(new CustomEvent('lock'))">${this.tools.find(t => t.id === this.selectedToolId)?.data.locked ? 'Unlock' : 'Lock'} Tool</button>
      `;
      menu.addEventListener('delete', () => {
        this.deleteTool(this.selectedToolId!);
        menu.remove();
      });
      menu.addEventListener('edit', () => {
        this.editToolProperties(this.selectedToolId!);
        menu.remove();
      });
      menu.addEventListener('lock', () => {
        this.toggleLockTool(this.selectedToolId!);
        menu.remove();
      });
      document.body.appendChild(menu);
      document.addEventListener('click', () => menu.remove(), { once: true });
      this.updateLiveRegion(`Context menu opened for tool ${this.selectedToolId}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleCrosshair(event: CrosshairEvent): void {
    try {
      const hitTool = this.findHitTool(event.index, event.price);
      this.highlightedToolId = hitTool?.id || null;
      this.widget?.requestRender();
      if (hitTool) {
        this.updateLiveRegion(`Highlighted tool ${hitTool.type} at ${this.localizationManager.formatPrice(event.price)}`);
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private getInteractionData(event: MouseEvent | TouchEvent | WheelEvent): InteractionData {
    if (!this.canvas) throw new Error('Canvas not initialized');
    const { x, y } = normalizeEventCoordinates(event, this.canvas);
    const index = this.unscaleX(x);
    const price = this.unscaleY(y);
    const time = this.ticks ? this.ticks[Math.round(index) * 3 + 1] || Date.now() : Date.now();
    return {
      x,
      y,
      index,
      price,
      time,
      tool: this.activeTool,
    };
  }

  handleInteraction(type: string, data: InteractionData): void {
    try {
      if (type === 'mousedown') {
        if (data.tool === 'select') {
          this.handleSelection(data);
        } else if (data.tool) {
          this.handleMouseDownInteraction(data.tool, data);
        }
      } else if (type === 'mousemove' && this.isDrawing) {
        if (data.tool) {
          this.handleMouseMoveInteraction(data.tool, data);
        }
      } else if (type === 'mouseup' && this.isDrawing) {
        if (data.tool) {
          this.handleMouseUpInteraction(data.tool, data);
        }
      }
      this.crosshairManager?.setPosition(data.x, data.y);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseDownInteraction(type: string, data: InteractionData): void {
    if (type !== this.activeTool || !this.isDrawing) return;
    try {
      if (!this.creatingTool) {
        this.creatingTool = {
          id: uuidv4(),
          type,
          zIndex: this.tools.length + 1,
          locked: false,
          ...(type === 'horizontalLine' ? { price: data.price } :
             type === 'verticalLine' ? { index: data.index } :
             type === 'text' ? { index: data.index, price: data.price, text: { ...defaultTextOptions } } :
             type === 'callout' ? { index: data.index, price: data.price } :
             type === 'brush' || type === 'highlighter' || type === 'path' ? { points: [{ index: data.index, price: data.price }] } :
             type === 'parallelChannel' ? { line1StartIndex: data.index, line1StartPrice: data.price } :
             { startIndex: data.index, startPrice: data.price }),
          line: { ...defaultLineOptions, color: this.styleManager.getTheme().crosshairColor, ...(type === 'highlighter' ? { width: 4 } : {}) },
          text: ['text', 'callout'].includes(type) ? undefined : { ...defaultTextOptions, value: '' },
          ...(type === 'rectangle' || type === 'circle' || type === 'priceRange' || type === 'parallelChannel' ? { fill: { color: this.styleManager.getTheme().tooltipBackground, opacity: 0.2 } } :
             type === 'fibonacci' ? { levels: [] } : {}),
        };
        if (['horizontalLine', 'verticalLine', 'text'].includes(type)) {
          this.finalizeTool(type, data);
        }
      } else {
        if (type === 'parallelChannel' && 'line1StartIndex' in this.creatingTool && !('line1EndIndex' in this.creatingTool)) {
          this.creatingTool.line1EndIndex = data.index;
          this.creatingTool.line1EndPrice = data.price;
        } else if (type === 'parallelChannel' && 'line1EndIndex' in this.creatingTool) {
          this.creatingTool.line2OffsetPrice = data.price - this.creatingTool.line1StartPrice!;
          this.finalizeTool(type, data);
        } else if (type === 'brush' || type === 'highlighter' || type === 'path') {
          this.creatingTool.points = [...(this.creatingTool.points || []), { index: data.index, price: data.price }];
          this.updateTool(type, data);
        } else {
          this.finalizeTool(type, data);
        }
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseMoveInteraction(type: string, data: InteractionData): void {
    if (!this.creatingTool || !this.activeTool || type !== this.activeTool) return;
    try {
      if (['brush', 'highlighter', 'path'].includes(type)) {
        this.creatingTool.points = [...(this.creatingTool.points || []), { index: data.index, price: data.price }];
        this.updateTool(type, data);
      } else if (type === 'parallelChannel' && 'line1EndIndex' in this.creatingTool) {
        this.creatingTool.line2OffsetPrice = data.price - this.creatingTool.line1StartPrice!;
        this.updateTool(type, data);
      } else if (!['horizontalLine', 'verticalLine', 'text'].includes(type)) {
        const toolData: Partial<DrawingToolData> = {
          ...this.creatingTool,
          ...(type === 'callout' ? { targetIndex: data.index, targetPrice: data.price } :
             type === 'fibonacci' ? {
               endIndex: data.index,
               endPrice: data.price,
               levels: FIB_LEVELS.map(({ percent, level }) => ({
                 label: percent,
                 price: Math.min(this.creatingTool.startPrice!, data.price) +
                        level * Math.abs(data.price - this.creatingTool.startPrice!),
                 line: { ...defaultLineOptions, width: 1, style: LineStyle.Dashed }
               }))
             } :
             type === 'circle' ? { radiusIndex: data.index, radiusPrice: data.price } :
             { endIndex: data.index, endPrice: data.price }),
        };
        this.updateTool(type, toolData);
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleMouseUpInteraction(type: string, data: InteractionData): void {
    if (!this.creatingTool || !this.activeTool || type !== this.activeTool) return;
    try {
      if (['brush', 'highlighter', 'path'].includes(type)) {
        this.finalizeTool(type, data);
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private finalizeTool(type: string, data: InteractionData): void {
    let toolData: DrawingToolData;
    try {
      switch (type) {
        case 'fibonacci':
          const startPrice = this.creatingTool!.startPrice!;
          const minPrice = Math.min(startPrice, data.price);
          const maxPrice = Math.max(startPrice, data.price);
          toolData = {
            id: this.creatingTool!.id!,
            type: 'fibonacci',
            startIndex: this.creatingTool!.startIndex!,
            startPrice,
            endIndex: data.index,
            endPrice: data.price,
            levels: FIB_LEVELS.map(({ percent, level }) => ({
              label: percent,
              price: minPrice + (maxPrice - minPrice) * level,
              line: { ...defaultLineOptions, width: 1, style: LineStyle.Dashed }
            })),
            text: this.creatingTool!.text,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'horizontalLine':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'horizontalLine',
            price: data.price,
            line: this.creatingTool!.line!,
            text: { ...defaultTextOptions, value: this.localizationManager.formatPrice(data.price) },
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'verticalLine':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'verticalLine',
            index: data.index,
            line: this.creatingTool!.line!,
            text: { ...defaultTextOptions, value: this.localizationManager.formatTime(this.timeToIndex(data.index)) },
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'text':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'text',
            index: data.index,
            price: data.price,
            text: { ...this.creatingTool!.text!, value: 'Text' },
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'callout':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'callout',
            index: this.creatingTool!.index!,
            price: this.creatingTool!.price!,
            targetIndex: data.index,
            targetPrice: data.price,
            text: { ...defaultTextOptions, value: 'Callout' },
            line: this.creatingTool!.line!,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'brush':
        case 'highlighter':
        case 'path':
          toolData = {
            id: this.creatingTool!.id!,
            type,
            points: this.creatingTool!.points!,
            line: this.creatingTool!.line!,
            ...(type === 'highlighter' ? { fill: { color: this.creatingTool!.line!.color + '4D', opacity: 0.3 } } : {}),
            text: this.creatingTool!.text!,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'parallelChannel':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'parallelChannel',
            line1StartIndex: this.creatingTool!.line1StartIndex!,
            line1StartPrice: this.creatingTool!.line1StartPrice!,
            line1EndIndex: this.creatingTool!.line1EndIndex!,
            line1EndPrice: this.creatingTool!.line1EndPrice!,
            line2OffsetPrice: data.price - this.creatingTool!.line1StartPrice!,
            line: this.creatingTool!.line!,
            fill: this.creatingTool!.fill,
            text: this.creatingTool!.text!,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'circle':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'circle',
            centerIndex: this.creatingTool!.startIndex!,
            centerPrice: this.creatingTool!.startPrice!,
            radiusIndex: data.index,
            radiusPrice: data.price,
            line: this.creatingTool!.line!,
            fill: this.creatingTool!.fill,
            text: this.creatingTool!.text!,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        case 'trendline':
        case 'arrow':
        case 'extendedLine':
        case 'ray':
        case 'rectangle':
        case 'priceRange':
          toolData = {
            id: this.creatingTool!.id!,
            type,
            startIndex: this.creatingTool!.startIndex!,
            startPrice: this.creatingTool!.startPrice!,
            endIndex: data.index,
            endPrice: data.price,
            line: this.creatingTool!.line!,
            ...(type === 'rectangle' || type === 'priceRange' ? { fill: this.creatingTool!.fill } : {}),
            text: this.creatingTool!.text!,
            selected: true,
            zIndex: this.creatingTool!.zIndex!,
            locked: false,
          };
          break;
        default:
          throw new Error(`Unknown tool type: ${type}`);
      }

      validateToolData(toolData);
      this.tools = this.tools.map(t => ({ ...t, data: { ...t.data, selected: false } }));
      this.tools.push({ type, id: this.creatingTool!.id!, data: toolData });
      this.saveState();
      this.creatingTool = null;
      this.isDrawing = false;
      this.widget?.requestRender();
      this.updateLiveRegion(`Created ${type} at ${this.localizationManager.formatPrice(data.price)}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private updateTool(type: string, data: Partial<DrawingToolData>): void {
    try {
      this.tools = this.tools.filter(t => t.id !== this.creatingTool!.id);
      this.tools.push({
        type,
        id: this.creatingTool!.id!,
        data: { ...data, zIndex: this.creatingTool!.zIndex, locked: false } as DrawingToolData,
      });
      this.saveState();
      this.widget?.requestRender();
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private handleSelection(data: InteractionData): void {
    try {
      const hitTool = this.findHitTool(data.index, data.price);
      this.tools = this.tools.map(t => ({
        ...t,
        data: { ...t.data, selected: t.id === hitTool?.id && !t.data.locked },
      }));
      this.selectedToolId = hitTool?.id && !hitTool.data.locked ? hitTool.id : null;
      this.editingPoint = this.selectedToolId ? this.getEditingPoint(hitTool!, data.index, data.price) : null;
      this.saveState();
      this.widget?.requestRender();
      if (hitTool) {
        this.updateLiveRegion(`Selected ${hitTool.type} at ${this.localizationManager.formatPrice(data.price)}`);
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private findHitTool(index: number, price: number): DrawingTool | null {
    const hitThreshold = 5;
    for (const t of [...this.tools].sort((a, b) => (b.data.zIndex || 0) - (a.data.zIndex || 0))) {
      if (t.data.locked) continue;
      const d = t.data as any;
      try {
        if (['trendline', 'arrow', 'extendedLine', 'ray'].includes(t.type)) {
          const dx = d.endIndex - d.startIndex;
          const dy = d.endPrice - d.startPrice;
          const t = ((index - d.startIndex) * dx + (price - d.startPrice) * dy) / (dx * dx + dy * dy);
          const closestX = d.startIndex + t * dx;
          const closestY = d.startPrice + t * dy;
          const distance = Math.hypot(index - closestX, price - closestY);
          if (distance < hitThreshold) return t;
        } else if (['rectangle', 'priceRange'].includes(t.type)) {
          const minX = Math.min(d.startIndex, d.endIndex) - hitThreshold;
          const maxX = Math.max(d.startIndex, d.endIndex) + hitThreshold;
          const minY = Math.min(d.startPrice, d.endPrice) - hitThreshold;
          const maxY = Math.max(d.startPrice, d.endPrice) + hitThreshold;
          if (index >= minX && index <= maxX && price >= minY && price <= maxY) return t;
        } else if (t.type === 'fibonacci') {
          if (Math.abs(index - d.startIndex) < hitThreshold || Math.abs(index - d.endIndex) < hitThreshold) return t;
        } else if (t.type === 'horizontalLine') {
          if (Math.abs(price - d.price) < hitThreshold) return t;
        } else if (t.type === 'verticalLine') {
          if (Math.abs(index - d.index) < hitThreshold) return t;
        } else if (t.type === 'brush' || t.type === 'highlighter' || t.type === 'path') {
          if (d.points.some(p => Math.hypot(index - p.index, price - p.price) < hitThreshold)) return t;
        } else if (t.type === 'callout' || t.type === 'text') {
          if (Math.hypot(index - d.index, price - d.price) < hitThreshold) return t;
        } else if (t.type === 'circle') {
          const dx = index - d.centerIndex;
          const dy = price - d.centerPrice;
          const rx = Math.abs(d.radiusIndex - d.centerIndex);
          const ry = Math.abs(d.radiusPrice - d.centerPrice);
          if (Math.abs((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) - 1) < 0.1) return t;
        } else if (t.type === 'parallelChannel') {
          const dx = d.line1EndIndex - d.line1StartIndex;
          const dy = d.line1EndPrice - d.line1StartPrice;
          const t1 = ((index - d.line1StartIndex) * dx + (price - d.line1StartPrice) * dy) / (dx * dx + dy * dy);
          const t2 = ((index - d.line1StartIndex) * dx + (price - (d.line1StartPrice + d.line2OffsetPrice)) * dy) / (dx * dx + dy * dy);
          const dist1 = Math.hypot(index - (d.line1StartIndex + t1 * dx), price - (d.line1StartPrice + t1 * dy));
          const dist2 = Math.hypot(index - (d.line1StartIndex + t2 * dx), price - (d.line1StartPrice + d.line2OffsetPrice + t2 * dy));
          if (dist1 < hitThreshold || dist2 < hitThreshold) return t;
        }
      } catch (error) {
        this.errorHandler.handleError(error as Error);
      }
    }
    return null;
  }

  private getEditingPoint(tool: DrawingTool, index: number, price: number): number | null {
    const d = tool.data as any;
    const hitThreshold = 5;
    if (['trendline', 'arrow', 'extendedLine', 'ray', 'rectangle', 'priceRange'].includes(tool.type)) {
      if (Math.hypot(index - d.startIndex, price - d.startPrice) < hitThreshold) return 0;
      if (Math.hypot(index - d.endIndex, price - d.endPrice) < hitThreshold) return 1;
    } else if (tool.type === 'fibonacci') {
      if (Math.hypot(index - d.startIndex, price - d.startPrice) < hitThreshold) return 0;
      if (Math.hypot(index - d.endIndex, price - d.endPrice) < hitThreshold) return 1;
    } else if (tool.type === 'circle') {
      if (Math.hypot(index - d.centerIndex, price - d.centerPrice) < hitThreshold) return 0;
      if (Math.hypot(index - d.radiusIndex, price - d.radiusPrice) < hitThreshold) return 1;
    } else if (tool.type === 'callout') {
      if (Math.hypot(index - d.index, price - d.price) < hitThreshold) return 0;
      if (Math.hypot(index - d.targetIndex, price - d.targetPrice) < hitThreshold) return 1;
    }
    return null;
  }

  private editToolProperties(id: string): void {
    try {
      const tool = this.tools.find(t => t.id === id);
      if (!tool) return;
      if (tool.data.text) {
        const newText = prompt('Enter new label:', tool.data.text.value);
        if (newText) {
          this.updateSelectedTool({ text: { ...tool.data.text, value: newText } });
          this.updateLiveRegion(`Updated text for ${tool.type} to ${newText}`);
        }
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private toggleLockTool(id: string): void {
    try {
      this.tools = this.tools.map(t => {
        if (t.id === id) {
          return { ...t, data: { ...t.data, locked: !t.data.locked, selected: false } };
        }
        return t;
      });
      if (this.selectedToolId === id && this.tools.find(t => t.id === id)?.data.locked) {
        this.selectedToolId = null;
      }
      this.saveState();
      this.updateLiveRegion(`Tool ${id} ${this.tools.find(t => t.id === id)?.data.locked ? 'locked' : 'unlocked'}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private saveState(): void {
    try {
      this.undoStack.push([...this.tools]);
      this.redoStack = [];
      this.setTools([...this.tools]);
      if (this.undoStack.length > 50) this.undoStack.shift();
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  undo(): void {
    try {
      if (this.undoStack.length <= 1) return;
      const currentState = this.undoStack.pop()!;
      this.redoStack.push([...this.tools]);
      this.tools = currentState;
      this.saveState();
      this.widget?.requestRender();
      this.updateLiveRegion('Undid last action');
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  redo(): void {
    try {
      if (this.redoStack.length === 0) return;
      const nextState = this.redoStack.pop()!;
      this.undoStack.push([...this.tools]);
      this.tools = nextState;
      this.saveState();
      this.widget?.requestRender();
      this.updateLiveRegion('Redid last action');
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  deleteTool(id: string): void {
    try {
      this.tools = this.tools.filter(t => t.id !== id);
      this.saveState();
      if (this.selectedToolId === id) {
        this.selectedToolId = null;
      }
      this.widget?.requestRender();
      this.updateLiveRegion(`Deleted tool ${id}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  serializeTools(): string {
    try {
      return JSON.stringify(this.tools, (key, value) => {
        if (key === 'data') {
          return { ...value, type: value.type };
        }
        return value;
      });
    } catch (error) {
      this.errorHandler.handleError(error as Error);
      return '[]';
    }
  }

  deserializeTools(json: string): void {
    try {
      const tools = JSON.parse(json) as DrawingTool[];
      tools.forEach(tool => validateToolData(tool.data));
      this.tools = tools.map(t => ({
        ...t,
        data: { ...t.data, zIndex: t.data.zIndex ?? this.tools.length + 1, locked: t.data.locked ?? false }
      }));
      this.saveState();
      this.widget?.requestRender();
      this.updateLiveRegion('Deserialized drawing tools');
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  render2D(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    try {
      this.tools.forEach(tool => {
        const d = tool.data as any;
        const theme = this.styleManager.getTheme();
        ctx.save();
        switch (tool.type) {
          case 'trendline':
          case 'arrow':
          case 'extendedLine':
          case 'ray':
            drawLine(ctx, this.scaleX(d.startIndex), this.scaleY(d.startPrice), this.scaleX(d.endIndex), this.scaleY(d.endPrice), d.line.color, d.line.width, d.line.style === LineStyle.Dashed);
            if (d.text?.value) {
              drawText(ctx, d.text.value, this.scaleX(d.startIndex), this.scaleY(d.startPrice), d.text.font.color, `${d.text.font.size}px ${d.text.font.family}`, theme.tooltipBackground);
            }
            break;
          case 'rectangle':
          case 'priceRange':
            drawRect(ctx, this.scaleX(d.startIndex), this.scaleY(d.startPrice), this.scaleX(d.endIndex) - this.scaleX(d.startIndex), this.scaleY(d.endPrice) - this.scaleY(d.startPrice), d.line.color, d.line.width, d.fill?.color);
            if (d.text?.value) {
              drawText(ctx, d.text.value, this.scaleX(d.startIndex), this.scaleY(d.startPrice), d.text.font.color, `${d.text.font.size}px ${d.text.font.family}`, theme.tooltipBackground);
            }
            break;
          case 'horizontalLine':
            drawLine(ctx, 0, this.scaleY(d.price), width, this.scaleY(d.price), d.line.color, d.line.width, d.line.style === LineStyle.Dashed);
            drawText(ctx, this.localizationManager.formatPrice(d.price), width - 60, this.scaleY(d.price), theme.tooltipColor, '12px Arial', theme.tooltipBackground);
            break;
          case 'verticalLine':
            drawLine(ctx, this.scaleX(d.index), 0, this.scaleX(d.index), height, d.line.color, d.line.width, d.line.style === LineStyle.Dashed);
            drawText(ctx, this.localizationManager.formatTime(this.timeToIndex(d.index)), this.scaleX(d.index), height - 10, theme.tooltipColor, '12px Arial', theme.tooltipBackground);
            break;
          case 'text':
            drawText(ctx, d.text.value, this.scaleX(d.index), this.scaleY(d.price), d.text.font.color, `${d.text.font.size}px ${d.text.font.family}`, theme.tooltipBackground);
            break;
        }
        ctx.restore();
      });
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  renderWebGL(gl: WebGL2RenderingContext): void {
    try {
      if (!this.gl) return;
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);

      this.tools.forEach(tool => {
        if (['trendline', 'arrow', 'extendedLine', 'ray'].includes(tool.type)) {
          const d = tool.data as any;
          const vertices = new Float32Array([
            this.scaleX(d.startIndex) / this.gl!.canvas.width * 2 - 1, this.scaleY(d.startPrice) / this.gl!.canvas.height * 2 - 1,
            this.scaleX(d.endIndex) / this.gl!.canvas.width * 2 - 1, this.scaleY(d.endPrice) / this.gl!.canvas.height * 2 - 1,
          ]);
          const buffer = this.gl!.createBuffer();
          this.gl!.bindBuffer(this.gl!.ARRAY_BUFFER, buffer);
          this.gl!.bufferData(this.gl!.ARRAY_BUFFER, vertices, this.gl!.STATIC_DRAW);
          const position = this.gl!.getAttribLocation(this.gl!.getParameter(this.gl!.CURRENT_PROGRAM), 'a_position');
          this.gl!.enableVertexAttribArray(position);
          this.gl!.vertexAttribPointer(position, 2, this.gl!.FLOAT, false, 0, 0);
          const color = this.gl!.getUniformLocation(this.gl!.getParameter(this.gl!.CURRENT_PROGRAM), 'u_color');
          const theme = this.styleManager.getTheme();
          this.gl!.uniform4f(color, parseInt(theme.crosshairColor.slice(1, 3), 16) / 255, parseInt(theme.crosshairColor.slice(3, 5), 16) / 255, parseInt(theme.crosshairColor.slice(5, 7), 16) / 255, 1);
          this.gl!.drawArrays(this.gl!.LINES, 0, 2);
        }
      });
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }

  private updateLiveRegion(message: string): void {
    this.liveRegion.textContent = message;
  }

  getHighlightedTool(): DrawingTool | null {
    return this.highlightedToolId ? this.tools.find(t => t.id === this.highlightedToolId) || null : null;
  }

  destroy(): void {
    try {
      if (this.canvas) {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        this.canvas.removeEventListener('wheel', this.handleWheel);
      }
      this.kineticAnimation?.destroy();
      this.canvas = null;
      this.ctx = null;
      this.gl = null;
      this.widget = null;
      this.crosshairManager = null;
      this.tools = [];
      this.setTools([]);
      this.undoStack = [];
      this.redoStack = [];
      this.ticks = null;
      this.liveRegion.remove();
    } catch (error) {
      this.errorHandler.handleError(error as Error);
    }
  }
}
