import {
  canCreateFallbackVehicleEnergyEvent,
  isRfrfNativeFallbackConvergenceAuthorized,
} from '@config/raw-fuel-refuel-fallback.config';
import type { RawRefuelCandidateReadinessResult } from './raw-refuel-candidate-readiness.types';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';
import type {
  RawRefuelPromotionEligibilityResult,
  RawRefuelPromotionEligibilityStatus,
} from './raw-refuel-promotion-eligibility.types';
import type { RawFuelAbsoluteDetectionAdmissibility } from './raw-fuel-refuel-fallback.types';
import type { RawFuelCapability } from './raw-fuel-refuel-fallback.types';

export interface RawRefuelPromotionEligibilityContext {
  capability?: RawFuelCapability;
  absoluteDetectionAdmissibility?: RawFuelAbsoluteDetectionAdmissibility;
  absoluteSignalTrust?: 'TRUSTED' | 'UNTRUSTED' | 'UNKNOWN' | null;
  nativeOverlap: RawRefuelNativeOverlapAdvisoryResult;
}

function buildEligibility(
  status: RawRefuelPromotionEligibilityStatus,
  blockedPendingF5: boolean,
  detail: string,
): RawRefuelPromotionEligibilityResult {
  return { status, blockedPendingF5, detail };
}

/**
 * Promotion eligibility — orthogonal to F2 lifecycle.
 * F5 absence MUST NOT terminal-reject the candidate.
 */
export function evaluateRawRefuelPromotionEligibility(
  readiness: RawRefuelCandidateReadinessResult,
  context: RawRefuelPromotionEligibilityContext,
): RawRefuelPromotionEligibilityResult {
  if (!readiness.ready) {
    return buildEligibility('NOT_READY', false, readiness.detail);
  }

  if (context.capability === 'NON_FUEL_CAPABLE') {
    return buildEligibility('BLOCKED_CAPABILITY', false, 'capability_non_fuel');
  }
  if (context.capability === 'UNKNOWN') {
    return buildEligibility('BLOCKED_CAPABILITY', false, 'capability_unknown');
  }

  if (context.absoluteDetectionAdmissibility === 'INADMISSIBLE') {
    return buildEligibility(
      'BLOCKED_DETECTION_ADMISSIBILITY',
      false,
      'detection_inadmissible',
    );
  }

  const promotionTrust = context.absoluteSignalTrust ?? 'UNKNOWN';
  if (promotionTrust !== 'TRUSTED') {
    return buildEligibility('BLOCKED_PROMOTION_TRUST', true, 'promotion_trust_not_trusted');
  }

  switch (context.nativeOverlap.advisoryClassification) {
    case 'AMBIGUOUS_MULTIPLE_SAME':
      return buildEligibility('AMBIGUOUS', true, 'multiple_same_native_siblings');
    case 'INSUFFICIENT_EVIDENCE':
      return buildEligibility('AMBIGUOUS', true, 'native_overlap_insufficient_evidence');
    case 'SAME':
      return buildEligibility(
        'BLOCKED_NATIVE_OVERLAP_REVIEW',
        true,
        'native_same_physical_refuel_pending_f5',
      );
    case 'NO_NATIVE_SIBLINGS':
    case 'DISTINCT':
      break;
    default: {
      const _exhaustive: never = context.nativeOverlap.advisoryClassification;
      return buildEligibility('ERROR_FAIL_CLOSED', false, `unexpected_overlap_${String(_exhaustive)}`);
    }
  }

  if (!isRfrfNativeFallbackConvergenceAuthorized()) {
    return buildEligibility(
      'BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED',
      true,
      'f5_convergence_not_authorized',
    );
  }

  if (!canCreateFallbackVehicleEnergyEvent()) {
    return buildEligibility(
      'BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED',
      true,
      'fallback_vee_creation_forbidden',
    );
  }

  return buildEligibility('ELIGIBLE_FOR_F5_REVIEW', false, 'eligible_pending_f5_execution');
}
