import { ChartWidget } from './ChartWidget';
import { StyleManager } from './StyleManager';
import { v4 as uuidv4 } from 'uuid';

export class ExportManager {
  private widget: ChartWidget;
  private styleManager: StyleManager;

  constructor(widget: ChartWidget, styleManager: StyleManager) {
    if (!widget || !styleManager) throw new Error('Missing dependencies');
    this.widget = widget;
    this.styleManager = styleManager;
  }

  exportPNG() {
    const canvas = this.widget['canvas'];
    const link = document.createElement('a');
    link.download = `chart-${uuidv4()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    canvas.setAttribute('aria-label', `Chart exported as PNG at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  }

  exportSVG() {
    const canvas = this.widget['canvas'];
    const ctx = canvas.getContext('2d')!;
    const theme = this.styleManager.getTheme();
    const svg = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fff"/>
      <text x="10" y="20" fill="${theme.tooltipColor}" font-family="Arial" font-size="12">Exported at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</text>
    </svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `chart-${uuidv4()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    canvas.setAttribute('aria-label', `Chart exported as SVG at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  }
}
