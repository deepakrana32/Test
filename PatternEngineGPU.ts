```typescript
// PatternEngineGPU.ts
// GPU-accelerated candlestick pattern detection using WebGPU

import { Candle } from "@/types/Candle";
import { PatternFlags, PatternResult, PatternType, PatternCategory, CandlestickPatternFlags, PATTERN_FLAG_MAP } from "@/types/PatternTypes";

// Interface for pattern definitions
interface PatternDefinition {
  type: PatternFlags;
  name: PatternType;
  category: PatternCategory;
  shaderCondition: string;
}

// Interface for configuration
interface PatternEngineGPUConfig {
  workgroupSize?: number;
  patterns?: PatternDefinition[];
}

/**
 * GPU-accelerated engine for detecting candlestick patterns using WebGPU.
 */
export class PatternEngineGPU {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private inputBuffer: GPUBuffer | null = null;
  private outputBuffer: GPUBuffer | null = null;
  private readBuffer: GPUBuffer | null = null;
  private resultArray: Uint32Array | null = null;
  private candleCount: number = 0;
  private isInitialized: boolean = false;
  private readonly config: PatternEngineGPUConfig;

  private static readonly defaultPatterns: PatternDefinition[] = [
    {
      type: CandlestickPatternFlags.BullishEngulfing,
      name: 'BullishEngulfing',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (prev.close < prev.open && curr.close > curr.open && curr.open < prev.close && curr.close > prev.open) {
          mask |= (1u << ${CandlestickPatternFlags.BullishEngulfing}u);
        }
      `,
    },
    {
      type: CandlestickPatternFlags.BearishEngulfing,
      name: 'BearishEngulfing',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (prev.close > prev.open && curr.close < curr.open && curr.open > prev.close && curr.close < prev.open) {
          mask |= (1u << ${CandlestickPatternFlags.BearishEngulfing}u);
        }
      `,
    },
    {
      type: CandlestickPatternFlags.Hammer,
      name: 'Hammer',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (currBody > 0.25 * currRange && curr.low < min(curr.open, curr.close) - 0.4 * currRange && curr.high - max(curr.open, curr.close) < 0.1 * currRange) {
          mask |= (1u << ${CandlestickPatternFlags.Hammer}u);
        }
      `,
    },
    {
      type: CandlestickPatternFlags.InvertedHammer,
      name: 'InvertedHammer',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (currBody > 0.25 * currRange && curr.high > max(curr.open, curr.close) + 0.4 * currRange && min(curr.open, curr.close) - curr.low < 0.1 * currRange) {
          mask |= (1u << ${CandlestickPatternFlags.InvertedHammer}u);
        }
      `,
    },
    {
      type: CandlestickPatternFlags.MorningStar,
      name: 'MorningStar',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (prev.close < prev.open && curr.close > curr.open && currBody > 0.5 * currRange) {
          mask |= (1u << ${CandlestickPatternFlags.MorningStar}u);
        }
      `,
    },
    {
      type: CandlestickPatternFlags.EveningStar,
      name: 'EveningStar',
      category: PatternCategory.Candlestick,
      shaderCondition: `
        if (prev.close > prev.open && curr.close < curr.open && currBody > 0.5 * currRange) {
          mask |= (1u << ${CandlestickPatternFlags.EveningStar}u);
        }
      `,
    },
  ];

  constructor(device: GPUDevice, config: PatternEngineGPUConfig = {}) {
    if (!(device instanceof GPUDevice)) {
      throw new Error('Invalid device: must be a GPUDevice');
    }
    this.device = device;
    this.config = {
      workgroupSize: config.workgroupSize ?? 64,
      patterns: config.patterns ?? PatternEngineGPU.defaultPatterns,
    };
  }

  async initialize(candles: Candle[]): Promise<void> {
    if (this.isInitialized) {
      console.warn('PatternEngineGPU already initialized');
      return;
    }

    if (!Array.isArray(candles) || candles.length < 2) {
      throw new Error('Invalid candles: must be an array with at least 2 candles');
    }
    if (!candles.every(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))) {
      throw new Error('Invalid candles: all candles must have finite open, high, low, and close');
    }

    this.candleCount = candles.length;

    const inputData = new Float32Array(candles.length * 4);
    for (let i = 0; i < candles.length; i++) {
      inputData[i * 4 + 0] = candles[i].open;
      inputData[i * 4 + 1] = candles[i].high;
      inputData[i * 4 + 2] = candles[i].low;
      inputData[i * 4 + 3] = candles[i].close;
    }

    try {
      this.inputBuffer = this.device.createBuffer({
        size: Math.max(16, inputData.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(this.inputBuffer.getMappedRange()).set(inputData);
      this.inputBuffer.unmap();

      this.outputBuffer = this.device.createBuffer({
        size: Math.max(16, candles.length * 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      this.readBuffer = this.device.createBuffer({
        size: Math.max(16, candles.length * 4),
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const shaderCode = this.generateWGSL();
      const shaderModule = this.device.createShaderModule({ code: shaderCode });

      this.pipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
              { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
          })],
        }),
        compute: {
          module: shaderModule,
          entryPoint: "main",
        },
      });

      this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
      this.bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.inputBuffer } },
          { binding: 1, resource: { buffer: this.outputBuffer } },
        ],
      });

      this.isInitialized = true;
    } catch (error) {
      this.dispose();
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async compute(): Promise<PatternResult[]> {
    if (!this.isInitialized || !this.pipeline || !this.bindGroup || !this.outputBuffer || !this.readBuffer) {
      throw new Error('PatternEngineGPU not initialized');
    }

    try {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(Math.ceil(this.candleCount / this.config.workgroupSize));
      pass.end();
      this.device.queue.submit([encoder.finish()]);

      const copyEncoder = this.device.createCommandEncoder();
      copyEncoder.copyBufferToBuffer(this.outputBuffer, 0, this.readBuffer, 0, this.candleCount * 4);
      this.device.queue.submit([copyEncoder.finish()]);

      await this.readBuffer.mapAsync(GPUMapMode.READ);
      const result = new Uint32Array(this.readBuffer.getMappedRange().slice(0));
      this.resultArray = result;
      this.readBuffer.unmap();

      const matches: PatternResult[] = [];
      for (let i = 1; i < this.candleCount; i++) {
        const mask = result[i];
        if (mask > 0) {
          const labels = this.config.patterns
            .filter(p => (mask & (1 << p.type)) !== 0)
            .map(p => p.name);
          if (labels.length > 0) {
            const patternResult: PatternResult = {
              index: i,
              flags: mask,
              typeLabels: labels,
              category: PatternCategory.Candlestick,
            };
            if (validatePatternResult(patternResult)) {
              matches.push(patternResult);
            } else {
              console.warn(`Invalid PatternResult at index ${i}`);
            }
          }
        }
      }

      return matches;
    } catch (error) {
      throw new Error(`Compute failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateWGSL(): string {
    const patternConditions = this.config.patterns.map(p => p.shaderCondition).join('\n');

    return `
struct Candle {
  open: f32,
  high: f32,
  low: f32,
  close: f32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;

@compute @workgroup_size(${this.config.workgroupSize})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i < 1u || i >= arrayLength(&output)) {
    return;
  }

  let i4 = i * 4u;
  let prev4 = (i - 1u) * 4u;

  let prev = Candle(
    input[prev4 + 0],
    input[prev4 + 1],
    input[prev4 + 2],
    input[prev4 + 3]
  );

  let curr = Candle(
    input[i4 + 0],
    input[i4 + 1],
    input[i4 + 2],
    input[i4 + 3]
  );

  var mask: u32 = 0u;

  let currBody = abs(curr.close - curr.open);
  let prevBody = abs(prev.close - prev.open);
  let currRange = curr.high - curr.low;

  ${patternConditions}

  output[i] = mask;
}
    `;
  }

  dispose(): void {
    if (this.inputBuffer) {
      this.inputBuffer.destroy();
      this.inputBuffer = null;
    }
    if (this.outputBuffer) {
      this.outputBuffer.destroy();
      this.outputBuffer = null;
    }
    if (this.readBuffer) {
      this.readBuffer.destroy();
      this.readBuffer = null;
    }
    this.pipeline = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    this.resultArray = null;
    this.candleCount = 0;
    this.isInitialized = false;
  }
}
```