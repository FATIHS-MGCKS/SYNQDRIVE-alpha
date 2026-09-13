import type { RawRefuelCandidatePromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import type { RawRefuelCandidateReadinessResult } from './raw-refuel-candidate-readiness.types';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';
import type { RawRefuelPromotionEligibilityResult } from './raw-refuel-promotion-eligibility.types';

export interface RawRefuelPromotionPreparationResult {
  readiness: RawRefuelCandidateReadinessResult;
  eligibility: RawRefuelPromotionEligibilityResult;
  nativeOverlap: RawRefuelNativeOverlapAdvisoryResult;
  promotionDraft: RawRefuelCandidatePromotionDraft | null;
  /** Always false in F4 — F5 convergence gate stub. */
  f5ConvergenceAuthorized: false;
  /** Always false in F4 — no fallback VehicleEnergyEvent upsert reachable. */
  canCreateFallbackVehicleEnergyEvent: false;
  blockedByF5Gate: boolean;
}
