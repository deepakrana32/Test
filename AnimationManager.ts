import { TimeScaleEngine } from './TimeScale';
import { PriceScaleEngine } from './PriceScale';

interface Animation {
  id: string;
  callback: (delta: number) => void;
  velocity: number;
  friction: number;
  startTime: number;
}

export class AnimationManager {
  private animations: Animation[];
  private timeScale: TimeScaleEngine;
  private priceScale: PriceScaleEngine;
  private rafId: number | null;

  constructor(timeScale: TimeScaleEngine, priceScale: PriceScaleEngine) {
    if (!timeScale || !priceScale) throw new Error('TimeScale or PriceScale missing');
    this.animations = [];
    this.timeScale = timeScale;
    this.priceScale = priceScale;
    this.rafId = null;
  }

  startAnimation(id: string, callback: (delta: number) => void, velocity: number, friction: number = 0.9) {
    this.stopAnimation(id);
    this.animations.push({ id, callback, velocity, friction, startTime: performance.now() });
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.animate.bind(this));
    }
  }

  stopAnimation(id: string) {
    this.animations = this.animations.filter(a => a.id !== id);
    if (this.animations.length === 0 && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private animate(timestamp: number) {
    this.animations = this.animations.filter(anim => {
      const elapsed = (timestamp - anim.startTime) / 1000;
      const delta = anim.velocity * Math.exp(-elapsed / anim.friction);
      if (Math.abs(delta) < 0.1) return false;
      anim.callback(delta);
      anim.velocity = delta;
      return true;
    });

    if (this.animations.length > 0) {
      this.rafId = requestAnimationFrame(this.animate.bind(this));
    } else {
      this.rafId = null;
    }
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.animations = [];
  }
}
