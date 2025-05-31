import { ChartWidget } from './ChartWidget';
import { CrosshairManager } from './CrosshairManager';
import { DrawingToolManager } from './DrawingToolManager';

export class AccessibilityManager {
  private widget: ChartWidget;
  private crosshairManager: CrosshairManager;
  private drawingToolManager: DrawingToolManager;

  constructor(widget: ChartWidget, crosshairManager: CrosshairManager, drawingToolManager: DrawingToolManager) {
    if (!widget || !crosshairManager || !drawingToolManager) throw new Error('Missing dependencies');
    this.widget = widget;
    this.crosshairManager = crosshairManager;
    this.drawingToolManager = drawingToolManager;
    this.setupAccessibility();
  }

  private setupAccessibility() {
    const canvas = this.widget['canvas'];
    canvas.tabIndex = 0; // Make focusable
    canvas.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':
          this.widget['priceScale'].zoomAt(canvas.height / 2, 1.1);
          break;
        case 'ArrowDown':
          this.widget['priceScale'].zoomAt(canvas.height / 2, 0.9);
          break;
        case 'ArrowLeft':
          this.widget['timeScale'].scroll(10);
          break;
        case 'ArrowRight':
          this.widget['timeScale'].scroll(-10);
          break;
        case 'l':
          this.drawingToolManager.startDrawing('line', canvas.width / 2, canvas.height / 2);
          break;
        case 'f':
          this.drawingToolManager.startDrawing('fibonacci', canvas.width / 2, canvas.height / 2);
          break;
        case 'Enter':
          this.drawingToolManager.endDrawing();
          break;
      }
      e.preventDefault();
    });

    canvas.addEventListener('focus', () => {
      canvas.setAttribute('aria-label', 'Chart widget focused');
    });

    canvas.addEventListener('blur', () => {
      canvas.setAttribute('aria-label', 'Chart widget');
    });
  }

  destroy() {
    const canvas = this.widget['canvas'];
    canvas.removeEventListener('keydown', () => {});
    canvas.removeEventListener('focus', () => {});
    canvas.removeEventListener('blur', () => {});
  }
}
