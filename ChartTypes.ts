export type Color = string; // Hex color, e.g., '#FF0000'

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
  volume?: number;
}

export interface Tick {
  price: number;
  time: number;
  volume: number;
}

export interface Series {
  type: 'candle' | 'bar' | 'area' | 'line' | 'histogram';
  data: (Candle | Tick)[];
  options: {
    color?: Color;
    lineWidth?: number;
    fillColor?: Color;
    fillOpacity?: number;
  };
}

export interface LineOptions {
  color: Color;
  width: number;
  style: LineStyle;
  end: { left: LineEnd; right: LineEnd };
  extend: { left: boolean; right: boolean };
}

export interface TextOptions {
  value: string;
  font: {
    color: Color;
    size: number;
    bold: boolean;
    italic: boolean;
    family: string;
  };
  box: {
    alignment: {
      vertical: BoxVerticalAlignment;
      horizontal: BoxHorizontalAlignment;
    };
    angle: number;
    scale: number;
    padding: number;
  };
}

export interface FillOptions {
  color: Color;
  opacity: number;
}

export interface Point {
  index: number;
  price: number;
}

export enum LineStyle {
  Solid = 'solid',
  Dashed = 'dashed',
  Dotted = 'dotted',
}

export enum LineEnd {
  Normal = 'normal',
  Arrow = 'arrow',
  Circle = 'circle',
}

export enum BoxHorizontalAlignment {
  Left = 'left',
  Center = 'center',
  Right = 'right',
}

export enum BoxVerticalAlignment {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom',
}

export interface FibonacciLevel {
  label: string;
  price: number;
  line: LineOptions;
}

export interface DrawingTool {
  type: string;
  id: string;
  data: DrawingToolData;
}

export interface DrawingToolData {
  type: string;
  id: string;
  selected?: boolean;
  zIndex?: number;
  locked?: boolean;
  line?: LineOptions;
  text?: TextOptions;
  fill?: FillOptions;
}

export interface TrendLineData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface RectangleData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface FibonacciData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  levels: FibonacciLevel[];
}

export interface HorizontalLineData extends DrawingToolData {
  price: number;
}

export interface VerticalLineData extends DrawingToolData {
  index: number;
}

export interface ArrowData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface BrushData extends DrawingToolData {
  points: Point[];
}

export interface HighlighterData extends DrawingToolData {
  points: Point[];
}

export interface CalloutData extends DrawingToolData {
  index: number;
  price: number;
  targetIndex: number;
  targetPrice: number;
}

export interface CircleData extends DrawingToolData {
  centerIndex: number;
  centerPrice: number;
  radiusIndex: number;
  radiusPrice: number;
}

export interface ExtendedLineData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface ParallelChannelData extends DrawingToolData {
  line1StartIndex: number;
  line1StartPrice: number;
  line1EndIndex: number;
  line1EndPrice: number;
  line2OffsetPrice: number;
}

export interface PathData extends DrawingToolData {
  points: Point[];
}

export interface PriceRangeData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface RayData extends DrawingToolData {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
}

export interface TextData extends DrawingToolData {
  index: number;
  price: number;
}

export interface ToolGroup {
  id: string;
  tools: DrawingTool[];
  visible: boolean;
}

export interface CrosshairParams {
  enabled: boolean;
  magnet: boolean;
  lineColor: Color;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed';
  labelBackgroundColor: Color;
  labelTextColor: Color;
  labelFontSize: number;
}

export interface CrosshairEvent {
  x: number;
  y: number;
  price: number;
  time: number;
  index: number;
}

export interface AnimationState {
  timestamp: number;
  deltaTime: number;
  progress: number;
}

export interface PriceScaleOptions {
  height: number;
  minRangeMargin: number;
  pixelPerTick: number;
  minTicks: number;
  maxTicks: number;
  inverted?: boolean;
  logarithmic?: boolean;
  locale?: string;
  optimalWidth?: number;
}

export interface TimeScaleOptions {
  minCandleWidth: number;
  maxCandleWidth: number;
  timezone?: string;
  locale?: string;
  optimalHeight?: number;
}

export interface ChartOptions {
  width: number;
  height: number;
  locale: string;
  timezone: string;
  priceScale?: Partial<PriceScaleOptions>;
  timeScale?: Partial<TimeScaleOptions>;
  crosshair?: Partial<CrosshairParams>;
}

export interface PriceScaleTick {
  price: number;
  y: number;
  label: string;
}

export interface TimeScaleTick {
  time: number;
  x: number;
  label: string;
}

export interface PriceScaleResult {
  minPrice: number;
  maxPrice: number;
  ticks: PriceScaleTick[];
  scaleY: (price: number) => number;
  unscaleY: (y: number) => number;
}

export interface TimeScaleResult {
  visibleStart: number;
  visibleEnd: number;
  candleWidth: number;
  ticks: TimeScaleTick[];
  scaleX: (index: number) => number;
  unscaleX: (x: number) => number;
}

export function validateColor(color: Color): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}

export function validateAriaLabel(label: string): boolean {
  return typeof label === 'string' && label.length > 0;
}
