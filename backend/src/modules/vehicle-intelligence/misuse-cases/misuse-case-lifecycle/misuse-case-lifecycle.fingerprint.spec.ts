import { MisuseCaseType } from '@prisma/client';
import { buildMisuseCaseInputFingerprint } from './misuse-case-lifecycle.fingerprint';

describe('misuse-case-lifecycle.fingerprint (legacy shim)', () => {
  it('still hashes legacy counter-based identity for transitional callers', () => {
    const fp = buildMisuseCaseInputFingerprint({
      organizationId: 'org-1',
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      caseType: MisuseCaseType.COLD_ENGINE_ABUSE,
      tripEndTimeIso: '2026-07-16T12:00:00Z',
      behaviorEventCount: 2,
      drivingEventCount: 1,
      contextAnchorCount: 0,
      dimoSafetyEventCount: 0,
      dtcEventCount: 0,
    });
    expect(fp).toHaveLength(64);
  });
});
