import { buildMisuseCaseInputFingerprint, requiresMisuseCaseLifecycleRefresh } from './misuse-case-lifecycle.fingerprint';
import { MisuseCaseType } from '@prisma/client';

describe('misuse-case-lifecycle.fingerprint', () => {
  const base = {
    organizationId: 'org-1',
    tripId: 'trip-1',
    vehicleId: 'veh-1',
    caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
    tripEndTimeIso: '2026-07-16T12:00:00.000Z',
    behaviorEventCount: 3,
    drivingEventCount: 2,
    contextAnchorCount: 1,
    dimoSafetyEventCount: 0,
    dtcEventCount: 0,
  };

  it('is deterministic for identical inputs', () => {
    const a = buildMisuseCaseInputFingerprint(base);
    const b = buildMisuseCaseInputFingerprint(base);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes when model version changes', () => {
    const a = buildMisuseCaseInputFingerprint(base);
    const b = buildMisuseCaseInputFingerprint({ ...base, modelVersion: 'misuse-case-lifecycle-v2' });
    expect(a).not.toBe(b);
    expect(
      requiresMisuseCaseLifecycleRefresh(
        { modelVersion: 'misuse-case-lifecycle-v1', inputFingerprint: a },
        { modelVersion: 'misuse-case-lifecycle-v2', inputFingerprint: a },
      ),
    ).toBe(true);
  });

  it('changes when event counts change', () => {
    const a = buildMisuseCaseInputFingerprint(base);
    const b = buildMisuseCaseInputFingerprint({ ...base, behaviorEventCount: 4 });
    expect(a).not.toBe(b);
  });
});
