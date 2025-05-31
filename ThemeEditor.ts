import { StyleManager } from './StyleManager';

interface ThemeConfig {
  crosshairColor: string;
  crosshairBackground: string;
  crosshairLabelColor: string;
  tooltipBackground: string;
  tooltipColor: string;
  buttonBackground: string;
  buttonColor: string;
}

export class ThemeEditor {
  private styleManager: StyleManager;
  private container: HTMLElement | null;

  constructor(styleManager: StyleManager) {
    if (!styleManager) throw new Error('StyleManager missing');
    this.styleManager = styleManager;
    this.container = null;
  }

  renderEditor(container: HTMLElement) {
    this.container = container;
    container.innerHTML = '';
    const theme = this.styleManager.getTheme();
    Object.entries(theme).forEach(([key, value]) => {
      const div = document.createElement('div');
      div.style.margin = '5px';
      const label = document.createElement('label');
      label.textContent = key.replace(/([A-Z])/g, ' $1').toLowerCase() + ': ';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = value;
      input.addEventListener('change', () => {
        const newTheme: Partial<ThemeConfig> = { [key]: input.value };
        this.styleManager.setTheme('custom');
        this.styleManager['themes'].set('custom', { ...theme, ...newTheme });
      });
      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    });
  }

  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
