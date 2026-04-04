import { DeterministicFactory } from './deterministic.factory';

describe('DeterministicFactory', () => {
  it('genera ids determinísticos y ordenados', () => {
    const factory = new DeterministicFactory('seed');

    expect(factory.nextId('x')).toBe('x-seed-0001');
    expect(factory.nextId('x')).toBe('x-seed-0002');
    expect(factory.nextEmail('user')).toBe('user-seed-0003@test.local');
  });
});
