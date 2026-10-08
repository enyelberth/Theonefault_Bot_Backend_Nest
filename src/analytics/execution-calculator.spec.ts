import { calculateExecutionMetrics } from './execution-calculator';
import type { ExecutionSample } from './analytics.types';

const sample = (
  id: number,
  status: string,
  values: Partial<ExecutionSample> = {},
): ExecutionSample => ({
  id,
  runId: 'run-1',
  strategyId: 'grid-v2',
  mode: 'paper',
  symbol: 'XRPUSDT',
  status,
  notional: null,
  fee: 0,
  spreadBps: null,
  slippageBps: null,
  slippageQuote: null,
  latencyMs: null,
  ...values,
});

describe('calculateExecutionMetrics', () => {
  it('aggregates fees, adverse slippage, spread, latency and rejection rate', () => {
    const metrics = calculateExecutionMetrics([
      sample(1, 'FILLED', {
        notional: 1000,
        fee: 1,
        spreadBps: 2,
        slippageBps: 5,
        slippageQuote: 0.5,
        latencyMs: 100,
      }),
      sample(2, 'FILLED', {
        notional: 2000,
        fee: 2,
        spreadBps: 4,
        slippageBps: -1,
        slippageQuote: -0.2,
        latencyMs: 200,
      }),
      sample(3, 'REJECTED', {
        spreadBps: 3,
        latencyMs: 500,
      }),
    ]);

    expect(metrics).toEqual({
      attempts: 3,
      filled: 2,
      rejected: 1,
      acceptedNotFilled: 0,
      fillRatePct: 66.66666667,
      rejectionRatePct: 33.33333333,
      totalNotional: 3000,
      totalFees: 3,
      feeBps: 10,
      totalSlippageQuote: 0.3,
      averageSlippageBps: 2,
      medianSlippageBps: -1,
      p95SlippageBps: 5,
      worstSlippageBps: 5,
      averageSpreadBps: 3,
      averageLatencyMs: 266.66666667,
      p95LatencyMs: 500,
    });
  });

  it('returns null distribution metrics without observations', () => {
    const metrics = calculateExecutionMetrics([]);

    expect(metrics.attempts).toBe(0);
    expect(metrics.feeBps).toBeNull();
    expect(metrics.averageSlippageBps).toBeNull();
    expect(metrics.averageLatencyMs).toBeNull();
  });
});
