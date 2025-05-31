import { CrosshairEvent, ChartEventType } from './ChartTypes';
import { debounce } from 'lodash';

interface EventData {
  x?: number;
  y?: number;
  dx?: number;
  delta?: number;
}

export class ChartEventManager {
  private canvas: HTMLCanvasElement;
  private listeners: Map<ChartEventType, ((data: any) => void)[]>;
  private linkedManagers: ChartEventManager[];
  private lastTouchTime: number;
  private lastTouchX: number | null;
  private touchCount: number;

  constructor(canvas: HTMLCanvasElement) {
    if (!canvas) throw new Error('Canvas is required');
    this.canvas = canvas;
    this.listeners = new Map();
    this.linkedManagers = [];
    this.lastTouchTime = 0;
    this.lastTouchX = null;
    this.touchCount = 0;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', debounce(this.handleMouseMove.bind(this), 5));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', debounce(this.handleTouchMove.bind(this), 5));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    this.canvas.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  on(type: ChartEventType, callback: (data: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  dispatchEvent(type: ChartEventType, data: any) {
    this.listeners.get(type)?.forEach(callback => callback(data));
    this.linkedManagers.forEach(manager => {
      if (['pan', 'zoom'].includes(type)) {
        manager.dispatchEvent(type, data);
      }
    });
  }

  link(manager: ChartEventManager) {
    if (!this.linkedManagers.includes(manager)) {
      this.linkedManagers.push(manager);
      manager.link(this); // Bidirectional sync
    }
  }

  private getCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX || 0 : event.clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY || 0 : event.clientY;
    return {
      x: Math.max(0, Math.min(this.canvas.width, (clientX - rect.left) * devicePixelRatio)),
      y: Math.max(0, Math.min(this.canvas.height, (clientY - rect.top) * devicePixelRatio)),
    };
  }

  private handleMouseDown(event: MouseEvent) {
    event.preventDefault();
    const { x, y } = this.getCoordinates(event);
    this.dispatchEvent('mousedown', { x, y });
  }

  private handleMouseMove(event: MouseEvent) {
    const { x, y } = this.getCoordinates(event);
    this.dispatchEvent('mousemove', { x, y });
    this.dispatchEvent('crosshair', { x, y, price: 0, time: 0, index: 0 } as CrosshairEvent);
  }

  private handleMouseUp(event: MouseEvent) {
    event.preventDefault();
    const { x, y } = this.getCoordinates(event);
    this.dispatchEvent('mouseup', { x, y });
  }

  private handleWheel(event: WheelEvent) {
    event.preventDefault();
    const { x } = this.getCoordinates(event);
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.dispatchEvent('zoom', { x, delta });
  }

  private handleTouchStart(event: TouchEvent) {
    event.preventDefault();
    this.touchCount = event.touches.length;
    const { x } = this.getCoordinates(event);
    const currentTime = performance.now();

    if (currentTime - this.lastTouchTime < 300 && this.touchCount === 1) {
      this.dispatchEvent('doubleclick', { x });
    }
    this.lastTouchTime = currentTime;
    this.lastTouchX = x;

    if (this.touchCount === 1) {
      this.dispatchEvent('mousedown', { x });
    } else if (this.touchCount === 2) {
      this.dispatchEvent('pinchstart', { x });
    }
  }

  private handleTouchMove(event: TouchEvent) {
    event.preventDefault();
    const { x } = this.getCoordinates(event);
    if (this.touchCount === 1 && this.lastTouchX !== null) {
      const dx = x - this.lastTouchX;
      this.dispatchEvent('pan', { dx });
      this.lastTouchX = x;
    } else if (this.touchCount === 2 && event.touches.length === 2) {
      const dist = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      this.dispatchEvent('pinch', { x, delta: dist });
    }
    this.dispatchEvent('crosshair', { x, price: 0, time: 0, index: 0 } as CrosshairEvent);
  }

  private handleTouchEnd(event: TouchEvent) {
    event.preventDefault();
    this.touchCount = event.touches.length;
    if (this.touchCount === 0) {
      this.lastTouchX = null;
      this.dispatchEvent('mouseup', {});
    }
  }

  private handleDoubleClick(event: MouseEvent) {
    const { x } = this.getCoordinates(event);
    this.dispatchEvent('doubleclick', { x });
  }

  private handleMouseEnter(event: MouseEvent) {
    this.dispatchEvent('mouseenter', {});
  }

  private handleMouseLeave(event: MouseEvent) {
    this.dispatchEvent('mouseleave', {});
    this.dispatchEvent('crosshair', { x: -1, y: -1, price: 0, time: 0, index: -1 } as CrosshairEvent);
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? 10 : event.key === 'ArrowRight' ? -10 : 0;
      const delta = event.key === 'ArrowUp' ? 1.1 : event.key === 'ArrowDown' ? 0.9 : 1;
      if (dx !== 0) this.dispatchEvent('pan', { dx });
      if (delta !== 1) this.dispatchEvent('zoom', { x: this.canvas.width / 2, delta });
    }
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    this.canvas.removeEventListener('mouseenter', this.handleMouseEnter);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
    this.listeners.clear();
    this.linkedManagers = [];
  }
}
