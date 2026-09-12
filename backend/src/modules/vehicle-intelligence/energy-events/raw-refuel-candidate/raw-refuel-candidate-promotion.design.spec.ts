import { mapRawRefuelCandidateToPromotionDraft } from './raw-refuel-candidate-promotion.design';
import type { RawRefuelCandidate } from '@prisma/client';

describe('raw-refuel-candidate-promotion.design', () => {
  it('maps candidate to promotion draft without runtime side effects', () => {
    const candidate = {
      id: 'cand-1',
      vehicleId: 'veh-1',
      candidateIdentityKey: 'key-abc',
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
      signalChannel: 'ABSOLUTE_LITERS',
      detectorVersion: 'rfrf-detector-v0-stub',
      evidenceRevisionFingerprint: 'fp-1',
      firstObservedAt: new Date('2026-09-06T10:00:00.000Z'),
      lastObservedAt: new Date('2026-09-06T10:05:00.000Z'),
    } as RawRefuelCandidate;

    const draft = mapRawRefuelCandidateToPromotionDraft(candidate);
    expect(draft.sourceEventKey).toBe('key-abc');
    expect(draft.detectionSource).toBe('SYNQDRIVE_RAW_FUEL_FALLBACK');
    expect(draft.dimoSegmentIdPlaceholder.startsWith('synqdrive-rfrf-')).toBe(true);
  });
});
