import { shouldApplyVlsTelemetryUpdate, isIncomingVlsSourceTimestampStale } from './vls-monotonic-merge.util';

describe('vls-monotonic-merge.util', () => {
  const existing = new Date('2026-07-16T12:00:00.000Z');

  it('allows first observation or missing existing timestamp', () => {
    expect(shouldApplyVlsTelemetryUpdate(new Date('2026-07-16T11:00:00.000Z'), null)).toBe(true);
    expect(shouldApplyVlsTelemetryUpdate(null, existing)).toBe(true);
  });

  it('rejects strictly older provider sourceTimestamp (VW-F-008)', () => {
    const incoming = new Date('2026-07-16T11:59:59.000Z');
    expect(isIncomingVlsSourceTimestampStale(incoming, existing)).toBe(true);
    expect(shouldApplyVlsTelemetryUpdate(incoming, existing)).toBe(false);
  });

  it('accepts equal or newer timestamps', () => {
    expect(shouldApplyVlsTelemetryUpdate(existing, existing)).toBe(true);
    expect(
      shouldApplyVlsTelemetryUpdate(new Date('2026-07-16T12:00:01.000Z'), existing),
    ).toBe(true);
  });
});
