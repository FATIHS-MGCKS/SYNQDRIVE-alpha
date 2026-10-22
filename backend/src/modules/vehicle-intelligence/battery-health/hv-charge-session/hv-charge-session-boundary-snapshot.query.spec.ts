import {
  buildHvChargeSessionBoundarySnapshotAnchorWindows,
  mergeHvChargeSessionBoundarySnapshotRows,
} from './hv-charge-session-boundary-snapshot.query';

describe('hv-charge-session-boundary-snapshot.query', () => {
  it('anchors start and end windows without spanning the full session interior', () => {
    const startAt = new Date('2026-01-01T00:00:00.000Z');
    const endAt = new Date('2026-01-05T00:00:00.000Z');
    const { startAnchor, endAnchor } = buildHvChargeSessionBoundarySnapshotAnchorWindows({
      sessionStartAt: startAt,
      sessionEndAt: endAt,
    });
    expect(startAnchor.lte.getTime()).toBeLessThan(endAnchor.gte.getTime());
    expect(startAnchor.gte.getTime()).toBeLessThan(startAt.getTime());
    expect(endAnchor.lte.getTime()).toBeGreaterThan(endAt.getTime());
  });

  it('dedupes merged anchor rows deterministically', () => {
    const t = new Date('2026-06-21T19:01:00.000Z');
    const row = {
      recordedAt: t,
      providerReceivedAt: t,
      socPercent: 40,
      energyUsedKwh: 20,
      energyObservedAt: t,
      isCharging: true,
      chargingCableConnected: true,
      idempotencyKey: 'k1',
    };
    const merged = mergeHvChargeSessionBoundarySnapshotRows([row, row]);
    expect(merged).toHaveLength(1);
  });
});
