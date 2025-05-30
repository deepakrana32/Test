// DrawingToolManager.ts
import { DrawingTool, DrawingToolData, LineOptions, TextOptions, Point } from '@/types/ChartTypes';
import { v4 as uuidv4 } from 'uuid';

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
}

const defaultLineOptions: LineOptions = {
  color: '#007bff',
  width: 2,
  style: 0,
  end: { left: 0, right: 0 },
  extend: { left: false, right: false },
};

const defaultTextOptions: TextOptions = {
  value: 'Label',
  font: { color: '#007bff', size: 12, bold: false, italic: false, family: 'Arial' },
  box: { alignment: { vertical: 'middle', horizontal: 'center' }, angle: 0, scale: 1, padding: 2 },
};

export class DrawingToolManager {
  private tools: DrawingTool[];
  private setTools: (tools: DrawingTool[]) => void;
  private activeTool: string | null;
  private creatingTool: Partial<DrawingToolData> | null;
  private selectedToolId: string | null;
  private editingPoint: number | null;
  private isDrawing: boolean;

  constructor(setTools: (tools: DrawingTool[]) => void) {
    this.tools = [];
    this.setTools = setTools;
    this.activeTool = null;
    this.creatingTool = null;
    this.selectedToolId = null;
    this.editingPoint = null;
    this.isDrawing = false;
  }

  setActiveTool(tool: string | null) {
    this.activeTool = tool;
    this.creatingTool = null;
    this.selectedToolId = null;
    this.editingPoint = null;
    this.isDrawing = false;
  }

  handleMouseDown(type: string, data: InteractionData) {
    if (type === 'select') {
      this.handleSelection(data);
      return;
    }

    if (type !== this.activeTool) return;

    this.isDrawing = true;

    if (!this.creatingTool) {
      this.creatingTool = {
        id: uuidv4(),
        ...(type === 'horizontalLine' ? { price: data.price } :
           type === 'verticalLine' ? { index: data.index } :
           type === 'text' ? { index: data.index, price: data.price, text: { ...defaultTextOptions } } :
           type === 'callout' ? { index: data.index, price: data.price } :
           type === 'brush' || type === 'highlighter' || type === 'path' ? { points: [{ index: data.index, price: data.price }] } :
           type === 'parallelChannel' ? { line1StartIndex: data.index, line1StartPrice: data.price } :
           { startIndex: data.index, startPrice: data.price }),
        line: { ...defaultLineOptions, ...(type === 'highlighter' ? { width: 4 } : {}) },
        text: ['text', 'callout'].includes(type) ? undefined : { ...defaultTextOptions, value: '' },
        ...(type === 'rectangle' || type === 'circle' || type === 'priceRange' || type === 'parallelChannel' ? { fill: { color: '#007bff', opacity: 0.2 } } :
           type === 'fibonacci' ? { levels: [] } : {})
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

  handleMouseMove(type: string, data: InteractionData) {
    if (!this.creatingTool || !this.activeTool || type !== this.activeTool || !this.isDrawing) return;

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
               line: { ...defaultLineOptions, width: 1, style: 1 }
             }))
           } :
           type === 'circle' ? { radiusIndex: data.index, radiusPrice: data.price } :
           { endIndex: data.index, endPrice: data.price }),
      };
      this.updateTool(type, toolData);
    }
  }

  private finalizeTool(type: string, data: InteractionData) {
    let toolData: DrawingToolData;
    if (type === 'fibonacci') {
      const startPrice = this.creatingTool!.startPrice!;
      const minPrice = Math.min(startPrice, data.price);
      const maxPrice = Math.max(startPrice, data.price);
      toolData = {
        id: this.creatingTool!.id!,
        startIndex: this.creatingTool!.startIndex!,
        startPrice,
        endIndex: data.index,
        endPrice: data.price,
        levels: FIB_LEVELS.map(({ percent, level }) => ({
          label: percent,
          price: minPrice + (maxPrice - minPrice) * level,
          line: { ...defaultLineOptions, width: 1, style: 1 }
        })),
        text: this.creatingTool!.text,
        selected: true,
      };
    } else if (type === 'horizontalLine') {
      toolData = {
        id: this.creatingTool!.id!,
        price: data.price,
        line: this.creatingTool!.line!,
        text: this.creatingTool!.text!,
        selected: true,
      };
    } else if (type === 'verticalLine') {
      toolData = {
        id: this.creatingTool!.id!,
        index: data.index,
        line: this.creatingTool!.line!,
        text: this.creatingTool!.text!,
        selected: true,
      };
    } else if (type === 'text') {
      toolData = {
        id: this.creatingTool!.id!,
        index: data.index,
        price: data.price,
        text: this.creatingTool!.text!,
        selected: true,
      };
    } else if (type === 'callout') {
      toolData = {
        id: this.creatingTool!.id!,
        index: this.creatingTool!.index!,
        price: this.creatingTool!.price!,
        targetIndex: data.index,
        targetPrice: data.price,
        text: { ...defaultTextOptions, value: 'Callout' },
        line: this.creatingTool!.line!,
        selected: true,
      };
    } else if (type === 'brush' || type === 'highlighter' || type === 'path') {
      toolData = {
        id: this.creatingTool!.id!,
        points: this.creatingTool!.points!,
        line: this.creatingTool!.line!,
        ...(type === 'highlighter' ? { fill: { color: this.creatingTool!.line!.color, opacity: 0.3 } } : {}),
        text: this.creatingTool!.text!,
        selected: true,
      };
    } else if (type === 'parallelChannel') {
      toolData = {
        id: this.creatingTool!.id!,
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
    } else if (type === 'circle') {
      toolData = {
        id: this.creatingTool!.id!,
        centerIndex: this.creatingTool!.startIndex!,
        centerPrice: this.creatingTool!.startPrice!,
        radiusIndex: data.index,
        radiusPrice: data.price,
        line: this.creatingTool!.line!,
        fill: this.creatingTool!.fill,
        text: this.creatingTool!.text!,
        selected: true,
      };
    } else {
      toolData = {
        id: this.creatingTool!.id!,
        startIndex: this.creatingTool!.startIndex!,
        startPrice: this.creatingTool!.startPrice!,
        endIndex: data.index,
        endPrice: data.price,
        line: this.creatingTool!.line!,
        ...(type === 'rectangle' || type === 'priceRange' ? { fill: { color: '#007bff', opacity: 0.2 } } : {}),
        text: this.creatingTool!.text!,
        selected: true,
      };
    }

    this.tools.push({ type, id: this.creatingTool!.id!, data: toolData });
    this.setTools([...this.tools]);
    this.creatingTool = null;
    this.activeTool = null;
    this.isDrawing = false;
  }

  private updateTool(type: string, data: Partial<DrawingToolData>) {
    this.setTools([
      ...this.tools,
      {
        type,
        id: this.creatingTool!.id!,
        data: { ...data } as DrawingToolData,
      }
    ]);
  }

  handleSelection(data: InteractionData) {
    const hitTool = this.tools.find(t => {
      const d = t.data as any;
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
    });

    if (hitTool) {
      this.selectedToolId = hitTool.id;
      this.tools = this.tools.map(t => ({
        ...t,
        data: { ...t.data, selected: t.id === hitTool.id },
      }));
      this.setTools(this.tools);
    } else {
      this.selectedToolId = null;
      this.tools = this.tools.map(t => ({
        ...t,
        data: { ...t.data, selected: false },
      }));
      this.setTools(this.tools);
    }
  }
}