import { ChartWidget } from './ChartWidget';
import { CrosshairManager } from './CrosshairManager';
import { TimeScaleEngine } from './TimeScaleEngine';
import { StyleManager } from './StyleManager';

interface ChartInstance {
  widget: ChartWidget;
  crosshairManager: CrosshairManager;
  timeScale: TimeScaleEngine;
}

export class ChartLayout {
  private charts: ChartInstance[];
  private styleManager: StyleManager;
  private container: HTMLElement;

  constructor(container: HTMLElement, styleManager: StyleManager) {
    if (!container || !styleManager) throw new Error('Missing dependencies');
    this.charts = [];
    this.styleManager = styleManager;
    this.container = container;
    this.setupLayout();
  }

  private setupLayout() {
    this.container.style.display = 'grid';
    this.container.style.gridTemplateColumns = '1fr';
    this.applyTheme();
  }

  addChart(widget: ChartWidget, crosshairManager: CrosshairManager, timeScale: TimeScaleEngine) {
    const chart: ChartInstance = { widget, crosshairManager, timeScale };
    this.charts.push(chart);
    this.container.appendChild(widget['canvas']);
    this.syncCharts();
    this.updateLayout();
  }

  private syncCharts() {
    this.charts.forEach((chart, index) => {
      this.charts.forEach((other, otherIndex) => {
        if (index !== otherIndex) {
          chart.crosshairManager.link(other.crosshairManager);
          chart.timeScale.link(other.timeScale);
          chart.widget.link(other.widget);
        }
      });
    });
  }

  private updateLayout() {
    const count = this.charts.length;
    if (count > 1) {
      this.container.style.gridTemplateColumns = `repeat(${Math.ceil(count / 2)}, 1fr)`;
      this.container.style.gridTemplateRows = `repeat(${Math.ceil(count / 2)}, 1fr)`;
    } else {
      this.container.style.gridTemplateColumns = '1fr';
      this.container.style.gridTemplateRows = '1fr';
    }
  }

  private applyTheme() {
    const theme = this.styleManager.getTheme();
    this.container.style.background = theme.tooltipBackground;
    this.container.style.color = theme.tooltipColor;
  }

  removeChart(widget: ChartWidget) {
    this.charts = this.charts.filter(chart => chart.widget !== widget);
    widget['canvas'].remove();
    this.updateLayout();
  }

  destroy() {
    this.charts.forEach(chart => chart.widget.destroy());
    this.charts = [];
    this.container.innerHTML = '';
  }
}
