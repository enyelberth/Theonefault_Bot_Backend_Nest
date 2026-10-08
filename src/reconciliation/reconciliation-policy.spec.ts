import { classifyOrderState, quantitiesMatch } from './reconciliation-policy';

describe('reconciliation policy', () => {
  it('only auto-advances pending local orders to terminal remote states', () => {
    expect(classifyOrderState('NEW', 'FILLED')).toBe('AUTO_ADVANCE');
    expect(classifyOrderState('PARTIALLY_FILLED', 'CANCELED')).toBe(
      'AUTO_ADVANCE',
    );
    expect(classifyOrderState('FILLED', 'NEW')).toBe('CONFLICT');
    expect(classifyOrderState('CANCELED', 'FILLED')).toBe('CONFLICT');
    expect(classifyOrderState('FILLED', 'FILLED')).toBe('MATCH');
  });

  it('uses a numerical tolerance for position quantities', () => {
    expect(quantitiesMatch(1, 1.000000001)).toBe(true);
    expect(quantitiesMatch(1, 1.001)).toBe(false);
  });
});
