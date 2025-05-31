import { debounce } from 'lodash';

export class KineticAnimation {
  private callback: (dx: number) => void;
  private lastX: number | null;
  private velocity: number;
  private lastTime: number;
  private animationFrameId: number | null;
  private friction: number;
  private threshold: number;

  constructor(callback: (dx: number) => void) {
    this.callback = callback;
    this.lastX = null;
    this.velocity = 0;
    this.lastTime = 0;
    this.animationFrameId = null;
    this.friction = 0.95;
    this.threshold = 0.1;
  }

  start(x: number) {
    this.lastX = x;
    this.velocity = 0;
    this.lastTime = performance.now();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  update(x: number) {
    if (this.lastX === null) return;
    const currentTime = performance.now();
    const dt = (currentTime - this.lastTime) / 1000;
    if (dt === 0) return;

    const dx = x - this.lastX;
    this.velocity = dx / dt;
    this.lastX = x;
    this.lastTime = currentTime;

    this.callback(dx);
  }

  stop() {
    if (Math.abs(this.velocity) < this.threshold || this.animationFrameId) return;
    this.animate();
  }

  private animate() {
    this.animationFrameId = requestAnimationFrame(() => {
      const currentTime = performance.now();
      const dt = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;

      this.velocity *= this.friction;
      if (Math.abs(this.velocity) < this.threshold) {
        this.animationFrameId = null;
        return;
      }

      const dx = this.velocity * dt;
      this.callback(dx);
      this.animate();
    });
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.lastX = null;
    this.velocity = 0;
  }
}
