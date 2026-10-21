import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './vo-document-versions';
import type { BrakeReferenceSpecProvenanceInput } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.types';
import type { BrakeReferenceSpecThicknessInput } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.types';
import type {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

/** Reference-only tire dimension / pressure provenance — not installed config or health. */
export interface VehicleOnboardingTireReferenceSpecDraft {
  frontDimension?: string | null;
  rearDimension?: string | null;
  loadIndexFront?: string | null;
  speedIndexFront?: string | null;
  loadIndexRear?: string | null;
  speedIndexRear?: string | null;
  recommendedPressureFrontBar?: number | null;
  recommendedPressureRearBar?: number | null;
  referenceProvenance?: string | null;
}

/** Explicit installed-tire evidence — materialization gated by VehicleTireSetup safety audit. */
export interface VehicleOnboardingTireInstalledConfigDraft {
  evidenceInstalled: true;
  brandModelFront?: string | null;
  brandModelRear?: string | null;
  tireSeason?: string | null;
  installedAt?: string | null;
  frontDimension?: string | null;
  rearDimension?: string | null;
}

export type VehicleOnboardingBrakeReferenceDraft = BrakeReferenceSpecThicknessInput &
  BrakeReferenceSpecProvenanceInput & {
    frontRotorDiameter?: number | null;
    rearRotorDiameter?: number | null;
    frontRotorWidth?: number | null;
    rearRotorWidth?: number | null;
  };

export interface VehicleOnboardingHvBatteryReferenceDraft {
  capacityKwh: number;
  capacityType: BatteryReferenceCapacityType;
  source: BatteryReferenceCapacitySource;
  documentId?: string | null;
  serviceEventId?: string | null;
  notes?: string | null;
}

export interface VehicleTechnicalBaselineDraftV2 {
  version: typeof VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2;
  tireReferenceSpec?: VehicleOnboardingTireReferenceSpecDraft | null;
  tireInstalledConfig?: VehicleOnboardingTireInstalledConfigDraft | null;
  brakeReference?: VehicleOnboardingBrakeReferenceDraft | null;
  hvBatteryReference?: VehicleOnboardingHvBatteryReferenceDraft | null;
}
