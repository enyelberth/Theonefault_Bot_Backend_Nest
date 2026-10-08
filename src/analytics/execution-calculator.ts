import type { ExecutionMetrics, ExecutionSample } from './analytics.types';

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;

const average = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (
  values: number[],
  percentileValue: number,
): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
};

const roundedNullable = (value: number | null): number | null =>
  value === null ? null : round(value);

export function calculateExecutionMetrics(
  samples: ExecutionSample[],
): ExecutionMetrics {
  const filled = samples.filter((sample) => sample.status === 'FILLED');
  const rejected = samples.filter(
    (sample) => sample.status === 'REJECTED' || sample.status === 'EXPIRED',
  );
  const notional = filled.flatMap((sample) =>
    sample.notional === null ? [] : [sample.notional],
  );
  const slippageBps = filled.flatMap((sample) =>
    sample.slippageBps === null ? [] : [sample.slippageBps],
  );
  const slippageQuote = filled.flatMap((sample) =>
    sample.slippageQuote === null ? [] : [sample.slippageQuote],
  );
  const spreads = samples.flatMap((sample) =>
    sample.spreadBps === null ? [] : [sample.spreadBps],
  );
  const latencies = samples.flatMap((sample) =>
    sample.latencyMs === null ? [] : [sample.latencyMs],
  );
  const totalNotional = notional.reduce((sum, value) => sum + value, 0);
  const totalFees = filled.reduce((sum, sample) => sum + sample.fee, 0);

  return {
    attempts: samples.length,
    filled: filled.length,
    rejected: rejected.length,
    acceptedNotFilled: samples.length - filled.length - rejected.length,
    fillRatePct: round(
      samples.length > 0 ? (filled.length / samples.length) * 100 : 0,
    ),
    rejectionRatePct: round(
      samples.length > 0 ? (rejected.length / samples.length) * 100 : 0,
    ),
    totalNotional: round(totalNotional),
    totalFees: round(totalFees),
    feeBps:
      totalNotional > 0 ? round((totalFees / totalNotional) * 10_000) : null,
    totalSlippageQuote: round(
      slippageQuote.reduce((sum, value) => sum + value, 0),
    ),
    averageSlippageBps: roundedNullable(average(slippageBps)),
    medianSlippageBps: roundedNullable(percentile(slippageBps, 50)),
    p95SlippageBps: roundedNullable(percentile(slippageBps, 95)),
    worstSlippageBps:
      slippageBps.length > 0 ? round(Math.max(...slippageBps)) : null,
    averageSpreadBps: roundedNullable(average(spreads)),
    averageLatencyMs: roundedNullable(average(latencies)),
    p95LatencyMs: roundedNullable(percentile(latencies, 95)),
  };
}
