import { IndicatorManager } from './IndicatorManager';
import { StyleManager } from './StyleManager';

interface IndicatorParameters {
  [key: string]: number | string | boolean;
}

interface IndicatorDefinition {
  id: string;
  name: string;
  parameters: IndicatorParameters;
}

export class IndicatorConfig {
  private indicatorManager: IndicatorManager;
  private styleManager: StyleManager;
  private configurations: IndicatorDefinition[];

  constructor(indicatorManager: IndicatorManager, styleManager: StyleManager) {
    if (!indicatorManager || !styleManager) throw new Error('Missing dependencies');
    this.indicatorManager = indicatorManager;
    this.styleManager = styleManager;
    this.configurations = [
      { id: 'sma', name: 'Simple Moving Average', parameters: { period: 14 } },
      { id: 'ema', name: 'Exponential Moving Average', parameters: { period: 14 } },
      { id: 'bollinger', name: 'Bollinger Bands', parameters: { period: 20, stdDev: 2 } },
      { id: 'macd', name: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } },
      { id: 'rsi', name: 'RSI', parameters: { period: 14 } },
      { id: 'ichimoku', name: 'Ichimoku Cloud', parameters: { tenkan: 9, kijun: 26, senkou: 52 } },
    ];
  }

  addIndicator(id: string, parameters: IndicatorParameters) {
    const config = this.configurations.find(c => c.id === id);
    if (config) {
      Object.assign(config.parameters, parameters);
      this.indicatorManager.addIndicator(id);
    } else {
      throw new Error(`Unknown indicator: ${id}`);
    }
  }

  getIndicatorConfig(id: string): IndicatorDefinition | undefined {
    return this.configurations.find(c => c.id === id);
  }

  renderConfigUI(container: HTMLElement) {
    container.innerHTML = '';
    this.configurations.forEach(config => {
      const div = document.createElement('div');
      div.style.margin = '10px';
      div.style.padding = '10px';
      div.style.background = this.styleManager.getTheme().tooltipBackground;
      div.style.color = this.styleManager.getTheme().tooltipColor;
      div.innerHTML = `<strong>${config.name}</strong>`;
      Object.entries(config.parameters).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = typeof value === 'number' ? 'number' : 'text';
        input.value = value.toString();
        input.addEventListener('change', () => {
          config.parameters[key] = input.type === 'number' ? parseFloat(input.value) : input.value;
          this.indicatorManager.removeIndicator(config.id);
          this.indicatorManager.addIndicator(config.id);
        });
        div.appendChild(document.createElement('br'));
        div.appendChild(document.createTextNode(`${key}: `));
        div.appendChild(input);
      });
      container.appendChild(div);
    });
  }

  destroy() {
    this.configurations = [];
  }
}
