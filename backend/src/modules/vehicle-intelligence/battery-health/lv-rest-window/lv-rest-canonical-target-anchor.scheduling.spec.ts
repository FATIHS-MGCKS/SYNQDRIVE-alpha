import { getBatteryRest60mDelayMs } from '@config/battery-health-v2.config';
import { computeBatteryRestTargetDelayMs } from '@config/battery-health-v2.config';

describe('canonical anchor scheduling alignment', () => {
  it('uses canonical anchor for REST_60M delay when session startedAt is late', () => {
    const canonicalAnchor = new Date('2026-10-13T17:06:40.000Z');
    const misalignedSessionStart = new Date('2026-10-13T17:29:42.000Z');
    const now = new Date('2026-10-13T18:10:00.000Z');

    const delayFromSession = computeBatteryRestTargetDelayMs(
      misalignedSessionStart,
      now,
      'REST_60M',
    );
    const delayFromCanonical = computeBatteryRestTargetDelayMs(
      canonicalAnchor,
      now,
      'REST_60M',
    );

    expect(delayFromSession).toBeGreaterThan(delayFromCanonical);
    expect(delayFromCanonical).toBe(0);
    expect(delayFromSession).toBeGreaterThan(0);
    expect(getBatteryRest60mDelayMs()).toBe(60 * 60_000);
  });
});
