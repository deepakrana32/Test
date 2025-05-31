import { ChartWidget } from './ChartWidget';
import { CrosshairManager } from './CrosshairManager';
import { TimeScaleEngine } from './TimeScaleEngine';
import { PriceScaleEngine } from './PriceScaleEngine';
import { debounce } from 'lodash';

export class EventManager {
  private widget: ChartWidget;
  private crosshairManager: CrosshairManager;
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private touchStart: { x: number; y: number; time: number } | null;

  constructor(widget: ChartWidget, crosshairManager: CrosshairManager, timeScale: TimeScaleEngine, priceScale: PriceScaleEngine) {
    if (!widget || !crosshairManager || !timeScale || !priceScale) throw new Error('Missing dependencies');
    this.widget = widget;
    this.crosshairManager = crosshairManager;
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.touchStart = null;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    const canvas = this.widget['canvas'];
    const debouncedMouseMove = debounce((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.crosshairManager.setPosition(e.clientX - rect.left, e.clientY - rect.top);
    }, 5);

    canvas.addEventListener('mousemove', debouncedMouseMove);
    canvas.addEventListener('mouseleave', () => this.crosshairManager.setPosition(null, null));

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.timeScale.zoomAt(e.clientX - rect.left, delta);
      this.priceScale.zoomAt(e.clientY - rect.top, delta);
    });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.touchStart = { x: touch.clientX - rect.left, y: touch.clientY - rect.top, time: Date.now() };
      this.crosshairManager.setPosition(this.touchStart.x, this.touchStart.y);
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.crosshairManager.setPosition(x, y);

      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = dist > 100 ? 1.1 : 0.9;
        this.timeScale.zoomAt(x, delta);
        this.priceScale.zoomAt(y, delta);
      }
    });

    canvas.addEventListener('touchend', () => {
      this.touchStart = null;
    });
  }

  destroy() {
    const canvas = this.widget['canvas'];
    canvas.removeEventListener('mousemove', () => {});
    canvas.removeEventListener('mouseleave', () => {});
    canvas.removeEventListener('wheel', () => {});
    canvas.removeEventListener('touchstart', () => {});
    canvas.removeEventListener('touchmove', () => {});
    canvas.removeEventListener('touchend', () => {});
  }
}
