// ChartRenderer.tsx
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ChartEngineCore } from './ChartEngineCore';
import { ChartPlugins, ChartPlugin } from './ChartPlugins';
import { detectCandlePatterns } from './patterns/candlePatterns';
import { PatternEngine } from './PatternEngine';
import { PatternEngineGPU } from './PatternEngineGPU';
import { computePatternEngineNextGen } from './PatternEngineNextGen';
import { useChartData } from '@/hooks/useChartData';
import { useMcGinleyDynamic } from '@/indicators/useMcGinleyDynamic';
import { usePatternWorker } from './usePatternWorker';
import { VWAPOverlay } from '@/indicators/VWAPOverlay';
import { HybridMAOverlay } from '@/indicators/HybridMAOverlay';
import { IchimokuCloud } from '@/indicators/IchimokuCloud';
import { ALMAOverlay } from '@/indicators/ALMAOverlay';
import { StochasticRSIOverlay } from '@/indicators/StochasticRSIOverlay';
import { BollingerBandRenderer } from '@/indicators/BollingerBandRenderer';
import { ATRHeatmapRenderer } from '@/indicators/ATRHeatmapRenderer';
import { ADRIndicator } from '@/indicators/ADRIndicator';
import { MACDIndicator } from '@/indicators/MACDIndicator';
import { SupertrendOverlay } from '@/indicators/SupertrendOverlay';
import { createPatternOverlayPlugin } from './PatternOverlayRenderer';
import { PATTERN_FLAG_MAP } from './PatternTypes';
import { computePriceScale } from './PriceScaleEngine';
import { TimeZoomController } from './TimeScaleEngine';
import { PriceScaleResult, TimeScaleResult } from '@/types/ChartTypes';
import { createDrawingToolsPlugin } from './DrawingToolsPlugin';
import { DrawingTool } from '@/types/ChartTypes';
import { DrawingToolManager } from './DrawingToolManager';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number; // Unix timestamp in milliseconds
}

interface ChartRendererProps {
  indicators?: {
    vwap?: boolean;
    hybridMA?: boolean;
    ichimoku?: boolean;
    alma?: boolean;
    stochasticRSI?: boolean;
    bollinger?: boolean;
    atrHeatmap?: boolean;
    adr?: boolean;
    macd?: boolean;
    mcginley?: boolean;
    supertrend?: boolean;
    candlePatterns?: boolean;
    patternEngine?: boolean;
    patternEngineGPU?: boolean;
    patternEngineNextGen?: boolean;
    patternWorker?: boolean;
    patternOverlay?: boolean;
  };
  width?: number;
  height?: number;
  canvasStyle?: React.CSSProperties;
  enableDrawingTools?: boolean;
}

interface ChartData {
  candles: Candle[];
  zoom: number;
  chartWidth: number;
  chartHeight: number;
  volatility: number[];
  device: GPUDevice | null;
  indicatorSettings: { atr?: number[] };
}

