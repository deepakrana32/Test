import { Color } from './ChartTypes';

export class LabelsImageCache {
  private cache: Map<string, HTMLCanvasElement>;

  constructor() {
    this.cache = new Map();
  }

  get(label: string, font: string, color: Color): HTMLCanvasElement | null {
    const key = `${label}_${font}_${color}`;
    return this.cache.get(key) || null;
  }

  cache(label: string, font: string, color: Color, ctx: CanvasRenderingContext2D) {
    const key = `${label}_${font}_${color}`;
    if (this.cache.has(key)) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.font = font;
    const metrics = tempCtx.measureText(label);
    tempCanvas.width = Math.ceil(metrics.width) + 2;
    tempCanvas.height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 2;

    tempCtx.font = font;
    tempCtx.fillStyle = color;
    tempCtx.textBaseline = 'middle';
    tempCtx.textAlign = 'left';
    tempCtx.fillText(label, 1, tempCanvas.height / 2);

    this.cache.set(key, tempCanvas);

    // Limit cache size
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  clear() {
    this.cache.clear();
  }
}
