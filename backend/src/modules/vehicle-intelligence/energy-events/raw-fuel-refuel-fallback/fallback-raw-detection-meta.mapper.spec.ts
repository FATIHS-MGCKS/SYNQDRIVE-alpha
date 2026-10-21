import type { RawRefuelCandidate } from '@prisma/client';
import { buildFallbackRawDetectionMeta } from './fallback-raw-detection-meta.mapper';

function baseCandidate(overrides: Partial<RawRefuelCandidate> = {}): RawRefuelCandidate {
  return {
    id: 'cand-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    candidateIdentityKey: 'key-abc',
    detectionVersion: 'rfrf-v1',
    detectorVersion: 'rfrf-detector-v0-stub',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-1',
    riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
    physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
    physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
    deltaAbsoluteLiters: 24,
    deltaRelativePercent: null,
    preFuelAbsoluteLiters: 7,
    postFuelAbsoluteLiters: 31,
    preFuelRelativePercent: null,
    postFuelRelativePercent: null,
    prePlateauSampleCount: 13,
    postPlateauSampleCount: 2,
    totalSampleCount: 15,
    maxSampleGapSeconds: 270,
    absoluteSignalTrust: 'TRUSTED',
    relativeSignalAvailable: false,
    routeEvidenceAvailable: null,
    stationaryEvidenceAvailable: null,
    scanWindowStart: null,
    scanWindowEnd: null,
    signalProvider: 'DIMO',
    evidenceMeta: null,
    qualityMeta: null,
    firstObservedAt: new Date('2026-09-06T10:00:00.000Z'),
    lastObservedAt: new Date('2026-09-06T10:05:00.000Z'),
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    updatedAt: new Date('2026-09-06T10:05:00.000Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

describe('fallback-raw-detection-meta.mapper', () => {
  it('maps canonical G2 fuel transition keys from candidate evidence', () => {
    const meta = buildFallbackRawDetectionMeta(baseCandidate());
    expect(meta.fuelStartLiters).toBe(7);
    expect(meta.fuelEndLiters).toBe(31);
    expect(meta.fuelStartPercent).toBeNull();
    expect(meta.fuelEndPercent).toBeNull();
  });

  it('preserves RFRF provenance and keeps aliases aligned with canonical keys', () => {
    const meta = buildFallbackRawDetectionMeta(
      baseCandidate({
        preFuelRelativePercent: 18,
        postFuelRelativePercent: 72,
      }),
    );
    expect(meta.rawRefuelCandidateId).toBe('cand-1');
    expect(meta.candidateIdentityKey).toBe('key-abc');
    expect(meta.evidenceRevisionFingerprint).toBe('fp-1');
    expect(meta.signalChannel).toBe('ABSOLUTE_LITERS');
    expect(meta.detectorVersion).toBe('rfrf-detector-v0-stub');
    expect(meta.preFuelAbsoluteLiters).toBe(meta.fuelStartLiters);
    expect(meta.postFuelAbsoluteLiters).toBe(meta.fuelEndLiters);
    expect(meta.preFuelRelativePercent).toBe(meta.fuelStartPercent);
    expect(meta.postFuelRelativePercent).toBe(meta.fuelEndPercent);
    expect(meta.fuelStartPercent).toBe(18);
    expect(meta.fuelEndPercent).toBe(72);
  });

  it('does not fabricate null optional percent evidence', () => {
    const meta = buildFallbackRawDetectionMeta(baseCandidate());
    expect(meta.preFuelRelativePercent).toBeNull();
    expect(meta.postFuelRelativePercent).toBeNull();
  });
});
