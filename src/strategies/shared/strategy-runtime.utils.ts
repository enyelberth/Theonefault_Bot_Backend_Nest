export class StrategyRuntimeUtils {
  static roundToStep(value: number, step: string): number {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.floor(value / stepFloat) * stepFloat;
    return parseFloat(adjusted.toFixed(precision));
  }

  static calculateSleepDuration(
    minMs?: number,
    maxMs?: number,
    defaultMinMs: number = 15000,
  ): number {
    const min = minMs ?? defaultMinMs;
    const max = maxMs ?? min;
    if (max <= min) {
      return min;
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static async sleepInterruptible(
    ms: number,
    shouldContinue: () => boolean,
    sliceMs: number = 250,
  ): Promise<void> {
    const end = Date.now() + ms;

    while (Date.now() < end) {
      if (!shouldContinue()) {
        return;
      }

      const remaining = end - Date.now();
      const wait = Math.min(sliceMs, remaining);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  static async exponentialBackoff(
    baseDelayMs: number,
    maxRetries: number,
    shouldContinue: () => boolean,
    onRetry?: (waitTime: number, attempt: number) => void,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (!shouldContinue()) {
        return;
      }

      const waitTime = baseDelayMs * 2 ** attempt;
      onRetry?.(waitTime, attempt);
      await this.sleepInterruptible(waitTime, shouldContinue);
    }
  }
}
