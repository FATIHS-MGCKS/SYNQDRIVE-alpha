import {
  buildDrivingAnalysisInputFingerprint,
  requiresNewAnalysisRun,
} from './driving-analysis-run.fingerprint';
import type { DrivingAnalysisInputIdentity } from './driving-analysis-run.types';

function baseIdentity(
  overrides: Partial<DrivingAnalysisInputIdentity> = {},
): DrivingAnalysisInputIdentity {
  return {
    organizationId: 'org-1',
    tripId: 'trip-1',
    vehicleId: 'vehicle-1',
    analysisType: 'TRIP_ASSESSABILITY',
    dimoSegmentId: 'seg-abc',
    tripEndTimeIso: '2026-07-16T08:45:00.000Z',
    behaviorEnrichmentStatus: 'COMPLETED',
    routeEnrichmentStatus: 'COMPLETED',
    nativeEventCount: 3,
    hfPointsCleaned: 120,
    waypointCount: 80,
    capabilityVersion: 'cap-v1',
    inputTags: ['behavior', 'route'],
    ...overrides,
  };
}

describe('buildDrivingAnalysisInputFingerprint', () => {
  it('is deterministic for identical input identities', () => {
    const a = buildDrivingAnalysisInputFingerprint(baseIdentity());
    const b = buildDrivingAnalysisInputFingerprint(baseIdentity());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when input identity changes', () => {
    const baseline = buildDrivingAnalysisInputFingerprint(baseIdentity());
    const changedWaypoint = buildDrivingAnalysisInputFingerprint(
      baseIdentity({ waypointCount: 81 }),
    );
    const changedCapability = buildDrivingAnalysisInputFingerprint(
      baseIdentity({ capabilityVersion: 'cap-v2' }),
    );
    expect(changedWaypoint).not.toBe(baseline);
    expect(changedCapability).not.toBe(baseline);
  });

  it('requiresNewAnalysisRun when model or fingerprint differs', () => {
    const existing = { modelVersion: 'model-v1', inputFingerprint: 'fp-1' };
    expect(
      requiresNewAnalysisRun(existing, { modelVersion: 'model-v1', inputFingerprint: 'fp-1' }),
    ).toBe(false);
    expect(
      requiresNewAnalysisRun(existing, { modelVersion: 'model-v2', inputFingerprint: 'fp-1' }),
    ).toBe(true);
    expect(
      requiresNewAnalysisRun(existing, { modelVersion: 'model-v1', inputFingerprint: 'fp-2' }),
    ).toBe(true);
    expect(requiresNewAnalysisRun(null, { modelVersion: 'model-v1', inputFingerprint: 'fp-1' })).toBe(
      true,
    );
  });
});
