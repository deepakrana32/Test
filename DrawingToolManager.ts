import { DrawingTool, DrawingToolData, LineOptions, TextOptions, Point, LineStyle, LineEnd, BoxHorizontalAlignment, BoxVerticalAlignment, TrendLineData, RectangleData, FibonacciData, HorizontalLineData, VerticalLineData, ArrowData, BrushData, HighlighterData, CalloutData, CircleData, ExtendedLineData, ParallelChannelData, PathData, PriceRangeData, RayData, TextData } from './ChartTypes';
import { v4 as uuidv4 } from 'uuid';
import { debounce, memoize } from 'lodash';

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
 * Validates tool data against expected structure.
 */
function validateToolData(data: DrawingToolData): void {
  if (!data || !data.id) throw new Error('Tool data or ID is missing');
  switch (data.type) {
    case 'trendline':
    case 'arrow':
    case 'extendedLine':
    case 'ray':
      if (!('startIndex' in data && 'startPrice' in data && 'endIndex' in data && 'endPrice' in data)) {
        throw new Error(`Invalid ${data.type} data`);
      }
      break;
    case 'rectangle':
    case 'priceRange':
      if (!('startIndex' in data && 'startPrice' in data && 'endIndex' in data && 'endPrice' in data)) {
        throw new Error(`Invalid ${data.type} data`);
      }
      break;
    case 'fibonacci':
      if (!('startIndex' in data && 'startPrice' in data && 'endIndex' in data && 'endPrice' in data && 'levels' in data)) {
        throw new Error('Invalid fibonacci data');
      }
      break;
    case 'horizontalLine':
      if (!('price' in data)) throw new Error('Invalid horizontalLine data');
      break;
    case 'verticalLine':
      if (!('index' in data)) throw new Error('Invalid verticalLine data');
      break;
    case 'brush':
    case 'highlighter':
    case 'path':
      if (!('points' in data)) throw new Error(`Invalid ${data.type} data`);
      break;
    case 'callout':
      if (!('index' in data && 'price' in data && 'targetIndex' in data && 'targetPrice' in data)) {
        throw new Error('Invalid callout data');
      }
      break;
    case 'circle':
      if (!('centerIndex' in data && 'centerPrice' in data && 'radiusIndex' in data && 'radiusPrice' in data)) {
        throw new Error('Invalid circle data');
      }
      break;
    case 'parallelChannel':
      if (!('line1StartIndex' in data && 'line1StartPrice' in data && 'line1EndIndex' in data && 'line1EndPrice' in data && 'line2OffsetPrice' in data)) {
        throw new Error('Invalid parallelChannel data');
      }
      break;
    case 'text':
      if (!('index' in data && 'price' in data && 'text' in data)) throw new Error('Invalid text data');
      break;
    default:
      throw new Error(`Unknown tool type: ${data.type}`);
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
  private undoStack: DrawingTool[][] = [];
  private redoStack: DrawingTool[][] = [];
  private scaleX: (index: number) => number;
  private scaleY: (price: number) => number;
  private unscaleX: (x: number) => number;
  private unscaleY: (y: number) => number;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, setTools: (tools: DrawingTool[]) => void, scaleX: (index: number) => number, scaleY: (price: number) => number, unscaleX: (x: number) => number, unscaleY: (y: number) => number) {
    if (!canvas || !ctx || !setTools) throw new Error('Canvas, context, or setTools is missing');
    this.canvas = canvas;
    this.ctx = ctx;
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
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', debounce(this.handleMouseMove.bind(this), 10));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', debounce(this.handleTouchMove.bind(this), 10));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
  }

  setActiveTool(tool: string | null): boolean {
    if (tool && !['trendline', 'rectangle', 'fibonacci', 'horizontalLine', 'verticalLine', 'arrow', 'brush', 'highlighter', 'callout', 'circle', 'extendedLine', 'parallelChannel', 'path', 'priceRange', 'ray', 'text'].includes(tool)) {
      console.warn(`Unknown tool: ${tool}`);
      return false;
    }
    this.activeTool = tool;
    this.creatingTool = null;
    this.selectedToolId = null;
    this.editingPoint = null;
    this.isDrawing = false;
    return true;
  }

  setStrokeColor(color: string): void {
    if (this.creatingTool && this.creatingTool.line) {
      this.creatingTool.line.color = color;
    }
    this.tools = this.tools.map(t => {
      if (t.id === this.selectedToolId && t.data.line) {
        return { ...t, data: { ...t.data, line: { ...t.data.line, color } } };
      }
      return t;
    });
    this.setTools([...this.tools]);
  }

  setLineWidth(width: number): void {
    if (width <= 0) return;
    if (this.creatingTool && this.creatingTool.line) {
      this.creatingTool.line.width = width;
    }
    this.tools = this.tools.map(t => {
      if (t.id === this.selectedToolId && t.data.line) {
        return { ...t, data: { ...t.data, line: { ...t.data.line, width } } };
      }
      return t;
    });
    this.setTools([...this.tools]);
  }

  setFillColor(color: string): void {
    if (this.creatingTool && this.creatingTool.fill) {
      this.creatingTool.fill.color = color;
    }
    this.tools = this.tools.map(t => {
      if (t.id === this.selectedToolId && t.data.fill) {
        return { ...t, data: { ...t.data, fill: { ...t.data.fill, color } } };
      }
      return t;
    });
    this.setTools([...this.tools]);
  }

  setChartMode(isChartMode: boolean): void {
    this.isDrawing = !isChartMode;
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event);
    this.handleInteraction('mousedown', data);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event);
    this.handleInteraction('mousemove', data);
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event);
    this.handleInteraction('mouseup', data);
  }

  private handleTouchStart(event: Event): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event as TouchEvent);
    this.handleInteraction('mousedown', data);
    event.preventDefault();
  }

  private handleTouchMove(event: Event): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event as TouchEvent);
    this.handleInteraction('mousemove', data);
    event.preventDefault();
  }

  private handleTouchEnd(event: Event): void {
    if (!this.canvas) return;
    const data = this.getInteractionData(event as TouchEvent);
    this.handleInteraction('mouseup', data);
    event.preventDefault();
  }

  private handleContextMenu(event: MouseEvent): void {
    if (!this.canvas) return;
    event.preventDefault();
    const data = this.getInteractionData(event);
    const menu = document.createElement('div');
    menu.style.position = 'absolute';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.background = '#fff';
    menu.style.border = '1px solid #ccc';
    menu.style.padding = '5px';
    menu.innerHTML = `
      <button onclick="this.closest('div').dispatchEvent(new CustomEvent('delete'))">Delete Tool</button>
      <button onclick="this.closest('div').dispatchEvent(new CustomEvent('edit'))">Edit Properties</button>
    `;
    menu.addEventListener('delete', () => {
      if (this.selectedToolId) {
        this.deleteTool(this.selectedToolId);
      }
      menu.remove();
    });
    menu.addEventListener('edit', () => {
      console.log(`Edit properties for tool: ${this.selectedToolId}`);
      menu.remove();
    });
    document.body.appendChild(menu);
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  private getInteractionData(event: MouseEvent | TouchEvent): InteractionData {
    if (!this.canvas) throw new Error('Canvas not initialized');
    const { x, y } = normalizeEventCoordinates(event, this.canvas);
    return {
      x,
      y,
      index: Math.round(this.unscaleX(x)),
      price: this.unscaleY(y),
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
    } catch (error) {
      console.error(`Error handling interaction ${type}:`, error);
    }
  }

  private handleMouseDownInteraction(type: string, data: InteractionData): void {
    if (type !== this.activeTool) return;
    this.isDrawing = true;

    if (!this.creatingTool) {
      this.creatingTool = {
        id: uuidv4(),
        type,
        ...(type === 'horizontalLine' ? { price: data.price } :
           type === 'verticalLine' ? { index: data.index } :
           type === 'text' ? { index: data.index, price: data.price, text: { ...defaultTextOptions } } :
           type === 'callout' ? { index: data.index, price: data.price } :
           type === 'brush' || type === 'highlighter' || type === 'path' ? { points: [{ index: data.index, price: data.price }] } :
           type === 'parallelChannel' ? { line1StartIndex: data.index, line1StartPrice: data.price } :
           { startIndex: data.index, startPrice: data.price }),
        line: { ...defaultLineOptions, ...(type === 'highlighter' ? { width: 4 } : {}) },
        text: ['text', 'callout'].includes(type) ? undefined : { ...defaultTextOptions, value: '' },
        ...(type === 'rectangle' || type === 'circle' || type === 'priceRange' || type === 'parallelChannel' ? { fill: { color: '#007bff33', opacity: 0.2 } } :
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
  }

  private handleMouseMoveInteraction(type: string, data: InteractionData): void {
    if (!this.creatingTool || !this.activeTool || type !== this.activeTool) return;

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
  }

  private handleMouseUpInteraction(type: string, data: InteractionData): void {
    if (!this.creatingTool || !this.activeTool || type !== this.activeTool) return;
    if (['brush', 'highlighter', 'path'].includes(type)) {
      this.finalizeTool(type, data);
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
          };
          break;
        case 'horizontalLine':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'horizontalLine',
            price: data.price,
            line: this.creatingTool!.line!,
            text: this.creatingTool!.text!,
            selected: true,
          };
          break;
        case 'verticalLine':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'verticalLine',
            index: data.index,
            line: this.creatingTool!.line!,
            text: this.creatingTool!.text!,
            selected: true,
          };
          break;
        case 'text':
          toolData = {
            id: this.creatingTool!.id!,
            type: 'text',
            index: data.index,
            price: data.price,
            text: this.creatingTool!.text!,
            selected: true,
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
            ...(type === 'highlighter' ? { fill: { color: this.creatingTool!.line!.color, opacity: 0.3 } } : {}),
            text: this.creatingTool!.text!,
            selected: true,
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
          };
          break;
        default:
          throw new Error(`Unknown tool type: ${type}`);
      }

      validateToolData(toolData);
      this.tools = this.tools.map(t => ({ ...t, data: { ...t.data, selected: false } }));
      this.tools.push({ type, id: this.creatingTool!.id!, data: toolData });
      this.undoStack.push([...this.tools]);
      this.redoStack = [];
      this.setTools([...this.tools]);
      this.creatingTool = null;
      this.isDrawing = false;
    } catch (error) {
      console.error(`Error finalizing tool ${type}:`, error);
    }
  }

  private updateTool(type: string, data: Partial<DrawingToolData>): void {
    try {
      this.tools = this.tools.filter(t => t.id !== this.creatingTool!.id);
      this.tools.push({
        type,
        id: this.creatingTool!.id!,
        data: { ...data } as DrawingToolData,
      });
      this.setTools([...this.tools]);
    } catch (error) {
      console.error(`Error updating tool ${type}:`, error);
    }
  }

  private handleSelection(data: InteractionData): void {
    const hitTool = this.tools.find(t => {
      const d = t.data as any;
      try {
        if (['trendline', 'arrow', 'extendedLine', 'ray'].includes(t.type)) {
          const dx = d.endIndex - d.startIndex;
          const dy = d.endPrice - d.startPrice;
          const t = ((data.index - d.startIndex) * dx + (data.price - d.startPrice) * dy) / (dx * dx + dy * dy);
          const closestX = d.startIndex + t * dx;
          const closestY = d.startPrice + t * dy;
          const distance = Math.sqrt(Math.pow(data.index - closestX, 2) + Math.pow(data.price - closestY, 2));
          return distance < 2;
        } else if (['rectangle', 'priceRange'].includes(t.type)) {
          const minX = Math.min(d.startIndex, d.endIndex);
          const maxX = Math.max(d.startIndex, d.endIndex);
          const minY = Math.min(d.startPrice, d.endPrice);
          const maxY = Math.max(d.startPrice, d.endPrice);
          return data.index >= minX && data.index <= maxX && data.price >= minY && data.price <= maxY;
        } else if (t.type === 'fibonacci') {
          return Math.abs(data.index - d.startIndex) < 5 || Math.abs(data.index - d.endIndex) < 5;
        } else if (t.type === 'horizontalLine') {
          return Math.abs(data.price - d.price) < 5;
        } else if (t.type === 'verticalLine') {
          return Math.abs(data.index - d.index) < 5;
        } else if (t.type === 'brush' || t.type === 'highlighter' || t.type === 'path') {
          return d.points.some(p => Math.hypot(data.index - p.index, data.price - p.price) < 5);
        } else if (t.type === 'callout' || t.type === 'text') {
          return Math.hypot(data.index - d.index, data.price - d.price) < 5;
        } else if (t.type === 'circle') {
          const dx = data.index - d.centerIndex;
          const dy = data.price - d.centerPrice;
          const rx = Math.abs(d.radiusIndex - d.centerIndex);
          const ry = Math.abs(d.radiusPrice - d.centerPrice);
          return Math.abs((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) - 1) < 0.1;
        } else if (t.type === 'parallelChannel') {
          const dx = d.line1EndIndex - d.line1StartIndex;
          const dy = d.line1EndPrice - d.line1StartPrice;
          const t1 = ((data.index - d.line1StartIndex) * dx + (data.price - d.line1StartPrice) * dy) / (dx * dx + dy * dy);
          const t2 = ((data.index - d.line1StartIndex) * dx + (data.price - (d.line1StartPrice + d.line2OffsetPrice)) * dy) / (dx * dx + dy * dy);
          const dist1 = Math.hypot(data.index - (d.line1StartIndex + t1 * dx), data.price - (d.line1StartPrice + t1 * dy));
          const dist2 = Math.hypot(data.index - (d.line1StartIndex + t2 * dx), data.price - (d.line1StartPrice + d.line2OffsetPrice + t2 * dy));
          return dist1 < 5 || dist2 < 5;
        }
        return false;
      } catch (error) {
        console.error(`Error checking hit for tool ${t.type}:`, error);
        return false;
      }
    });

    this.tools = this.tools.map(t => ({
      ...t,
      data: { ...t.data, selected: t.id === hitTool?.id },
    }));
    this.selectedToolId = hitTool?.id || null;
    this.setTools([...this.tools]);
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const currentState = this.undoStack.pop()!;
    this.redoStack.push([...this.tools]);
    this.tools = currentState;
    this.setTools([...this.tools]);
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const nextState = this.redoStack.pop()!;
    this.undoStack.push([...this.tools]);
    this.tools = nextState;
    this.setTools([...this.tools]);
  }

  deleteTool(id: string): void {
    this.tools = this.tools.filter(t => t.id !== id);
    this.undoStack.push([...this.tools]);
    this.redoStack = [];
    this.setTools([...this.tools]);
    if (this.selectedToolId === id) {
      this.selectedToolId = null;
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
      console.error('Error serializing tools:', error);
      return '[]';
    }
  }

  deserializeTools(json: string): void {
    try {
      const tools = JSON.parse(json) as DrawingTool[];
      tools.forEach(tool => validateToolData(tool.data));
      this.tools = tools;
      this.undoStack.push([...this.tools]);
      this.redoStack = [];
      this.setTools([...this.tools]);
    } catch (error) {
      console.error('Error deserializing tools:', error);
    }
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }
    this.canvas = null;
    this.ctx = null;
    this.tools = [];
    this.setTools([]);
    this.undoStack = [];
    this.redoStack = [];
  }
}
