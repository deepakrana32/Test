import { StyleManager } from './StyleManager';

interface ErrorMessage {
  id: string;
  message: string;
  timestamp: number;
}

export class ErrorHandler {
  private styleManager: StyleManager;
  private errors: ErrorMessage[];
  private listeners: ((error: ErrorMessage) => void)[];

  constructor(styleManager: StyleManager) {
    if (!styleManager) throw new Error('StyleManager missing');
    this.styleManager = styleManager;
    this.errors = [];
    this.listeners = [];
    this.setupGlobalErrorHandler();
  }

  private setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message));
    });
  }

  handleError(error: Error) {
    const errorMessage: ErrorMessage = {
      id: `error-${Date.now()}`,
      message: error.message || 'An unexpected error occurred',
      timestamp: Date.now(),
    };
    this.errors.push(errorMessage);
    this.notifyListeners(errorMessage);
    this.displayError(errorMessage);
    this.attemptRecovery(error);
  }

  private displayError(error: ErrorMessage) {
    const theme = this.styleManager.getTheme();
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '10px';
    div.style.right = '10px';
    div.style.background = theme.tooltipBackground;
    div.style.color = theme.tooltipColor;
    div.style.padding = '10px';
    div.style.borderRadius = '4px';
    div.textContent = error.message;
    div.setAttribute('aria-live', 'assertive');
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }

  private attemptRecovery(error: Error) {
    // Placeholder recovery logic
    if (error.message.includes('WebGL')) {
      console.warn('WebGL failed, falling back to 2D canvas');
    }
  }

  onError(callback: (error: ErrorMessage) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(error: ErrorMessage) {
    this.listeners.forEach(cb => cb(error));
  }

  getErrors(): ErrorMessage[] {
    return this.errors;
  }

  destroy() {
    this.errors = [];
    this.listeners = [];
    window.removeEventListener('error', () => {});
  }
}
