import {
  canCreateFallbackVehicleEnergyEvent,
  isRfrfNativeFallbackConvergenceAuthorized,
} from '@config/raw-fuel-refuel-fallback.config';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';

describe('evaluateRawRefuelPromotionEligibility', () => {
  const ready = evaluateRawRefuelCandidateReadiness(
    {
      lifecycleState: 'READY_FOR_PERSIST',
    } as never,
    { capability: 'FUEL_CAPABLE' },
  );
  ready.ready = true;
  ready.reasonCode = 'READY';

  const noOverlap: RawRefuelNativeOverlapAdvisoryResult = {
    advisoryClassification: 'NO_NATIVE_SIBLINGS',
    siblingAssessments: [],
    sameNativeEventIds: [],
    distinctNativeEventIds: [],
    insufficientNativeEventIds: [],
    detail: 'none',
  };

  it('F5 gate defaults false — always BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED when otherwise eligible', () => {
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
    expect(canCreateFallbackVehicleEnergyEvent()).toBe(false);

    const result = evaluateRawRefuelPromotionEligibility(ready, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: noOverlap,
    });
    expect(result.status).toBe('BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED');
    expect(result.blockedPendingF5).toBe(true);
  });

  it('NOT_READY when readiness fails', () => {
    const notReady = { ...ready, ready: false, reasonCode: 'CANDIDATE_SETTLING' as const };
    const result = evaluateRawRefuelPromotionEligibility(notReady, {
      nativeOverlap: noOverlap,
    });
    expect(result.status).toBe('NOT_READY');
    expect(result.blockedPendingF5).toBe(false);
  });

  it('SAME native overlap => BLOCKED_NATIVE_OVERLAP_REVIEW without terminal rejection semantics', () => {
    const result = evaluateRawRefuelPromotionEligibility(ready, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: {
        ...noOverlap,
        advisoryClassification: 'SAME',
        sameNativeEventIds: ['native-1'],
      },
    });
    expect(result.status).toBe('BLOCKED_NATIVE_OVERLAP_REVIEW');
    expect(result.blockedPendingF5).toBe(true);
  });

  it('promotion trust UNKNOWN => BLOCKED_PROMOTION_TRUST', () => {
    const result = evaluateRawRefuelPromotionEligibility(ready, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'UNKNOWN',
      nativeOverlap: noOverlap,
    });
    expect(result.status).toBe('BLOCKED_PROMOTION_TRUST');
  });

  it('multiple SAME siblings => AMBIGUOUS fail closed', () => {
    const result = evaluateRawRefuelPromotionEligibility(ready, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: {
        ...noOverlap,
        advisoryClassification: 'AMBIGUOUS_MULTIPLE_SAME',
      },
    });
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('INSUFFICIENT native overlap (including SAME+INSUFFICIENT aggregate) => AMBIGUOUS fail closed', () => {
    const result = evaluateRawRefuelPromotionEligibility(ready, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: {
        ...noOverlap,
        advisoryClassification: 'INSUFFICIENT_EVIDENCE',
        sameNativeEventIds: ['native-same'],
        insufficientNativeEventIds: ['native-insufficient'],
        detail: 'same_with_insufficient_native_siblings',
      },
    });
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.blockedPendingF5).toBe(true);
  });
});