const toolButtons = [
  'trendline', 'rectangle', 'fibonacci', 'horizontalLine', 'verticalLine',
  'arrow', 'brush', 'callout', 'circle', 'extendedLine', 'highlighter',
  'parallelChannel', 'path', 'priceRange', 'ray', 'text'
] as const;

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  indicators = {
    vwap: true,
    hybridMA: true,
    ichimoku: true,
    alma: true,
    stochasticRSI: true,
    bollinger: true,
    atrHeatmap: true,
    adr: true,
    macd: true,
    mcginley: true,
    supertrend: true,
    candlePatterns: true,
    patternEngine: true,
    patternEngineGPU: true,
    patternEngineNextGen: true,
    patternWorker: true,
    patternOverlay: true,
  },
  width,
  height,
  canvasStyle = { position: 'absolute', zIndex: 1 },
  enableDrawingTools = true,
}) => {
  const { candles, zoom, chartWidth, chartHeight, volatility, device, indicatorSettings } = useChartData() as ChartData;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartEngineRef = useRef<ChartEngineCore | null>(null);
  const pluginsRef = useRef<ChartPlugins>(new ChartPlugins());
  const timeZoomControllerRef = useRef<TimeZoomController | null>(null);
  const [drawingTools, setDrawingTools] = useState<DrawingTool[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const toolManager = useRef<DrawingToolManager | null>(null);

  const prices = useMemo(() => candles.map(c => c.close), [candles]);
  const highs = useMemo(() => Float32Array.from(candles.map(c => c.high)), [candles]);
  const lows = useMemo(() => Float32Array.from(candles.map(c => c.low)), [candles]);
  const closes = useMemo(() => Float32Array.from(candles.map(c => c.close)), [candles]);
  const volumes = useMemo(() => Float32Array.from(candles.map(c => c.volume)), [candles]);
  const times = useMemo(() => candles.map(c => c.time), [candles]);
  const mcginleyResult = useMcGinleyDynamic(closes, Float32Array.from(volatility), canvasRef.current);

  const workerResults = usePatternWorker(candles, {
    enableCandlestick: indicators.patternWorker ?? true,
    enableStructure: indicators.patternWorker ?? true,
    maxPatternLookback: 100,
    batchSize: 1000,
  });

  // Compute scales
  const priceScale: PriceScaleResult = useMemo(() => {
    return computePriceScale(prices, { height: chartHeight });
  }, [prices, chartHeight]);

  const timeScale: TimeScaleResult = useMemo(() => {
    if (!timeZoomControllerRef.current) {
      timeZoomControllerRef.current = new TimeZoomController({
        width: chartWidth,
        candleWidth: 10,
        minCandleWidth: 2,
        maxCandleWidth: 40,
        totalCandles: candles.length,
      });
    }
    return timeZoomControllerRef.current.compute(times);
  }, [candles, chartWidth, times]);

  const scaleX = timeScale.scaleX;
  const scaleY = priceScale.scaleY;

  useEffect(() => {
    if (!canvasRef.current || !candles.length || chartWidth <= 0 || chartHeight <= 0) {
      console.warn('ChartRenderer: Invalid canvas or data, skipping initialization');
      return;
    }

    const finalWidth = width ?? chartWidth;
    const finalHeight = height ?? chartHeight;

    const chartEngine = new ChartEngineCore({
      canvas: canvasRef.current,
      useGPU: !!device,
      width: finalWidth,
      height: finalHeight,
      dpr: window.devicePixelRatio ?? 1,
    });
    chartEngineRef.current = chartEngine;

    if (enableDrawingTools) {
      toolManager.current = new DrawingToolManager(setDrawingTools);
      chartEngine.addPlugin(createDrawingToolsPlugin({
        tools: drawingTools,
        candles,
        scaleX,
        scaleY,
        unscaleX: timeScale.unscaleX,
        unscaleY: priceScale.unscaleY,
      }));
    }

    // Time axis plugin
    const timeAxisPlugin: ChartPlugin = {
      name: 'TimeAxis',
      priority: -2,
      render2D: (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        timeScale.ticks.forEach(tick => {
          ctx.fillText(tick.label, tick.x, finalHeight + 5);
        });
        ctx.restore();
      },
      renderGPU: () => {},
    };
    pluginsRef.current.register(timeAxisPlugin);

    // Price axis plugin
    const priceAxisPlugin: ChartPlugin = {
      name: 'PriceAxis',
      priority: -1,
      render2D: (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        priceScale.ticks.forEach(tick => {
          ctx.fillText(tick.label, finalWidth - 5, tick.y);
        });
        ctx.restore();
      },
      renderGPU: () => {},
    };
    pluginsRef.current.register(priceAxisPlugin);

    if (indicators.candlePatterns) {
      const candlePatternPlugin: ChartPlugin = {
        name: 'CandlePatterns',
        priority: 0,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          candles.forEach((_, i) => {
            const pattern = detectCandlePatterns(candles, i);
            if (pattern) {
              const x = scaleX(i);
              const y = scaleY(candles[i].close);
              const isBullish = pattern.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
              ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
              ctx.fillRect(x - 5, y - 5, 10, 10);
            }
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(timeScale.unscaleX(data.x));
            const pattern = detectCandlePatterns(candles, index);
            if (pattern) {
              console.log(`Clicked pattern at index ${index} (CandlePatterns): ${pattern.typeLabels.join(', ')}`);
            }
          }
        },
      };
      pluginsRef.current.register(candlePatternPlugin);
    }

    if (indicators.patternEngine) {
      const patternEngine = new PatternEngine(candles);
      const patternEnginePlugin: ChartPlugin = {
        name: 'PatternEngine',
        priority: 1,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          const results = patternEngine.run();
          results.forEach(result => {
            const x = scaleX(result.index);
            const y = scaleY(candles[result.index].close);
            const isBullish = result.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
            ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(timeScale.unscaleX(data.x));
            const result = patternEngine.getResults().find(r => r.index === index);
            if (result) {
              console.log(`Clicked pattern at index ${index} (PatternEngine): ${result.typeLabels.join(', ')}`);
            }
          }
        },
      };
      pluginsRef.current.register(patternEnginePlugin);
    }

    if (indicators.patternEngineGPU && device) {
      const patternEngineGPU = new PatternEngineGPU(device);
      patternEngineGPU.initialize(candles).then(() => {
        const gpuPatternPlugin: ChartPlugin = {
          name: 'PatternEngineGPU',
          priority: 2,
          render2D: async (ctx: CanvasRenderingContext2D) => {
            ctx.save();
            const matches = await patternEngineGPU.compute();
            matches.forEach(match => {
              const x = scaleX(match.index);
              const y = scaleY(candles[match.index].close);
              const isBullish = match.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
              ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.restore();
          },
          renderGPU: async () => {},
          onEvent: async (event: string, data: any) => {
            if (event === 'click' && 'x' in data) {
              const index = Math.floor(timeScale.unscaleX(data.x));
              const matches = await patternEngineGPU.compute();
              const match = matches.find(m => m.index === index);
              if (match) {
                console.log(`Clicked pattern at index ${index} (PatternEngineGPU): ${match.typeLabels.join(', ')}`);
              }
            }
          },
          destroy: () => {
            patternEngineGPU.dispose();
          },
        };
        pluginsRef.current.register(gpuPatternPlugin);
      }).catch(error => {
        console.error(`PatternEngineGPU initialization failed: ${error.message}`);
      });
    }

    if (indicators.patternEngineNextGen) {
      const patternEngineNextGenPlugin: ChartPlugin = {
        name: 'PatternEngineNextGen',
        priority: 3,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          const result = computePatternEngineNextGen(candles);
          result.clusters.forEach(cluster => {
            const x = scaleX(cluster.index);
            const y = scaleY(candles[cluster.index].close);
            ctx.fillStyle = cluster.clusterType === 'Bullish Momentum Cluster' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 5 * cluster.confidenceScore, 0, Math.PI * 2);
            ctx.fill();
          });
          result.structures.forEach(structure => {
            const x = scaleX(structure.index);
            const y = scaleY(structure.type === 'Swing High' ? candles[structure.index].high : candles[structure.index].low);
            ctx.fillStyle = structure.strength === 'Major' ? 'rgba(255, 165, 0, 0.8)' : 'rgba(255, 165, 0, 0.4)';
            ctx.fillRect(x - 3, y - 3, 6, 6);
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const result = computePatternEngineNextGen(candles);
            const index = Math.floor(timeScale.unscaleX(data.x));
            const cluster = result.clusters.find(c => c.index === index);
            const structure = result.structures.find(s => s.index === index);
            const embedding = result.embeddings.find(e => e.index === index);
            if (cluster || structure || embedding) {
              console.log(`Clicked pattern at index ${index} (PatternEngineNextGen):`, {
                cluster: cluster ? `${cluster.clusterType} (Confidence: ${cluster.confidenceScore})` : null,
                structure: structure ? `${structure.type} (${structure.strength})` : null,
                embedding: embedding ? `Similar to ${embedding.similarTo}` : null,
              });
            }
          }
        },
      };
      pluginsRef.current.register(patternEngineNextGenPlugin);
    }

    if (indicators.patternWorker) {
      const patternWorkerPlugin: ChartPlugin = {
        name: 'PatternWorker',
        priority: 4,
        render2D: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          workerResults.forEach(result => {
            const x = scaleX(result.index);
            const y = scaleY(candles[result.index].close);
            const isBullish = result.typeLabels.some(label => PATTERN_FLAG_MAP[label]?.isBullish);
            ctx.fillStyle = isBullish ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        },
        renderGPU: () => {},
        onEvent: (event: string, data: any) => {
          if (event === 'click' && 'x' in data) {
            const index = Math.floor(timeScale.unscaleX(data.x));
            const result = workerResults.find(r => r.index === index);
            if (result) {
              console.log(`Clicked pattern at index ${index} (PatternWorker): ${result.typeLabels.join(', ')}`);
            }
          }
        },
      };
      pluginsRef.current.register(patternWorkerPlugin);
    }

    if (indicators.patternOverlay) {
      const overlayPlugin = createPatternOverlayPlugin({
        patterns: workerResults,
        scaleX,
        scaleY,
        candles,
        lodLevel: Math.floor(1 / zoom),
      });
      pluginsRef.current.register(overlayPlugin);
    }

    chartEngine.initialize().catch(error => {
      console.error(`ChartEngine initialization failed: ${error.message}`);
    });

    return () => {
      chartEngine.destroy();
      chartEngineRef.current = null;
      pluginsRef.current.destroy();
    };
  }, [candles, width, height, chartWidth, chartHeight, device, indicators, workerResults, zoom, priceScale, timeScale, enableDrawingTools, drawingTools]);

  useEffect(() => {
    if (!chartEngineRef.current || !timeZoomControllerRef.current) return;

    const handleZoom = (data: { delta: number; x: number }) => {
      if (data.delta > 0) {
        timeZoomControllerRef.current?.zoomIn(data.x);
      } else {
        timeZoomControllerRef.current?.zoomOut(data.x);
      }
      pluginsRef.current.dispatchEvent('zoom', data);
    };
    const handlePan = (data: { dx: number }) => {
      timeZoomControllerRef.current?.scroll(data.dx / timeScale.candleWidth);
      pluginsRef.current.dispatchEvent('pan', data);
    };
    const handleClick = (data: { x: number; y: number }) => {
      pluginsRef.current.dispatchEvent('click', data);
    };

    const eventPlugin: ChartPlugin = {
      name: 'EventHandler',
      priority: -3,
      render2D: () => {},
      renderGPU: () => {},
      onEvent: (event: string, data: any) => {
        if (event === 'zoom') handleZoom(data);
        if (event === 'pan') handlePan(data);
        if (event === 'click') handleClick(data);
      },
    };
    pluginsRef.current.register(eventPlugin);

    return () => {
      pluginsRef.current.unregister('EventHandler');
    };
  }, [timeScale.candleWidth]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!chartEngineRef.current || !toolManager.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index = Math.round(timeScale.unscaleX(x));
    const price = priceScale.unscaleY(y);

    if (activeTool) {
      toolManager.current.handleMouseDown(activeTool, { x, y, index, price });
    } else {
      toolManager.current.handleMouseDown('select', { x, y, index, price });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!chartEngineRef.current || !toolManager.current || !activeTool) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index = Math.round(timeScale.unscaleX(x));
    const price = priceScale.unscaleY(y);

    toolManager.current.handleMouseMove(activeTool, { x, y, index, price });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!chartEngineRef.current || !toolManager.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const index = Math.round(timeScale.unscaleX(x));
    const price = priceScale.unscaleY(y);

    if (activeTool) {
      toolManager.current.handleMouseDown(activeTool, { x, y, index, price });
    } else {
      toolManager.current.handleMouseDown('select', { x, y, index, price });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!chartEngineRef.current || !toolManager.current || !activeTool) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const index = Math.round(timeScale.unscaleX(x));
    const price = priceScale.unscaleY(y);

    toolManager.current.handleMouseMove(activeTool, { x, y, index, price });
  };

  const handleToolToggle = (tool: string | null) => {
    setActiveTool(tool);
    if (toolManager.current) {
      toolManager.current.setActiveTool(tool);
    }
  };

  const renderIndicators = () => (
    <>
      {indicators.vwap && (
        <VWAPOverlay prices={candles} device={device} width={chartWidth} height={chartHeight} />
      )}
      {indicators.hybridMA && (
        <HybridMAOverlay prices={prices} device={device} width={chartWidth} height={chartHeight} />
      )}
      {indicators.ichimoku && (
        <IchimokuCloud
          highs={highs}
          lows={lows}
          length={candles.length}
          device={device}
          canvasWidth={chartWidth}
          canvasHeight={chartHeight}
        />
      )}
      {indicators.alma && (
        <ALMAOverlay candles={candles} width={chartWidth} height={chartHeight} device={device} />
      )}
      {indicators.stochasticRSI && (
        <StochasticRSIOverlay prices={prices} width={chartWidth} height={chartHeight} zoom={zoom} />
      )}
      {indicators.bollinger && <BollingerBandRenderer />}
      {indicators.atrHeatmap && (
        <ATRHeatmapRenderer
          atrValues={Float32Array.from(indicatorSettings.atr || [])}
          lowThreshold={0.6}
          highThreshold={1.5}
          device={device}
        />
      )}
      {indicators.adr && <ADRIndicator data={candles} />}
      {indicators.macd && (
        <MACDIndicator priceData={prices} width={chartWidth} height={100} zoom={zoom} />
      )}
      {indicators.mcginley && mcginleyResult && (
        <svg
          width={chartWidth}
          height={chartHeight}
          style={{ position: 'absolute', zIndex: 2, pointerEvents: 'none' }}
        >
          <polyline
            points={mcginleyResult.md
              .map((v, i) => `${scaleX(i)},${scaleY(v)}`)
              .join(' ')}
            fill="none"
            stroke="#ff5722"
            strokeWidth={1.5}
            opacity={0.8}
          />
        </svg>
      )}
      {indicators.supertrend && (
        <SupertrendOverlay candles={candles} device={device} width={chartWidth} height={chartHeight} />
      )}
    </>
  );

  return (
    <div style={{ position: 'relative', width: width || chartWidth, height: height || chartHeight }}>
      {enableDrawingTools && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {toolButtons.map(tool => (
            <button
              key={tool}
              onClick={() => handleToolToggle(activeTool === tool ? null : tool)}
              style={{ background: activeTool === tool ? '#007bff' : '#fff', color: activeTool === tool ? '#fff' : '#000', padding: '5px 10px' }}
            >
              {tool.charAt(0).toUpperCase() + tool.slice(1).replace(/([A-Z])/g, ' $1')}
            </button>
          ))}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={chartWidth * (window.devicePixelRatio || 1)}
        height={chartHeight * (window.devicePixelRatio || 1)}
        style={{ ...canvasStyle, width: `${width || chartWidth}px`, height: `${height || chartHeight}px` }}
        onMouseDown={enableDrawingTools ? handleMouseDown : undefined}
        onMouseMove={enableDrawingTools ? handleMouseMove : undefined}
        onTouchStart={enableDrawingTools ? handleTouchStart : undefined}
        onTouchMove={enableDrawingTools ? handleTouchMove : undefined}
      />
      {renderIndicators()}
    </div>
  );
};