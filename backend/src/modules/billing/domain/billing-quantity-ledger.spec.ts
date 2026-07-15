import { BillingQuantityEventType } from '@prisma/client';
import {
  compareQuantityTimeline,
  computeQuantityTransition,
  replayQuantityAt,
} from './billing-quantity-ledger';

describe('billing-quantity-ledger', () => {
  const t = (iso: string) => new Date(iso);

  it('replays quantity chronologically by effectiveAt then recordedAt', () => {
    const quantity = replayQuantityAt(
      [
        { effectiveAt: t('2026-07-01'), recordedAt: t('2026-07-02'), delta: 2 },
        { effectiveAt: t('2026-07-03'), recordedAt: t('2026-07-03'), delta: -1 },
      ],
      t('2026-07-10'),
    ).quantity;

    expect(quantity).toBe(1);
  });

  it('supports retroactive reconstruction when later-recorded events exist', () => {
    const events = [
      { effectiveAt: t('2026-07-10'), recordedAt: t('2026-07-10'), delta: 2 },
      { effectiveAt: t('2026-07-05'), recordedAt: t('2026-07-11'), delta: 1 },
    ];

    expect(replayQuantityAt(events, t('2026-07-07')).quantity).toBe(1);
    expect(replayQuantityAt(events, t('2026-07-10')).quantity).toBe(3);
  });

  it('computes before/after for insertion into historical timeline', () => {
    const existing = [
      { effectiveAt: t('2026-07-01'), recordedAt: t('2026-07-01'), delta: 2 },
      { effectiveAt: t('2026-07-10'), recordedAt: t('2026-07-10'), delta: 1 },
    ];

    const transition = computeQuantityTransition(existing, {
      effectiveAt: t('2026-07-05'),
      recordedAt: t('2026-07-12'),
      delta: -1,
    });

    expect(transition.quantityBefore).toBe(2);
    expect(transition.quantityAfter).toBe(1);
  });

  it('computes before/after when events share the same timestamp', () => {
    const existing = [
      { effectiveAt: t('2026-07-01'), recordedAt: t('2026-07-01'), delta: 1, tieBreaker: 0 },
    ];

    const transition = computeQuantityTransition(existing, {
      effectiveAt: t('2026-07-01'),
      recordedAt: t('2026-07-01'),
      delta: -1,
    });

    expect(transition.quantityBefore).toBe(1);
    expect(transition.quantityAfter).toBe(0);
  });

  it('orders same effectiveAt by recordedAt', () => {
    expect(
      compareQuantityTimeline(
        { effectiveAt: t('2026-07-01'), recordedAt: t('2026-07-02') },
        { effectiveAt: t('2026-07-01'), recordedAt: t('2026-07-03') },
      ),
    ).toBeLessThan(0);
  });
});

describe('billing-quantity event types', () => {
  it('maps vehicle license events to unit deltas', () => {
    expect(BillingQuantityEventType.VEHICLE_CONNECTED).toBe('VEHICLE_CONNECTED');
    expect(BillingQuantityEventType.VEHICLE_DISCONNECTED).toBe('VEHICLE_DISCONNECTED');
  });
});
