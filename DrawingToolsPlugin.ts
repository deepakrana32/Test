```typescript
// DrawingToolsPlugin.ts
import { ChartPlugin } from './ChartPlugins';
import { DrawingTool, DrawingToolData, PriceScaleResult, TimeScaleResult, LineStyle, LineEnd, BoxHorizontalAlignment, BoxVerticalAlignment } from '@/types/ChartTypes';
import { Candle } from '@/types/Candle';

interface DrawingToolsPluginConfig {
  tools: DrawingTool[];
  candles: Candle[];
  scaleX: (index: number) => number;
  scaleY: (price: number) => number;
  unscaleX: (x: number) => number;
  unscaleY: (y: number) => number;
}

function applyLineStyle(ctx: CanvasRenderingContext2D, style: LineStyle) {
  switch (style) {
    case LineStyle.Dashed:
      ctx.setLineDash([5, 5]);
      break;
    case LineStyle.Dotted:
      ctx.setLineDash([2, 2]);
      break;
    default:
      ctx.setLineDash([]);
  }
}

function drawCircleEnd(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, pixelRatio: number) {
  ctx.beginPath();
  ctx.arc(x * pixelRatio, y * pixelRatio, width * pixelRatio, 0, 2 * Math.PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

function drawArrowEnd(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, pixelRatio: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 10 * pixelRatio;
  const arrowWidth = 5 * pixelRatio;
  ctx.beginPath();
  ctx.moveTo(x2 * pixelRatio, y2 * pixelRatio);
  ctx.lineTo(
    (x2 - arrowLength * Math.cos(angle - Math.PI / 6)) * pixelRatio,
    (y2 - arrowLength * Math.sin(angle - Math.PI / 6)) * pixelRatio
  );
  ctx.lineTo(
    (x2 - arrowLength * Math.cos(angle + Math.PI / 6)) * pixelRatio,
    (y2 - arrowLength * Math.sin(angle + Math.PI / 6)) * pixelRatio
  );
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

function drawText(ctx: CanvasRenderingContext2D, text: TextOptions, x: number, y: number, angle: number, pixelRatio: number) {
  ctx.save();
  ctx.translate(x * pixelRatio, y * pixelRatio);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.font = `${text.font.bold ? 'bold ' : ''}${text.font.italic ? 'italic ' : ''}${text.font.size * pixelRatio}px ${text.font.family}`;
  ctx.fillStyle = text.font.color;

  if (text.box.background?.color) {
    const textWidth = ctx.measureText(text.value).width / pixelRatio;
    const textHeight = text.font.size;
    const padding = text.box.padding || 2;
    ctx.fillStyle = text.box.background.color;
    ctx.fillRect(
      -textWidth / 2 - padding,
      -textHeight / 2 - padding,
      textWidth + 2 * padding,
      textHeight + 2 * padding
    );
  }

  ctx.textAlign = text.box.alignment.horizontal;
  ctx.textBaseline =
    text.box.alignment.vertical === BoxVerticalAlignment.Top ? 'top' :
    text.box.alignment.vertical === BoxVerticalAlignment.Bottom ? 'bottom' : 'middle';
  ctx.fillText(text.value, 0, 0);
  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, line: LineOptions, pixelRatio: number, extendLeft: boolean, extendRight: boolean) {
  let startX = x1;
  let startY = y1;
  let endX = x2;
  let endY = y2;

  if (extendLeft || extendRight) {
    const slope = (y2 - y1) / (x2 - x1);
    if (extendLeft) {
      startX = 0;
      startY = y2 - slope * (x2 - startX);
    }
    if (extendRight) {
      endX = ctx.canvas.width / pixelRatio;
      endY = y1 + slope * (endX - x1);
    }
  }

  ctx.beginPath();
  ctx.strokeStyle = line.color;
  ctx.lineWidth = line.width * pixelRatio;
  applyLineStyle(ctx, line.style);
  ctx.moveTo(startX * pixelRatio, startY * pixelRatio);
  ctx.lineTo(endX * pixelRatio, endY * pixelRatio);
  ctx.stroke();
  ctx.setLineDash([]);

  if (line.end.left === LineEnd.Circle) {
    drawCircleEnd(ctx, startX, startY, line.width, pixelRatio);
  }
  if (line.end.right === LineEnd.Circle) {
    drawCircleEnd(ctx, endX, endY, line.width, pixelRatio);
  }
  if (line.end.right === LineEnd.Arrow) {
    drawArrowEnd(ctx, startX, startY, endX, endY, line.width, pixelRatio);
  }
}

export function createDrawingToolsPlugin(config: DrawingToolsPluginConfig): ChartPlugin {
  const { tools, candles, scaleX, scaleY, unscaleX, unscaleY } = config;

  return {
    name: 'DrawingTools',
    priority: 6,
    render2D: (ctx: CanvasRenderingContext2D) => {
      const pixelRatio = window.devicePixelRatio || 1;
      ctx.save();

      tools.forEach(tool => {
        ctx.save();
        const data = tool.data as DrawingToolData;

        if (tool.type === 'trendline') {
          const d = data as TrendLineData;
          drawLine(ctx, scaleX(d.startIndex), scaleY(d.startPrice), scaleX(d.endIndex), scaleY(d.endPrice), d.line, pixelRatio, false, false);
          if (d.text?.value) {
            const x1 = scaleX(d.startIndex);
            const y1 = scaleY(d.startPrice);
            const x2 = scaleX(d.endIndex);
            const y2 = scaleY(d.endPrice);
            const angle = Math.atan((y2 - y1) / (x2 - x1)) * (180 / Math.PI);
            const pivot = d.text.box.alignment.horizontal === BoxHorizontalAlignment.Left ? { x: x1, y: y1 } :
                          d.text.box.alignment.horizontal === BoxHorizontalAlignment.Right ? { x: x2, y: y2 } :
                          { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
            drawText(ctx, d.text, pivot.x, pivot.y, angle, pixelRatio);
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [d.startIndex, d.endIndex].forEach((index, i) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(i === 0 ? d.startPrice : d.endPrice) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'rectangle') {
          const d = data as RectangleData;
          const x1 = scaleX(d.startIndex);
          const y1 = scaleY(d.startPrice);
          const x2 = scaleX(d.endIndex);
          const y2 = scaleY(d.endPrice);
          const left = Math.min(x1, x2);
          const top = Math.min(y1, y2);
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);

          if (d.fill) {
            ctx.fillStyle = d.fill.color;
            ctx.globalAlpha = d.fill.opacity;
            ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.strokeStyle = d.line.color;
          ctx.lineWidth = d.line.width * pixelRatio;
          applyLineStyle(ctx, d.line.style);
          ctx.rect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
          ctx.stroke();
          ctx.setLineDash([]);

          if (d.text?.value) {
            drawText(ctx, d.text, left + width / 2, top + height / 2, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].forEach(([x, y]) => {
              ctx.beginPath();
              ctx.arc(x * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'fibonacci') {
          const d = data as FibonacciData;
          const x1 = scaleX(d.startIndex);
          const y1 = scaleY(d.startPrice);
          const x2 = scaleX(d.endIndex);
          const y2 = scaleY(d.endPrice);
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);

          d.levels.forEach(level => {
            const y = scaleY(level.price);
            ctx.beginPath();
            ctx.strokeStyle = level.line.color;
            ctx.lineWidth = level.line.width * pixelRatio;
            applyLineStyle(ctx, level.line.style);
            ctx.moveTo(left * pixelRatio, y * pixelRatio);
            ctx.lineTo(right * pixelRatio, y * pixelRatio);
            ctx.stroke();
            ctx.setLineDash([]);

            if (level.label) {
              drawText(ctx, {
                value: level.label,
                font: { color: level.line.color, size: 12, bold: false, italic: false, family: 'Arial' },
                box: { alignment: { vertical: 'middle', horizontal: 'right' }, angle: 0, scale: 1 }
              }, right, y, 0, pixelRatio);
            }
          });

          if (d.selected) {
            ctx.fillStyle = d.levels[0].line.color;
            [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'horizontalLine') {
          const d = data as HorizontalLineData;
          const y = scaleY(d.price);
          ctx.beginPath();
          ctx.strokeStyle = d.line.color;
          ctx.lineWidth = d.line.width * pixelRatio;
          applyLineStyle(ctx, d.line.style);
          ctx.moveTo(0, y * pixelRatio);
          ctx.lineTo(ctx.canvas.width, y * pixelRatio);
          ctx.stroke();
          ctx.setLineDash([]);

          if (d.text?.value) {
            drawText(ctx, d.text, ctx.canvas.width / pixelRatio - 10, y, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            ctx.beginPath();
            ctx.arc((ctx.canvas.width / pixelRatio / 2) * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
            ctx.fill();
          }
        } else if (tool.type === 'verticalLine') {
          const d = data as VerticalLineData;
          const x = scaleX(d.index);
          ctx.beginPath();
          ctx.strokeStyle = d.line.color;
          ctx.lineWidth = d.line.width * pixelRatio;
          applyLineStyle(ctx, d.line.style);
          ctx.moveTo(x * pixelRatio, 0);
          ctx.lineTo(x * pixelRatio, ctx.canvas.height);
          ctx.stroke();
          ctx.setLineDash([]);

          if (d.text?.value) {
            drawText(ctx, d.text, x, 10, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            ctx.beginPath();
            ctx.arc(x * pixelRatio, (ctx.canvas.height / pixelRatio / 2) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
            ctx.fill();
          }
        } else if (tool.type === 'arrow') {
          const d = data as ArrowData;
          drawLine(ctx, scaleX(d.startIndex), scaleY(d.startPrice), scaleX(d.endIndex), scaleY(d.endPrice), { ...d.line, end: { left: LineEnd.Normal, right: LineEnd.Arrow } }, pixelRatio, false, false);
          if (d.text?.value) {
            const x1 = scaleX(d.startIndex);
            const y1 = scaleY(d.startPrice);
            const x2 = scaleX(d.endIndex);
            const y2 = scaleY(d.endPrice);
            drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'brush' || tool.type === 'highlighter') {
          const d = data as BrushData | HighlighterData;
          if (d.points.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = d.line.color;
            ctx.lineWidth = tool.type === 'highlighter' ? d.line.width * 2 * pixelRatio : d.line.width * pixelRatio;
            ctx.globalAlpha = tool.type === 'highlighter' ? 0.3 : 1;
            applyLineStyle(ctx, d.line.style);
            ctx.moveTo(scaleX(d.points[0].index) * pixelRatio, scaleY(d.points[0].price) * pixelRatio);
            d.points.forEach(p => ctx.lineTo(scaleX(p.index) * pixelRatio, scaleY(p.price) * pixelRatio));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            d.points.forEach(p => {
              ctx.beginPath();
              ctx.arc(scaleX(p.index) * pixelRatio, scaleY(p.price) * pixelRatio, 3 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'callout') {
          const d = data as CalloutData;
          drawLine(ctx, scaleX(d.index), scaleY(d.price), scaleX(d.targetIndex), scaleY(d.targetPrice), d.line, pixelRatio, false, false);
          drawText(ctx, d.text, scaleX(d.index), scaleY(d.price), 0, pixelRatio);
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.index, d.price], [d.targetIndex, d.targetPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'circle') {
          const d = data as CircleData;
          const cx = scaleX(d.centerIndex);
          const cy = scaleY(d.centerPrice);
          const rx = Math.abs(scaleX(d.radiusIndex) - cx);
          const ry = Math.abs(scaleY(d.radiusPrice) - cy);

          if (d.fill) {
            ctx.fillStyle = d.fill.color;
            ctx.globalAlpha = d.fill.opacity;
            ctx.beginPath();
            ctx.ellipse(cx * pixelRatio, cy * pixelRatio, rx * pixelRatio, ry * pixelRatio, 0, 0, 2 * Math.PI);
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.strokeStyle = d.line.color;
          ctx.lineWidth = d.line.width * pixelRatio;
          applyLineStyle(ctx, d.line.style);
          ctx.ellipse(cx * pixelRatio, cy * pixelRatio, rx * pixelRatio, ry * pixelRatio, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.setLineDash([]);

          if (d.text?.value) {
            drawText(ctx, d.text, cx, cy, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.centerIndex, d.centerPrice], [d.radiusIndex, d.radiusPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'extendedLine') {
          const d = data as ExtendedLineData;
          drawLine(ctx, scaleX(d.startIndex), scaleY(d.startPrice), scaleX(d.endIndex), scaleY(d.endPrice), d.line, pixelRatio, true, true);
          if (d.text?.value) {
            const x1 = scaleX(d.startIndex);
            const y1 = scaleY(d.startPrice);
            const x2 = scaleX(d.endIndex);
            const y2 = scaleY(d.endPrice);
            drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'parallelChannel') {
          const d = data as ParallelChannelData;
          const x1 = scaleX(d.line1StartIndex);
          const y1 = scaleY(d.line1StartPrice);
          const x2 = scaleX(d.line1EndIndex);
          const y2 = scaleY(d.line1EndPrice);
          const offsetY = scaleY(d.line2OffsetPrice) - scaleY(0);

          if (d.fill) {
            ctx.fillStyle = d.fill.color;
            ctx.globalAlpha = d.fill.opacity;
            ctx.beginPath();
            ctx.moveTo(x1 * pixelRatio, y1 * pixelRatio);
            ctx.lineTo(x2 * pixelRatio, y2 * pixelRatio);
            ctx.lineTo(x2 * pixelRatio, (y2 + offsetY) * pixelRatio);
            ctx.lineTo(x1 * pixelRatio, (y1 + offsetY) * pixelRatio);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          drawLine(ctx, x1, y1, x2, y2, d.line, pixelRatio, false, false);
          drawLine(ctx, x1, y1 + offsetY, x2, y2 + offsetY, d.line, pixelRatio, false, false);

          if (d.text?.value) {
            drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.line1StartIndex, d.line1StartPrice], [d.line1EndIndex, d.line1EndPrice], [d.line1StartIndex, d.line1StartPrice + d.line2OffsetPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'path') {
          const d = data as PathData;
          if (d.points.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = d.line.color;
            ctx.lineWidth = d.line.width * pixelRatio;
            applyLineStyle(ctx, d.line.style);
            ctx.moveTo(scaleX(d.points[0].index) * pixelRatio, scaleY(d.points[0].price) * pixelRatio);
            d.points.forEach(p => ctx.lineTo(scaleX(p.index) * pixelRatio, scaleY(p.price) * pixelRatio));
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (d.text?.value) {
            const midPoint = d.points[Math.floor(d.points.length / 2)];
            drawText(ctx, d.text, scaleX(midPoint.index), scaleY(midPoint.price), 0, pixelRatio);
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            d.points.forEach(p => {
              ctx.beginPath();
              ctx.arc(scaleX(p.index) * pixelRatio, scaleY(p.price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'priceRange') {
          const d = data as PriceRangeData;
          const x1 = scaleX(d.startIndex);
          const x2 = scaleX(d.endIndex);
          const y1 = scaleY(d.topPrice);
          const y2 = scaleY(d.bottomPrice);
          const left = Math.min(x1, x2);
          const width = Math.abs(x2 - x1);
          const top = Math.min(y1, y2);
          const height = Math.abs(y2 - y1);

          if (d.fill) {
            ctx.fillStyle = d.fill.color;
            ctx.globalAlpha = d.fill.opacity;
            ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.strokeStyle = d.line.color;
          ctx.lineWidth = d.line.width * pixelRatio;
          applyLineStyle(ctx, d.line.style);
          ctx.rect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
          ctx.stroke();
          ctx.setLineDash([]);

          if (d.text?.value) {
            drawText(ctx, d.text, left + width / 2, top + height / 2, 0, pixelRatio);
          }

          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].forEach(([x, y]) => {
              ctx.beginPath();
              ctx.arc(x * pixelRatio, y * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'ray') {
          const d = data as RayData;
          drawLine(ctx, scaleX(d.startIndex), scaleY(d.startPrice), scaleX(d.endIndex), scaleY(d.endPrice), d.line, pixelRatio, false, true);
          if (d.text?.value) {
            const x1 = scaleX(d.startIndex);
            const y1 = scaleY(d.startPrice);
            const x2 = scaleX(d.endIndex);
            const y2 = scaleY(d.endPrice);
            drawText(ctx, d.text, (x1 + x2) / 2, (y1 + y2) / 2, 0, pixelRatio);
          }
          if (d.selected) {
            ctx.fillStyle = d.line.color;
            [[d.startIndex, d.startPrice], [d.endIndex, d.endPrice]].forEach(([index, price]) => {
              ctx.beginPath();
              ctx.arc(scaleX(index) * pixelRatio, scaleY(price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        } else if (tool.type === 'text') {
          const d = data as TextData;
          drawText(ctx, d.text, scaleX(d.index), scaleY(d.price), 0, pixelRatio);
          if (d.selected) {
            ctx.fillStyle = d.text.font.color;
            ctx.beginPath();
            ctx.arc(scaleX(d.index) * pixelRatio, scaleY(d.price) * pixelRatio, 5 * pixelRatio, 0, 2 * Math.PI);
            ctx.fill();
          }
        }

        ctx.restore();
      });

      ctx.restore();
    },
    renderGPU: (pass: GPURenderPassEncoder) => {
      // WebGL rendering (optional, stubbed)
    },
    onEvent: (event: string, data: any) => {
      if (event === 'click' && 'x' in data && 'y' in data) {
        const index = Math.round(unscaleX(data.x));
        const price = unscaleY(data.y);
        console.log(`Drawing tool click at index ${index}, price ${price}`);
        // Handled by DrawingToolManager
      }
    },
  };
}
```