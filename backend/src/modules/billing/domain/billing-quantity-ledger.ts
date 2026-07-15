import { BillingQuantityEventType } from '@prisma/client';

export const BillingQuantityErrorCode = {
  QUANTITY_NEGATIVE: 'QUANTITY_NEGATIVE',
  CROSS_TENANT_ORGANIZATION: 'CROSS_TENANT_ORGANIZATION',
  CROSS_TENANT_VEHICLE: 'CROSS_TENANT_VEHICLE',
  CROSS_TENANT_SUBSCRIPTION: 'CROSS_TENANT_SUBSCRIPTION',
  RETROACTIVE_NOT_AUTHORIZED: 'RETROACTIVE_NOT_AUTHORIZED',
  SUBSCRIPTION_ITEM_NOT_FOUND: 'SUBSCRIPTION_ITEM_NOT_FOUND',
  INVALID_DELTA: 'INVALID_DELTA',
} as const;

export type BillingQuantityErrorCode =
  (typeof BillingQuantityErrorCode)[keyof typeof BillingQuantityErrorCode];

export interface QuantityTimelineEvent {
  effectiveAt: Date;
  recordedAt: Date;
  delta: number;
  /** Stable ordering for events sharing the same effective/recorded timestamps. */
  tieBreaker?: number;
}

export interface QuantityReplayResult {
  quantity: number;
  appliedDeltas: number;
}

export function compareQuantityTimeline(
  a: { effectiveAt: Date; recordedAt: Date; tieBreaker?: number },
  b: { effectiveAt: Date; recordedAt: Date; tieBreaker?: number },
): number {
  const effectiveDiff = a.effectiveAt.getTime() - b.effectiveAt.getTime();
  if (effectiveDiff !== 0) return effectiveDiff;
  const recordedDiff = a.recordedAt.getTime() - b.recordedAt.getTime();
  if (recordedDiff !== 0) return recordedDiff;
  return (a.tieBreaker ?? 0) - (b.tieBreaker ?? 0);
}

export function replayQuantityAt(
  events: QuantityTimelineEvent[],
  asOf: Date,
): QuantityReplayResult {
  const applicable = events
    .filter((event) => event.effectiveAt.getTime() <= asOf.getTime())
    .sort(compareQuantityTimeline);

  return applicable.reduce(
    (acc, event) => ({
      quantity: acc.quantity + event.delta,
      appliedDeltas: acc.appliedDeltas + 1,
    }),
    { quantity: 0, appliedDeltas: 0 },
  );
}

export function computeQuantityTransition(
  events: QuantityTimelineEvent[],
  input: {
    effectiveAt: Date;
    recordedAt: Date;
    delta: number;
  },
): { quantityBefore: number; quantityAfter: number } {
  const insertionOrder = Number.MAX_SAFE_INTEGER;
  const priorEvents = events.filter(
    (event) =>
      compareQuantityTimeline(event, {
        effectiveAt: input.effectiveAt,
        recordedAt: input.recordedAt,
        tieBreaker: insertionOrder,
      }) < 0,
  );

  const quantityBefore = replayQuantityAt(priorEvents, input.effectiveAt).quantity;
  const quantityAfter = quantityBefore + input.delta;

  return { quantityBefore, quantityAfter };
}

export function isRetroactiveEvent(effectiveAt: Date, recordedAt: Date): boolean {
  return effectiveAt.getTime() < recordedAt.getTime();
}

export function deltaForEventType(eventType: BillingQuantityEventType): number | null {
  switch (eventType) {
    case BillingQuantityEventType.VEHICLE_CONNECTED:
    case BillingQuantityEventType.VEHICLE_INCLUDED:
    case BillingQuantityEventType.SUBSCRIPTION_ACTIVATED:
      return 1;
    case BillingQuantityEventType.VEHICLE_DISCONNECTED:
    case BillingQuantityEventType.VEHICLE_EXCLUDED:
    case BillingQuantityEventType.SUBSCRIPTION_PAUSED:
    case BillingQuantityEventType.ORG_BILLING_DEACTIVATED:
      return -1;
    default:
      return null;
  }
}

export function buildQuantityIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}
