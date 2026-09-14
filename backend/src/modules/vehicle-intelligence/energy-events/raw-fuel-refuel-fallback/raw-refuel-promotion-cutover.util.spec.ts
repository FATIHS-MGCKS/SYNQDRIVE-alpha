import type { RawRefuelCandidate } from '@prisma/client';
import {
  evaluateRawRefuelPromotionCutover,
  resolveCandidatePhysicalEvidenceEnd,
} from './raw-refuel-promotion-cutover.util';

function buildCandidate(partial: Partial<RawRefuelCandidate>): RawRefuelCandidate {
  return {
    id: 'cand-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    candidateIdentityKey: 'identity-1',
    lifecycleState: 'READY_FOR_PERSIST',
    firstObservedAt: new Date('2026-09-06T10:00:00.000Z'),
    lastObservedAt: new Date('2026-09-06T10:30:00.000Z'),
    physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
    physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
    riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
    preFuelAbsoluteLiters: 7,
    postFuelAbsoluteLiters: 31,
    deltaAbsoluteLiters: 24,
    absoluteSignalTrust: 'TRUSTED',
    qualityMeta: {},
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    ...partial,
  } as RawRefuelCandidate;
}

describe('raw-refuel-promotion-cutover.util', () => {
  it('uses physical evidence end, not createdAt', () => {
    const candidate = buildCandidate({
      createdAt: new Date('2026-09-07T00:00:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
    });
    expect(resolveCandidatePhysicalEvidenceEnd(candidate).toISOString()).toBe(
      '2026-09-06T09:47:00.000Z',
    );
  });

  it('evidence before cutover => blocked', () => {
    const candidate = buildCandidate({});
    const result = evaluateRawRefuelPromotionCutover(
      candidate,
      new Date('2026-09-06T10:00:00.000Z'),
    );
    expect(result.eligible).toBe(false);
    expect(result.detail).toBe('evidence_before_cutover');
  });

  it('evidence equal to cutover => eligible', () => {
    const candidate = buildCandidate({});
    const cutover = new Date('2026-09-06T09:47:00.000Z');
    const result = evaluateRawRefuelPromotionCutover(candidate, cutover);
    expect(result.eligible).toBe(true);
    expect(result.detail).toBe('cutover_satisfied');
  });

  it('evidence after cutover => eligible', () => {
    const candidate = buildCandidate({});
    const result = evaluateRawRefuelPromotionCutover(
      candidate,
      new Date('2026-09-06T09:00:00.000Z'),
    );
    expect(result.eligible).toBe(true);
  });

  it('unset cutover => fail closed', () => {
    const candidate = buildCandidate({});
    const result = evaluateRawRefuelPromotionCutover(candidate, null);
    expect(result.eligible).toBe(false);
    expect(result.detail).toBe('cutover_unset_or_invalid');
  });
});
