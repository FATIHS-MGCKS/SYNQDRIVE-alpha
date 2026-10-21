import { isSnapshotObdEvidenceTelemetryEligible } from './physical-state-snapshot-telemetry-eligibility';

describe('physical-state-snapshot-telemetry-eligibility', () => {
  const T1 = new Date('2026-09-17T08:07:14.000Z');
  const T0 = new Date('2026-09-16T10:36:56.000Z');

  it('allows evidence when no prior VLS boundary exists', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, null)).toBe(true);
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, undefined)).toBe(true);
  });

  it('allows evidence strictly newer than stored VLS sourceTimestamp', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, T0)).toBe(true);
  });

  it('rejects cached replay at the same VLS sourceTimestamp', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T1, T1)).toBe(false);
  });

  it('rejects evidence older than stored VLS sourceTimestamp', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(T0, T1)).toBe(false);
  });

  it('rejects invalid evidence timestamps', () => {
    expect(isSnapshotObdEvidenceTelemetryEligible(new Date('invalid'), T0)).toBe(false);
    expect(isSnapshotObdEvidenceTelemetryEligible(null, T0)).toBe(false);
  });
});
