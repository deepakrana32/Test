export class PerformanceMonitor {
  private lastFrameTime: number;
  private frameCount: number;
  private fps: number;
  private listeners: ((fps: number, memory: number) => void)[];

  constructor() {
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    this.listeners = [];
    this.startMonitoring();
  }

  private startMonitoring() {
    const update = (now: number) => {
      this.frameCount++;
      const delta = now - this.lastFrameTime;
      if (delta >= 1000) {
        this.fps = (this.frameCount / delta) * 1000;
        this.frameCount = 0;
        this.lastFrameTime = now;
        this.notifyListeners();
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  getFPS(): number {
    return this.fps;
  }

  getMemory(): number {
    // @ts-ignore
    return (performance.memory?.usedJSHeapSize || 0) / 1024 / 1024; // MB
  }

  onPerformanceUpdate(callback: (fps: number, memory: number) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    const memory = this.getMemory();
    this.listeners.forEach(cb => cb(this.fps, memory));
  }

  destroy() {
    this.listeners = [];
  }
}
