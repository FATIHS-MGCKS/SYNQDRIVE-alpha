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
  /** Always false in F5-PR1 — no fallback VehicleEnergyEvent upsert reachable. */
  canCreateFallbackVehicleEnergyEvent: false;
  /** True when fallback VEE promotion remains blocked (always true in F5-PR1). */
  blockedByF5Gate: boolean;
}
