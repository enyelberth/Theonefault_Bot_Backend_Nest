export type OrderStateDecision = 'MATCH' | 'AUTO_ADVANCE' | 'CONFLICT';

const LOCALLY_PENDING = new Set(['NEW', 'PARTIALLY_FILLED']);
const REMOTELY_TERMINAL = new Set([
  'FILLED',
  'CANCELED',
  'EXPIRED',
  'REJECTED',
]);

export function classifyOrderState(
  localStatus: string,
  remoteStatus: string,
): OrderStateDecision {
  if (localStatus === remoteStatus) return 'MATCH';
  if (LOCALLY_PENDING.has(localStatus) && REMOTELY_TERMINAL.has(remoteStatus)) {
    return 'AUTO_ADVANCE';
  }
  return 'CONFLICT';
}

export function quantitiesMatch(
  localQuantity: number,
  remoteQuantity: number,
  tolerance = 1e-8,
): boolean {
  return Math.abs(localQuantity - remoteQuantity) <= tolerance;
}
