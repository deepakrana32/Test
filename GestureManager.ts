import { TimeScaleEngine } from './TimeScaleEngine';
import { PriceScaleEngine } from './PriceScaleEngine';
import { AnimationManager } from './AnimationManager';

export class GestureManager {
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private animationManager: AnimationManager;
  private canvas: HTMLCanvasElement;
  private touchStart: { x: number; y: number; dist: number } | null;

  constructor(canvas: HTMLCanvasElement, timeScale: TimeScaleEngine, priceScale: PriceScaleEngine, animationManager: AnimationManager) {
    if (!canvas || !timeScale || !priceScale || !animationManager) throw new Error('Missing dependencies');
    this.canvas = canvas;
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.animationManager = animationManager;
    this.touchStart = null;
    this.setupGestures();
  }

  private setupGestures() {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.touchStart = { x: touch.clientX - rect.left, y: touch.clientY - rect.top, dist: 0 };
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.touchStart = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top, dist };
      }
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      if (e.touches.length === 1 && this.touchStart) {
        const touch = e.touches[0];
        const dx = (touch.clientX - rect.left) - this.touchStart.x;
        this.timeScale.scroll(-dx / 10);
        this.touchStart.x = touch.clientX - rect.left;
      } else if (e.touches.length === 2 && this.touchStart) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = dist > this.touchStart.dist ? 1.1 : 0.9;
        this.timeScale.zoomAt(this.touchStart.x, delta);
        this.priceScale.zoomAt(this.touchStart.y, delta);
        this.touchStart.dist = dist;
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0 && this.touchStart) {
        this.animationManager.startAnimation('swipe', (dx) => this.timeScale.scroll(dx / 10), this.touchStart.x / 10);
      }
      this.touchStart = null;
    });
  }

  destroy() {
    this.canvas.removeEventListener('touchstart', () => {});
    this.canvas.removeEventListener('touchmove', () => {});
    this.canvas.removeEventListener('touchend', () => {});
  }
}
