import { FuelType, type RawRefuelCandidate } from '@prisma/client';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import { readPersistedAbsoluteDetectionAdmissibility } from './raw-refuel-persisted-detection-admissibility';
import { resolveRawFuelCapability } from './raw-fuel-capability.resolver';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  buildWob20260927EventBCandidate,
} from './testing/wob-2026-09-19-stretched-end.fixture';

function readyCandidate(
  qualityMeta: Record<string, unknown>,
): RawRefuelCandidate {
  return buildWob20260927EventBCandidate({
    qualityMeta: qualityMeta as RawRefuelCandidate['qualityMeta'],
    lifecycleState: 'READY_FOR_PERSIST',
  }) as RawRefuelCandidate;
}

describe('READY recovery admissibility authority (A1–A5)', () => {
  it('A1 — persisted ADMISSIBLE allows readiness to continue', () => {
    const candidate = readyCandidate({ absoluteDetectionAdmissibility: 'ADMISSIBLE' });
    const result = evaluateRawRefuelCandidateReadiness(candidate, {
      capability: 'FUEL_CAPABLE',
    });
    expect(result.ready).toBe(true);
  });

  it('A2 — persisted INADMISSIBLE blocks readiness', () => {
    const candidate = readyCandidate({ absoluteDetectionAdmissibility: 'INADMISSIBLE' });
    const result = evaluateRawRefuelCandidateReadiness(candidate, {
      capability: 'FUEL_CAPABLE',
    });
    expect(result.ready).toBe(false);
    expect(result.reasonCode).toBe('DETECTION_NOT_ADMISSIBLE');
  });

  it('A3 — persisted UNKNOWN is not treated as ADMISSIBLE', () => {
    const candidate = readyCandidate({ absoluteDetectionAdmissibility: 'UNKNOWN' });
    expect(readPersistedAbsoluteDetectionAdmissibility(candidate)).toBe('UNKNOWN');
    const result = evaluateRawRefuelCandidateReadiness(candidate, {
      capability: 'FUEL_CAPABLE',
    });
    expect(result.ready).toBe(false);
    expect(result.detail).toBe('detection_admissibility_unknown');
  });

  it('A4 — fuel capability alone does not imply detection admissibility', () => {
    const candidate = readyCandidate({});
    expect(readPersistedAbsoluteDetectionAdmissibility(candidate)).toBe('UNKNOWN');
    const capability = resolveRawFuelCapability({
      fuelType: FuelType.GASOLINE,
      dimoPowertrainType: 'ICE',
      dimoFuelType: 'GASOLINE',
    });
    expect(capability).toBe('FUEL_CAPABLE');
    const readiness = evaluateRawRefuelCandidateReadiness(candidate, { capability });
    expect(readiness.ready).toBe(false);
  });

  it('A5 — counterfactual TRUSTED + INADMISSIBLE cannot promote', () => {
    const eligibility = evaluateRawRefuelPromotionEligibility(
      {
        ready: true,
        reasonCode: 'READY',
        lifecycleState: 'READY_FOR_PERSIST',
        detail: 'test',
      },
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'INADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: {
          advisoryClassification: 'NO_NATIVE_SIBLINGS',
          siblingAssessments: [],
          sameNativeEventIds: [],
          distinctNativeEventIds: [],
          insufficientNativeEventIds: [],
          detail: 'test',
        },
        candidateEvidenceMeta: buildBaselineRecencyEvidenceMeta({
          classification: 'FRESH',
          reason: 'test',
          bridgeGapSeconds: 120,
          prePlateauStartAt: new Date('2026-09-27T21:30:00.000Z'),
          prePlateauEndAt: new Date('2026-09-27T21:34:00.000Z'),
          riseOnsetAt: new Date('2026-09-27T21:34:16.923Z'),
          interveningPrimarySampleCount: 0,
          interveningContradictionCount: 0,
        }),
      },
    );
    expect(eligibility.status).toBe('BLOCKED_DETECTION_ADMISSIBILITY');
    expect(eligibility.status).not.toBe('AUTHORIZED');
  });
});
