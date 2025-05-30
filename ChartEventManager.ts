```typescript
// ChartEventManager.ts

// Interface for event configuration options
interface ChartEventConfig {
  /** Whether event listeners are passive (default: false for touch, true for others) */
  passive?: boolean;
  /** Whether to use capture phase for event listeners (default: false) */
  capture?: boolean;
}

// Interface for zoom event data
interface ZoomEvent {
  /** Zoom delta (positive for zoom in, negative for zoom out) */
  delta: number;
  /** X-coordinate in canvas space */
  x: number;
}

// Interface for pan event data
interface PanEvent {
  /** X-axis panning distance */
  dx: number;
}

// Interface for click event data
interface ClickEvent {
  /** X-coordinate in canvas space */
  x: number;
  /** Y-coordinate in canvas space */
  y: number;
}

// Union type for all possible event data
type ChartEventData = ZoomEvent | PanEvent | ClickEvent;

// Type for event handlers
type ChartEventHandler = (data: ChartEventData) => void;

// Supported event types
type ChartEventType = 'zoom' | 'pan' | 'click';

/**
 * Manages user input events (mouse, touch, wheel) for a chart canvas.
 * Emits custom events (e.g., zoom, pan, click) to registered handlers.
 */
export class ChartEventManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: ChartEventConfig;
  private listeners: { [key in ChartEventType]?: ChartEventHandler[] } = {};
  private isAttached: boolean = false;
  private isDragging: boolean = false;
  private lastX: number = 0;
  private lastTouchTime: number = 0;
  private readonly handlers: {
    wheel: (e: WheelEvent) => void;
    mouseDown: (e: MouseEvent) => void;
    mouseMove: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    click: (e: MouseEvent) => void;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
  };

  /**
   * Creates a new ChartEventManager instance.
   * @param canvas The HTML canvas element to attach events to.
   * @param config Optional event configuration.
   * @throws Error if canvas is invalid.
   */
  constructor(canvas: HTMLCanvasElement, config: ChartEventConfig = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas: must be an HTMLCanvasElement');
    }

    this.canvas = canvas;
    this.config = {
      passive: config.passive,
      capture: config.capture ?? false,
    };

    // Bind event handlers to avoid recreating functions
    this.handlers = {
      wheel: this.onWheel.bind(this),
      mouseDown: this.onMouseDown.bind(this),
      mouseMove: this.onMouseMove.bind(this),
      mouseUp: this.onMouseUp.bind(this),
      click: this.onClick.bind(this),
      touchStart: this.onTouchStart.bind(this),
      touchMove: this.onTouchMove.bind(this),
      touchEnd: this.onTouchEnd.bind(this),
    };

    this.attach();
  }

  /**
   * Attaches event listeners to the canvas.
   */
  private attach(): void {
    if (this.isAttached) {
      console.warn('ChartEventManager already attached');
      return;
    }

    const { passive, capture } = this.config;
    this.canvas.addEventListener('wheel', this.handlers.wheel, { passive: passive ?? true, capture });
    this.canvas.addEventListener('mousedown', this.handlers.mouseDown, { passive: passive ?? true, capture });
    this.canvas.addEventListener('mousemove', this.handlers.mouseMove, { passive: passive ?? true, capture });
    this.canvas.addEventListener('mouseup', this.handlers.mouseUp, { passive: passive ?? true, capture });
    this.canvas.addEventListener('click', this.handlers.click, { passive: passive ?? true, capture });
    this.canvas.addEventListener('touchstart', this.handlers.touchStart, { passive: passive ?? false, capture });
    this.canvas.addEventListener('touchmove', this.handlers.touchMove, { passive: passive ?? false, capture });
    this.canvas.addEventListener('touchend', this.handlers.touchEnd, { passive: passive ?? true, capture });

    this.isAttached = true;
  }

  /**
   * Registers a handler for a specific event type.
   * @param event The event type (e.g., 'zoom', 'pan', 'click').
   * @param handler The handler function to call when the event is emitted.
   * @throws Error if event or handler is invalid.
   */
  public on(event: ChartEventType, handler: ChartEventHandler): void {
    if (!['zoom', 'pan', 'click'].includes(event)) {
      throw new Error(`Invalid event type: ${event}`);
    }
    if (typeof handler !== 'function') {
      throw new Error('Invalid handler: must be a function');
    }

    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
  }

  /**
   * Removes a specific handler for an event type.
   * @param event The event type.
   * @param handler The handler to remove.
   */
  public removeListener(event: ChartEventType, handler: ChartEventHandler): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event]!.filter(h => h !== handler);
      if (this.listeners[event]!.length === 0) {
        delete this.listeners[event];
      }
    }
  }

  /**
   * Emits an event to all registered handlers.
   * @param event The event type.
   * @param data The event data.
   */
  public emit(event: ChartEventType, data: ChartEventData): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Handler for ${event} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    }
  }

  /**
   * Detaches all event listeners and clears state.
   */
  public detach(): void {
    if (!this.isAttached) {
      return;
    }

    const { passive, capture } = this.config;
    this.canvas.removeEventListener('wheel', this.handlers.wheel, { passive: passive ?? true, capture });
    this.canvas.removeEventListener('mousedown', this.handlers.mouseDown, { passive: passive ?? true, capture });
    this.canvas.removeEventListener('mousemove', this.handlers.mouseMove, { passive: passive ?? true, capture });
    this.canvas.removeEventListener('mouseup', this.handlers.mouseUp, { passive: passive ?? true, capture });
    this.canvas.removeEventListener('click', this.handlers.click, { passive: passive ?? true, capture });
    this.canvas.removeEventListener('touchstart', this.handlers.touchStart, { passive: passive ?? false, capture });
    this.canvas.removeEventListener('touchmove', this.handlers.touchMove, { passive: passive ?? false, capture });
    this.canvas.removeEventListener('touchend', this.handlers.touchEnd, { passive: passive ?? true, capture });

    this.listeners = {};
    this.isDragging = false;
    this.lastX = 0;
    this.lastTouchTime = 0;
    this.isAttached = false;
  }

  /**
   * Converts screen coordinates to canvas coordinates.
   * @param x Screen X coordinate.
   * @param y Screen Y coordinate.
   * @returns Canvas coordinates [x, y].
   */
  private getCanvasCoordinates(x: number, y: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [(x - rect.left) * (this.canvas.width / rect.width), (y - rect.top) * (this.canvas.height / rect.height)];
  }

  private onWheel(event: WheelEvent): void {
    if (!event.deltaY) return;

    event.preventDefault();
    const [x] = this.getCanvasCoordinates(event.clientX, event.clientY);
    const zoomDelta = -event.deltaY * 0.001;
    if (Math.abs(zoomDelta) > 0.0001) {
      this.emit('zoom', { delta: zoomDelta, x });
    }
  }

  private onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.lastX = event.clientX;
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    const delta = event.clientX - this.lastX;
    if (Math.abs(delta) > 0) {
      this.emit('pan', { dx: delta });
      this.lastX = event.clientX;
    }
  }

  private onMouseUp(_event: MouseEvent): void {
    this.isDragging = false;
  }

  private onClick(event: MouseEvent): void {
    const [x, y] = this.getCanvasCoordinates(event.clientX, event.clientY);
    this.emit('click', { x, y });
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
    }
    if (event.touches.length === 1) {
      this.lastX = event.touches[0].clientX;
      this.lastTouchTime = Date.now();
    }
  }

  private onTouchMove(event: TouchEvent): void {
    const now = Date.now();
    if (now - this.lastTouchTime < 16) return; // Debounce: ~60fps
    this.lastTouchTime = now;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - this.lastX;
      if (Math.abs(dx) > 0) {
        this.emit('pan', { dx: -dx });
        this.lastX = touch.clientX;
      }
    } else if (event.touches.length === 2) {
      event.preventDefault();
      const dx = Math.abs(event.touches[1].clientX - event.touches[0].clientX);
      const [x] = this.getCanvasCoordinates(
        (event.touches[0].clientX + event.touches[1].clientX) / 2,
        event.touches[0].clientY
      );
      this.emit('zoom', { delta: dx * 0.01, x });
    }
  }

  private onTouchEnd(_event: TouchEvent): void {
    this.lastX = 0;
    this.lastTouchTime = 0;
  }
}
```