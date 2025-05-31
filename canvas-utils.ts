export function clearCanvas(ctx: CanvasRenderingContext2D | WebGL2RenderingContext, width: number, height: number) {
  if (ctx instanceof CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
  }
}

export function drawLine(
  ctx: CanvasRenderingContext2D | WebGL2RenderingContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number = 1,
  dashed: boolean = false
) {
  if (ctx instanceof CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  } else {
    // WebGL line drawing (simplified)
    const shaderProgram = createLineShader(ctx);
    const vertices = new Float32Array([x1, y1, x2, y2]);
    const buffer = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
    ctx.bufferData(ctx.ARRAY_BUFFER, vertices, ctx.STATIC_DRAW);
    ctx.useProgram(shaderProgram);
    ctx.drawArrays(ctx.LINES, 0, 2);
  }
}

function createLineShader(gl: WebGL2RenderingContext): WebGLProgram {
  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `;
  const fsSource = `
    precision mediump float;
    void main() {
      gl_FragColor = vec4(1, 0, 0, 1); // Red for simplicity
    }
  `;
  const program = gl.createProgram()!;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(vs, vsSource);
  gl.shaderSource(fs, fsSource);
  gl.compileShader(vs);
  gl.compileShader(fs);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return program;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string = '12px Arial',
  background?: string
) {
  ctx.font = font;
  ctx.fillStyle = background || 'transparent';
  if (background) {
    const metrics = ctx.measureText(text);
    ctx.fillRect(x - 2, y - 12, metrics.width + 4, 16);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
