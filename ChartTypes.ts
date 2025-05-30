// ChartTypes.ts
import { Candle } from './Candle';

/**
 * Options for price scale computation.
 */
export interface PriceScaleOptions {
  height: number; // Canvas height in pixels
  minRangeMargin: number; // Margin as a fraction of price range
  pixelPerTick: number; // Pixels per tick for spacing
  minTicks: number; // Minimum number of ticks
  maxTicks: number; // Maximum number of ticks
  formatLabel?: (value: number) => string; // Custom label formatter
}

/**
 * Result of price scale computation.
 */
export interface PriceScaleResult {
  min: number; // Minimum price (with margin)
  max: number; // Maximum price (with margin)
  ticks: PriceScaleTick[]; // Price axis ticks
  scaleY: (price: number) => number; // Maps price to y-coordinate
  unscaleY: (y: number) => number; // Maps y-coordinate to price
}

/**
 * Price axis tick.
 */
export interface PriceScaleTick {
  value: number; // Price value
  y: number; // Y-coordinate
  label: string; // Formatted label
}

/**
 * Options for time scale computation.
 */
export interface TimeScaleOptions {
  width: number; // Canvas width in pixels
  candleWidth: number; // Base candle width in pixels
  minCandleWidth: number; // Minimum candle width
  maxCandleWidth: number; // Maximum candle width
  totalCandles: number; // Total number of candles
  formatTimeLabel?: (time: number, index: number, total: number) => string; // Custom time formatter
}

/**
 * Result of time scale computation.
 */
export interface TimeScaleResult {
  startIndex: number; // First visible candle index
  endIndex: number; // Last visible candle index
  candleWidth: number; // Scaled candle width
  scaleX: (index: number) => number; // Maps index to x-coordinate
  unscaleX: (x: number) => number; // Maps x-coordinate to index
  ticks: TimeScaleTick[]; // Time axis ticks
}

/**
 * Time axis tick.
 */
export interface TimeScaleTick {
  x: number; // X-coordinate
  label: string; // Formatted label
}

/**
 * Line style options
 */
export enum LineStyle {
  Solid = 0,
  Dashed = 1,
  Dotted = 2,
}

/**
 * Line end style options
 */
export enum LineEnd {
  Normal = 0,
  Arrow = 1,
  Circle = 2,
}

/**
 * Horizontal alignment options
 */
export enum BoxHorizontalAlignment {
  Left = 'left',
  Center = 'center',
  Right = 'right',
}

/**
 * Vertical alignment options
 */
export enum BoxVerticalAlignment {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom',
}

/**
 * Text font styling options
 */
export interface TextFontOptions {
  color: string;
  size: number;
  bold: boolean;
  italic: boolean;
  family: string;
}

/**
 * Text box styling options
 */
export interface TextBoxOptions {
  alignment: {
    vertical: BoxVerticalAlignment;
    horizontal: BoxHorizontalAlignment;
  };
  angle: number;
  scale: number;
  padding?: number;
  background?: {
    color: string;
  };
  border?: {
    color: string;
    width: number;
    radius: number;
  };
}

/**
 * Complete text styling options
 */
export interface TextOptions {
  value: string;
  font: TextFontOptions;
  box: TextBoxOptions;
}

/**
 * Line styling options
 */
export interface LineOptions {
  color: string;
  width: number;
  style: LineStyle;
  end: {
    left: LineEnd;
    right: LineEnd;
  };
  extend: {
    left: boolean;
    right: boolean;
  };
}

/**
 * Fill styling options
 */
export interface FillOptions {
  color: string;
  opacity: number;
}

/**
 * Point coordinate (index/price pair)
 */
export interface Point {
  index: number;
  price: number;
}

/**
 * Trend line drawing tool data
 */
export interface TrendLineData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Rectangle drawing tool data
 */
export interface RectangleData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  fill?: FillOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Fibonacci level definition
 */
export interface FibonacciLevel {
  price: number;
  label: string;
  line: LineOptions;
}

/**
 * Fibonacci retracement drawing tool data
 */
export interface FibonacciData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  levels: FibonacciLevel[];
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Horizontal line drawing tool data
 */
export interface HorizontalLineData {
  id: string;
  price: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Vertical line drawing tool data
 */
export interface VerticalLineData {
  id: string;
  index: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Arrow drawing tool data
 */
export interface ArrowData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Freehand brush drawing tool data
 */
export interface BrushData {
  id: string;
  points: Point[];
  line: LineOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Callout/annotation drawing tool data
 */
export interface CalloutData {
  id: string;
  index: number;
  price: number;
  targetIndex: number;
  targetPrice: number;
  text: TextOptions;
  line: LineOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Circle drawing tool data
 */
export interface CircleData {
  id: string;
  centerIndex: number;
  centerPrice: number;
  radiusIndex: number;
  radiusPrice: number;
  line: LineOptions;
  fill?: FillOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Extended line drawing tool data
 */
export interface ExtendedLineData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Highlighter drawing tool data
 */
export interface HighlighterData {
  id: string;
  points: Point[];
  line: LineOptions;
  fill?: FillOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Parallel channel drawing tool data
 */
export interface ParallelChannelData {
  id: string;
  line1StartIndex: number;
  line1StartPrice: number;
  line1EndIndex: number;
  line1EndPrice: number;
  line2OffsetPrice: number;
  line: LineOptions;
  fill?: FillOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Path drawing tool data
 */
export interface PathData {
  id: string;
  points: Point[];
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Price range drawing tool data
 */
export interface PriceRangeData {
  id: string;
  startIndex: number;
  endIndex: number;
  topPrice: number;
  bottomPrice: number;
  line: LineOptions;
  fill?: FillOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Ray drawing tool data
 */
export interface RayData {
  id: string;
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Text annotation drawing tool data
 */
export interface TextData {
  id: string;
  index: number;
  price: number;
  text: TextOptions;
  selected?: boolean;
  editing?: boolean;
}

/**
 * Union type of all drawing tool data types
 */
export type DrawingToolData =
  | TrendLineData
  | RectangleData
  | FibonacciData
  | HorizontalLineData
  | VerticalLineData
  | ArrowData
  | BrushData
  | CalloutData
  | CircleData
  | ExtendedLineData
  | HighlighterData
  | ParallelChannelData
  | PathData
  | PriceRangeData
  | RayData
  | TextData;

/**
 * Drawing tool definition with type and data
 */
export interface DrawingTool {
  type:
    | 'trendline'
    | 'rectangle'
    | 'fibonacci'
    | 'horizontalLine'
    | 'verticalLine'
    | 'arrow'
    | 'brush'
    | 'callout'
    | 'circle'
    | 'extendedLine'
    | 'highlighter'
    | 'parallelChannel'
    | 'path'
    | 'priceRange'
    | 'ray'
    | 'text';
  id: string;
  data: DrawingToolData;
}