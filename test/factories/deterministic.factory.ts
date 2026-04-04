export class DeterministicFactory {
  constructor(private readonly seed: string) {}

  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.seed}-${String(this.counter).padStart(4, '0')}`;
  }

  nextEmail(prefix = 'fixture'): string {
    return `${this.nextId(prefix)}@test.local`;
  }

  nextNumber(base = 1): number {
    this.counter += 1;
    return base + this.counter;
  }
}
