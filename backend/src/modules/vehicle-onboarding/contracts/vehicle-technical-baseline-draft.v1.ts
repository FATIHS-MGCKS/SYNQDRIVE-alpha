import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION } from './vo-document-versions';

/** Onboarding/reference inputs only — not current health authority. */
export interface VehicleTechnicalBaselineDraftV1 {
  version: typeof VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION;
  referenceInputs: Record<string, unknown>;
}
