interface Theme {
  crosshairColor: string;
  crosshairBackground: string;
  crosshairLabelColor: string;
  tooltipBackground: string;
  tooltipColor: string;
  buttonBackground: string;
  buttonColor: string;
}

export class StyleManager {
  private themes: Map<string, Theme>;
  private activeTheme: string;

  constructor() {
    this.themes = new Map([
      ['default', {
        crosshairColor: '#888',
        crosshairBackground: 'rgba(0, 0, 0, 0.7)',
        crosshairLabelColor: '#fff',
        tooltipBackground: 'rgba(0, 0, 0, 0.7)',
        tooltipColor: '#fff',
        buttonBackground: '#007bff',
        buttonColor: '#fff',
      }],
      ['dark', {
        crosshairColor: '#aaa',
        crosshairBackground: 'rgba(50, 50, 50, 0.8)',
        crosshairLabelColor: '#ddd',
        tooltipBackground: 'rgba(50, 50, 50, 0.8)',
        tooltipColor: '#ddd',
        buttonBackground: '#0056b3',
        buttonColor: '#eee',
      }],
    ]);
    this.activeTheme = 'default';
  }

  setTheme(themeName: string) {
    if (this.themes.has(themeName)) {
      this.activeTheme = themeName;
    }
  }

  getTheme(): Theme {
    return this.themes.get(this.activeTheme)!;
  }

  applyButtonStyle(button: HTMLButtonElement) {
    const theme = this.getTheme();
    button.style.background = theme.buttonBackground;
    button.style.color = theme.buttonColor;
    button.style.border = 'none';
    button.style.padding = '8px 16px';
    button.style.borderRadius = '4px';
  }

  getCrosshairParams() {
    const theme = this.getTheme();
    return {
      color: theme.crosshairColor,
      dashed: true,
      labelBackground: theme.crosshairBackground,
      labelColor: theme.crosshairLabelColor,
    };
  }

  getTooltipOptions() {
    const theme = this.getTheme();
    return {
      background: theme.tooltipBackground,
      color: theme.tooltipColor,
      font: '12px Arial',
    };
  }
}
