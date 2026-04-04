import { Injectable } from '@nestjs/common';

@Injectable()
export class ObservabilityService {
  private readonly requestCountByRoute = new Map<string, number>();
  private readonly errorCountByRoute = new Map<string, number>();
  private readonly latencyByRoute = new Map<string, number[]>();
  private readonly customCounters = new Map<string, number>();
  private readonly customGauges = new Map<string, number>();

  trackRequest(route: string, durationMs: number, isError: boolean) {
    this.requestCountByRoute.set(route, (this.requestCountByRoute.get(route) ?? 0) + 1);
    if (isError) {
      this.errorCountByRoute.set(route, (this.errorCountByRoute.get(route) ?? 0) + 1);
    }

    const current = this.latencyByRoute.get(route) ?? [];
    current.push(durationMs);
    if (current.length > 1000) {
      current.shift();
    }
    this.latencyByRoute.set(route, current);
  }

  incrementCounter(metric: string, value = 1) {
    this.customCounters.set(metric, (this.customCounters.get(metric) ?? 0) + value);
  }

  setGauge(metric: string, value: number) {
    this.customGauges.set(metric, value);
  }

  getMetricsSnapshot() {
    const metrics = [] as Array<{
      route: string;
      requests: number;
      errors: number;
      errorRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
    }>;

    for (const [route, requests] of this.requestCountByRoute.entries()) {
      const errors = this.errorCountByRoute.get(route) ?? 0;
      const latency = [...(this.latencyByRoute.get(route) ?? [])].sort((a, b) => a - b);
      const avgLatencyMs = latency.length > 0
        ? latency.reduce((acc, value) => acc + value, 0) / latency.length
        : 0;
      const p95Index = latency.length > 0 ? Math.floor(latency.length * 0.95) - 1 : -1;
      const p95LatencyMs = p95Index >= 0 ? latency[p95Index] : 0;

      metrics.push({
        route,
        requests,
        errors,
        errorRate: requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0,
        avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
        p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      routes: metrics,
      counters: [...this.customCounters.entries()].map(([metric, value]) => ({ metric, value })),
      gauges: [...this.customGauges.entries()].map(([metric, value]) => ({ metric, value })),
    };
  }
}
