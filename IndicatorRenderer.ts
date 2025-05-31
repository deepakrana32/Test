import { ChartPlugins } from './ChartPlugins';
import { StyleManager } from './StyleManager';
import { drawLine } from './canvas-utils';

interface IndicatorData {
  id: string;
  values: Float32Array;
  color: string;
}

export class IndicatorRenderer {
  private plugins: ChartPlugins;
  private styleManager: StyleManager;
  private gl: WebGL2RenderingContext | null;
  private indicators: IndicatorData[];

  constructor(plugins: ChartPlugins, styleManager: StyleManager, canvas: HTMLCanvasElement) {
    if (!plugins || !styleManager || !canvas) throw new Error('Missing dependencies');
    this.plugins = plugins;
    this.styleManager = styleManager;
    this.gl = canvas.getContext('webgl2');
    this.indicators = [];
    if (this.gl) this.setupWebGL();
  }

  private setupWebGL() {
    if (!this.gl) return;
    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;
    const program = this.gl.createProgram()!;
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(vs, vsSource);
    this.gl.shaderSource(fs, fsSource);
    this.gl.compileShader(vs);
    this.gl.compileShader(fs);
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    this.gl.useProgram(program);
  }

  setIndicators(indicators: IndicatorData[]) {
    this.indicators = indicators.filter(i => i.values.length > 0);
  }

  render2D(ctx: CanvasRenderingContext2D, width: number, height: number, scaleX: (index: number) => number, scaleY: (price: number) => number) {
    this.indicators.forEach(indicator => {
      for (let i = 1; i < indicator.values.length; i++) {
        const x1 = scaleX(i - 1);
        const y1 = scaleY(indicator.values[i - 1]);
        const x2 = scaleX(i);
        const y2 = scaleY(indicator.values[i]);
        drawLine(ctx, x1, y1, x2, y2, indicator.color, 1, false);
      }
    });
  }

  renderWebGL(scaleX: (index: number) => number, scaleY: (price: number) => number) {
    if (!this.gl) return;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.indicators.forEach(indicator => {
      const vertices = new Float32Array(indicator.values.length * 4);
      for (let i = 0; i < indicator.values.length; i++) {
        vertices[i * 4] = scaleX(i) / this.gl.canvas.width * 2 - 1;
        vertices[i * 4 + 1] = scaleY(indicator.values[i]) / this.gl.canvas.height * 2 - 1;
        vertices[i * 4 + 2] = scaleX(i + 1) / this.gl.canvas.width * 2 - 1;
        vertices[i * 4 + 3] = scaleY(indicator.values[i + 1] || indicator.values[i]) / this.gl.canvas.height * 2 - 1;
      }

      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

      const position = this.gl.getAttribLocation(this.gl.getParameter(this.gl.CURRENT_PROGRAM), 'a_position');
      this.gl.enableVertexAttribArray(position);
      this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);

      const color = this.gl.getUniformLocation(this.gl.getParameter(this.gl.CURRENT_PROGRAM), 'u_color');
      const theme = this.styleManager.getTheme();
      this.gl.uniform4f(color, parseInt(theme.crosshairColor.slice(1, 3), 16) / 255, parseInt(theme.crosshairColor.slice(3, 5), 16) / 255, parseInt(theme.crosshairColor.slice(5, 7), 16) / 255, 1);

      this.gl.drawArrays(this.gl.LINES, 0, vertices.length / 2);
    });
  }

  destroy() {
    this.indicators = [];
    if (this.gl) {
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.gl = null;
    }
  }
}
