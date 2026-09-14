import type { RawFuelCapability } from './raw-fuel-refuel-fallback.types';
import type { RawRefuelPromotionPreparationResult } from './raw-refuel-promotion-preparation.types';
import type { RawRefuelConvergenceApplyResult } from './raw-refuel-native-fallback-convergence.types';

export type RawFuelRefuelFallbackSkipReason =
  | 'master_disabled'
  | 'persist_without_master'
  | 'no_dimo_token'
  | 'capability_non_fuel'
  | 'capability_unknown'
  | 'sample_fetch_failed'
  | 'no_samples';

export interface RawFuelRefuelFallbackScanInput {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  windowFrom: Date;
  windowTo: Date;
  fuelType: import('@prisma/client').FuelType | null;
  dimoPowertrainType?: string | null;
  dimoFuelType?: string | null;
  requestContext: {
    organizationId: string;
    vehicleId: string;
    tokenId: number;
  };
}

export interface RawFuelRefuelFallbackCandidateOutcome {
  observationIndex: number;
  lifecycleState: string;
  persisted: boolean;
  created: boolean;
  rediscovered: boolean;
  candidateId?: string;
  error?: string;
  promotionPreparation?: RawRefuelPromotionPreparationResult;
  promotionPreparationError?: string;
  convergenceApply?: RawRefuelConvergenceApplyResult;
  convergenceApplyError?: string;
}

export interface RawFuelRefuelFallbackScanResult {
  invoked: boolean;
  masterEnabled: boolean;
  persistEnabled: boolean;
  skipReason?: RawFuelRefuelFallbackSkipReason;
  capability?: RawFuelCapability;
  fetchErrorClass?: 'AUTH_UNAVAILABLE' | 'PROVIDER_QUERY_FAILED';
  samplesFetched: number;
  detectorInvoked: boolean;
  observationsEmitted: number;
  persistAttempted: number;
  candidatesCreated: number;
  candidatesRediscovered: number;
  persistSkippedBecauseFlagOff: number;
  promotionPreparationAttempted: number;
  promotionDraftsConstructed: number;
  promotionBlockedByF5Gate: number;
  convergenceEvaluationAttempted: number;
  convergenceConvergedNative: number;
  convergenceFailClosed: number;
  convergenceSkippedNotAuthorized: number;
  candidateOutcomes: RawFuelRefuelFallbackCandidateOutcome[];
  branchError?: string;
}
