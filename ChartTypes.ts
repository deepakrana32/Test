import { Candle } from './Candle';

// Branded type for color to ensure valid hex or RGBA formats
type Color = string & { __brand: 'Color'; format?: 'hex' | 'rgba' };

/**
 * Options for price scale computation.
 * @interface
 */
export interface PriceScaleOptions {
  /** Canvas height in pixels */
  height: number;
  /** Margin as a fraction of price range */
  minRangeMargin: number;
  /** Pixels per tick for spacing */
  pixelRatio;
  /** Minimum number of ticks */
  minTicks: number;
  /** Maximum number of ticks */
  maxTicks: number;
  /** Custom label formatter for price ticks */
  formatLabel?: (value: number) => string;
  /** Pixel ratio for high-DPI displays */
  pixelRatio?: number;
}

/**
 * Result of price scale computation.
 * @interface
 */
export interface PriceScaleResult {
  /** Minimum price (with margin) */
  min: number;
  /** Maximum price (with margin) */
  max: number;
  /** Array of price axis ticks */
  ticks: PriceScaleTick[];
  /** Maps price to y-coordinate */
  scaleY: (price: number) => number;
  /** Maps y-coordinate to price */
  unscaleY: number;

/**
 * Price axis tick.
 * @interface
 */
export interface PriceScaleTick {
  /** Price value */
  value: number;
  /** Y-coordinate */
  y: number;
  /** Formatted label */
  label: string;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
}

/**
 * Options for time scale computation.
 * @interface
 */
export interface TimeScaleOptions {
  /** Canvas width in pixels */
  width: number;
  /** Base candle width in pixels */
  candleWidth: number;
  /** Minimum candle width */
  minCandleWidth: number;
  /** Maximum candle width in pixels */
  maxCandleWidth: number;
  /** Total number of candles */
  totalCandles: number;
  /** Custom time formatter for time labels */
  formatTimeLabel?: (time: number, index: number, total: number) => string;
  /** Pixel ratio for high-DPI displays */
  pixelRatio?: number;
}

/**
 * Result of time scale computation.
 * @interface
 */
export interface TimeScaleResult {
  /** First visible candle index */
  startIndex: number;
  /** Last visible candle index */
  endIndex: number;
  /** Scaled candle width */
  candleWidth: number;
  /** Maps index to x-coordinate */
  scaleX: (index: number) => number;
  /** Maps x-coordinate to index */
  unscaleX: (x: number) => number;
  /** Array of time axis ticks */
  ticks: TimeScaleTick[];
}

/**
 * Time axis tick.
 * @interface
 */
export interface TimeScaleTick {
  /** X-coordinate */
  x: number;
  /** Formatted label */
  label: string;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
}

/**
 * Line style options.
 * @enum
 */
export enum LineStyle {
  Solid = 0,
  Dashed = 1,
  Dotted = 2,
}

/**
 * Line end style options.
 * @enum
 */
export enum LineEnd {
  Normal = 0,
  Arrow = 1,
  Circle = 2,
}

/**
 * Horizontal alignment options.
 * @enum
 */
export enum BoxHorizontalAlignment {
  Left = 'left',
  Center = 'center',
  Right = 'right',
}

/**
 * Vertical alignment options.
 * @enum
 */
export enum BoxVerticalAlignment {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom',
}

/**
 * Text font styling options.
 * @interface
 */
export interface TextFontOptions {
  /** Font color (hex or RGBA) */
  color: Color;
  /** Font size in pixels */
  size: number;
  /** Bold font weight */
  bold: boolean;
  /** Italic font style */
  italic: boolean;
  /** Font family */
  family: string;
}

/**
 * Text box styling options.
 * @interface
 */
export interface TextBoxOptions {
  /** Alignment settings */
  alignment: {
    vertical: BoxVerticalAlignment;
    horizontal: BoxHorizontalAlignment;
  };
  /** Rotation angle in degrees */
  angle: number;
  /** Scale factor */
  scale: number;
  /** Padding in pixels */
  padding?: number;
  /** Background styling */
  background?: {
    color: Color;
  };
  /** Border styling */
  border?: {
    color: Color;
    width: number;
    radius: number;
  };
}

/**
 * Complete text styling options.
 * @interface
 */
export interface TextOptions {
  /** Text content */
  value: string;
  /** Font styling */
  font: TextFontOptions;
  /** Box styling */
  box: TextBoxOptions;
  /** Accessibility label */
  ariaLabel?: string;
}

/**
 * Line styling options.
 * @interface
 */
export interface LineOptions {
  /** Line color (hex or RGBA) */
  color: Color;
  /** Line width in pixels */
  width: number;
  /** Line style */
  style: LineStyle;
  /** Line end styles */
  end: {
    left: LineEnd;
    right: LineEnd;
  };
  /** Line extension settings */
  extend: {
    left: boolean;
    right: boolean;
  };
}

/**
 * Fill styling options.
 * @interface
 */
export interface FillOptions {
  /** Fill color (hex or RGBA) */
  color: Color;
  /** Fill opacity (0 to 1) */
  opacity: number;
}

/**
 * Point coordinate (index/price pair).
 * @interface
 */
export interface Point {
  /** Candle index */
  index: number;
  /** Price value */
  price: number;
}

/**
 * Base drawing tool data with common properties.
 * @interface
 */
interface BaseDrawingToolData {
  id: string;
  type: string;
  selected?: boolean;
  editing?: boolean;
  tooltip?: string;
  ariaLabel?: string;
}

/**
 * Trend line drawing tool data.
 * @interface
 */
export interface TrendLineData extends BaseDrawingToolData {
  type: 'trendline';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Rectangle drawing tool data.
 * @interface
 */
export interface RectangleData extends BaseDrawingToolData {
  type: 'rectangle';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  fill: FillOptions;
  text?: TextOptions;
}

/**
 * Fibonacci level definition.
 * @interface
 */
export interface FibonacciLevel {
  price: number;
  label: string;
  line: LineOptions;
}

/**
 * Fibonacci retracement drawing tool data.
 * @interface
 */
export interface FibonacciData extends BaseDrawingToolData {
  type: 'fibonacci';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  levels: FibonacciLevel[];
  text?: TextOptions;
}

/**
 * Horizontal line drawing tool data.
 * @interface
 */
export interface HorizontalLineData extends BaseDrawingToolData {
  type: 'horizontalLine';
  price: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Vertical line drawing tool data.
 * @interface
 */
export interface VerticalLineData extends BaseDrawingToolData {
  type: 'verticalLine';
  index: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Arrow drawing tool data.
 * @interface
 */
export interface ArrowData extends BaseDrawingToolData {
  type: 'arrow';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Freehand brush drawing tool data.
 * @interface
 */
export interface BrushData extends BaseDrawingToolData {
  type: 'brush';
  points: Point[];
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Callout/annotation drawing tool data.
 * @interface
 */
export interface CalloutData extends BaseDrawingToolData {
  type: 'callout';
  index: number;
  price: number;
  targetIndex: number;
  targetPrice: number;
  text: TextOptions;
  line: LineOptions;
}

/**
 * Circle drawing tool data.
 * @interface
 */
export interface CircleData extends BaseDrawingToolData {
  type: 'circle';
  centerIndex: number;
  centerPrice: number;
  radiusIndex: number;
  radiusPrice: number;
  line: LineOptions;
  fill: FillOptions;
  text?: TextOptions;
}

/**
 * Extended line drawing tool data.
 * @interface
 */
export interface ExtendedLineData extends BaseDrawingToolData {
  type: 'extendedLine';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Highlighter drawing tool data.
 * @interface
 */
export interface HighlighterData extends BaseDrawingToolData {
  type: 'highlighter';
  points: Point[];
  line: LineOptions;
  fill: FillOptions;
  text?: TextOptions;
}

/**
 * Parallel channel drawing tool data.
 * @interface
 */
export interface ParallelChannelData extends BaseDrawingToolData {
  type: 'parallelChannel';
  line1StartIndex: number;
  line1StartPrice: number;
  line1EndIndex: number;
  line1EndPrice: number;
  line2OffsetPrice: number;
  line: LineOptions;
  fill: FillOptions;
  text?: TextOptions;
}

/**
 * Path drawing tool data.
 * @interface
 */
export interface PathData extends BaseDrawingToolData {
  type: 'path';
  points: Point[];
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Price range drawing tool data.
 * @interface
 */
export interface PriceRangeData extends BaseDrawingToolData {
  type: 'priceRange';
  startIndex: number;
  endIndex: number;
  topPrice: number;
  bottomPrice: number;
  line: LineOptions;
  fill: FillOptions;
  text?: TextOptions;
}

/**
 * Ray drawing tool data.
 * @interface
 */
export interface RayData extends BaseDrawingToolData {
  type: 'ray';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  line: LineOptions;
  text?: TextOptions;
}

/**
 * Text annotation drawing tool data.
 * @interface
 */
export interface TextData extends BaseDrawingToolData {
  type: 'text';
  index: number;
  price: number;
  text: TextOptions;
}

/**
 * Union type of all drawing tool data types.
 * @type
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
 * Drawing tool definition with type and data.
 * @interface
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

/**
 * Default configuration for drawing tools.
 * @interface
 */
export interface DrawingToolConfig {
  line?: Partial<LineOptions>;
  fill?: Partial<FillOptions>;
  text?: Partial<TextOptions>;
}

/**
 * Validation schema for drawing tool data.
 * @interface
 */
export interface DrawingToolValidationSchema {
  type: DrawingTool['type'];
  required: (keyof DrawingToolData)[];
  optional?: (keyof DrawingToolData)[];
}

/**
 * State for undo/redo operations.
 * @interface
 */
export interface DrawingToolState {
  tools: DrawingTool[];
  timestamp: number;
}

/**
 * Tooltip configuration for drawing tools.
 * @interface
 */
export interface DrawingToolTooltip {
  content: string;
  position: {
    x: number;
    y: number;
  };
  style?: {
    backgroundColor?: Color;
    textColor?: Color;
    fontSize?: number;
  };
}

/**
 * Example usage:
 * ```typescript
 * const trendLine: DrawingTool = {
 *   type: 'trendline',
 *   id: 'uuid-123',
 *   data: {
 *     id: 'uuid-123',
 *     type: 'trendline',
 *     startIndex: 0,
 *     startPrice: 100,
 *     endIndex: 10,
 *     endPrice: 120,
 *     line: { color: '#FF0000', width: 2, style: LineStyle.Solid, end: { left: LineEnd.Normal, right: LineEnd.Normal }, extend: { left: false, right: false } },
 *     text: { value: 'Trend', font: { color: '#000000', size: 12, bold: false, italic: false, family: 'Arial' }, box: { alignment: { vertical: 'middle', horizontal: 'center' }, angle: 0, scale: 1 } },
 *     selected: false,
 *     tooltip: 'Trend Line',
 *     ariaLabel: 'Trend Line Tool'
 *   }
 * };
 * ```
 */
