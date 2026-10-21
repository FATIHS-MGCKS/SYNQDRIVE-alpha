import type { RawRefuelCandidate } from '@prisma/client';
import { mapRawRefuelCandidateToPromotionDraft } from './raw-refuel-candidate-promotion.design';

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

describe('raw-refuel-candidate-promotion.design', () => {
  it('uses riseEndAt as endTime when present', () => {
    const draft = mapRawRefuelCandidateToPromotionDraft(baseCandidate());
    expect(draft.startTime.toISOString()).toBe('2026-09-06T09:39:30.000Z');
    expect(draft.endTime.toISOString()).toBe('2026-09-06T09:47:00.000Z');
    expect(draft.durationSeconds).toBe(450);
    expect(draft.fuelLevelRiseStart?.toISOString()).toBe('2026-09-06T09:39:30.000Z');
    expect(draft.fuelLevelRiseEnd?.toISOString()).toBe('2026-09-06T09:47:00.000Z');
    expect(draft.firstObservedAt.toISOString()).toBe('2026-09-06T10:00:00.000Z');
  });

  it('falls back to physicalEvidenceEnd when riseEndAt is null', () => {
    const draft = mapRawRefuelCandidateToPromotionDraft(
      baseCandidate({
        riseEndAt: null,
        physicalEvidenceEnd: new Date('2026-09-06T09:50:00.000Z'),
      }),
    );
    expect(draft.endTime.toISOString()).toBe('2026-09-06T09:50:00.000Z');
  });

  it('uses lastObservedAt when only post-fuel evidence exists without rise/physical end', () => {
    const draft = mapRawRefuelCandidateToPromotionDraft(
      baseCandidate({
        riseEndAt: null,
        physicalEvidenceEnd: null,
        postFuelAbsoluteLiters: 31,
      }),
    );
    expect(draft.endTime.toISOString()).toBe('2026-09-06T10:05:00.000Z');
  });

  it('uses firstObservedAt as minimal fallback endTime', () => {
    const draft = mapRawRefuelCandidateToPromotionDraft(
      baseCandidate({
        riseEndAt: null,
        physicalEvidenceEnd: null,
        postFuelAbsoluteLiters: null,
        postFuelRelativePercent: null,
      }),
    );
    expect(draft.endTime.toISOString()).toBe('2026-09-06T10:00:00.000Z');
  });

  it('populates canonical G2 rawDetectionMeta fuel transition contract', () => {
    const draft = mapRawRefuelCandidateToPromotionDraft(
      baseCandidate({
        preFuelRelativePercent: 18,
        postFuelRelativePercent: 72,
      }),
    );
    const meta = draft.rawDetectionMeta as Record<string, unknown>;
    expect(meta.fuelStartLiters).toBe(7);
    expect(meta.fuelEndLiters).toBe(31);
    expect(meta.fuelStartPercent).toBe(18);
    expect(meta.fuelEndPercent).toBe(72);
    expect(meta.preFuelAbsoluteLiters).toBe(meta.fuelStartLiters);
    expect(meta.postFuelAbsoluteLiters).toBe(meta.fuelEndLiters);
    expect(meta.rawRefuelCandidateId).toBe('cand-1');
    expect(meta.candidateIdentityKey).toBe('key-abc');
  });
});
