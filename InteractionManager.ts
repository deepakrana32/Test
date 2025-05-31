import { ChartWidget } from './ChartWidget';
import { CrosshairManager } from './CrosshairManager';
import { TimeScaleEngine } from './TimeScaleEngine';
import { PriceScaleEngine } from './PriceScaleEngine';
import { AnimationManager } from './AnimationManager';
import { StyleManager } from './StyleManager';
import { debounce } from 'lodash';

export class InteractionManager {
  private widget: ChartWidget;
  private crosshairManager: CrosshairManager;
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private animationManager: AnimationManager;
  private styleManager: StyleManager;
  private isDragging: boolean;

  constructor(
    widget: ChartWidget,
    crosshairManager: CrosshairManager,
    timeScale: TimeScaleEngine,
    priceScale: PriceScaleEngine,
    animationManager: AnimationManager,
    styleManager: StyleManager
  ) {
    if (!widget || !crosshairManager || !timeScale || !priceScale || !animationManager || !styleManager) {
      throw new Error('Missing dependencies');
    }
    this.widget = widget;
    this.crosshairManager = crosshairManager;
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.animationManager = animationManager;
    this.styleManager = styleManager;
    this.isDragging = false;
    this.setupInteractions();
  }

  private setupInteractions() {
    const canvas = this.widget['canvas'];
    const debouncedMouseMove = debounce((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.crosshairManager.setPosition(e.clientX - rect.left, e.clientY - rect.top);
    }, 5);

    canvas.addEventListener('mousemove', debouncedMouseMove);
    canvas.addEventListener('mouseleave', () => this.crosshairManager.setPosition(null, null));

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        canvas.style.cursor = 'grabbing';
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const dx = e.movementX;
        this.timeScale.scroll(-dx / 10);
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        canvas.style.cursor = 'default';
        this.animationManager.startAnimation('drag', (dx) => this.timeScale.scroll(dx / 10), 10);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.timeScale.zoomAt(e.clientX - rect.left, delta);
      this.priceScale.zoomAt(e.clientY - rect.top, delta);
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      canvas.setAttribute('aria-label', `Chart clicked at x: ${x}, y: ${y} at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    });
  }

  destroy() {
    const canvas = this.widget['canvas'];
    canvas.removeEventListener('mousemove', () => {});
    canvas.removeEventListener('mouseleave', () => {});
    canvas.removeEventListener('mousedown', () => {});
    canvas.removeEventListener('mouseup', () => {});
    canvas.removeEventListener('wheel', () => {});
    canvas.removeEventListener('click', () => {});
  }
}
