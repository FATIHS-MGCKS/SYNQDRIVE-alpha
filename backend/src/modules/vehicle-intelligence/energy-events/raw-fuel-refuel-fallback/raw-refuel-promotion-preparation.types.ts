import type { RawRefuelCandidatePromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import type { RawRefuelCandidateReadinessResult } from './raw-refuel-candidate-readiness.types';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';
import type { RawRefuelPromotionEligibilityResult } from './raw-refuel-promotion-eligibility.types';

export interface RawRefuelPromotionPreparationResult {
  readiness: RawRefuelCandidateReadinessResult;
  eligibility: RawRefuelPromotionEligibilityResult;
  nativeOverlap: RawRefuelNativeOverlapAdvisoryResult;
  promotionDraft: RawRefuelCandidatePromotionDraft | null;
  /** F5 convergence authority flag — authorizes evaluation only, not VEE insert. */
  f5ConvergenceAuthorized: boolean;
  /** F5-PR2 promotion execution authority — separate from convergence; default false. */
  canCreateFallbackVehicleEnergyEvent: boolean;
  /** True when fallback VEE promotion remains blocked by missing promotion execution authority. */
  blockedByF5Gate: boolean;
}
