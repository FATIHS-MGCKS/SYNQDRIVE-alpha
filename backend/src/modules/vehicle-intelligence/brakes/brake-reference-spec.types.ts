import type { BrakeReferenceSpecEvidenceCategory, BrakeWearThresholdSource } from '@prisma/client';

export type BrakeReferenceSpecComponent =
  | 'FRONT_PADS'
  | 'REAR_PADS'
  | 'FRONT_DISCS'
  | 'REAR_DISCS';

export interface BrakeReferenceSpecProvenanceInput {
  sourceType?: string | null;
  sourceUrl?: string | null;
  sourcePartNumber?: string | null;
  sourceProvider?: string | null;
  sourceRetrievedAt?: Date | string | null;
  sourceConfidence?: number | null;
  userConfirmedAt?: Date | string | null;
  userConfirmedBy?: string | null;
  thresholdSource?: BrakeWearThresholdSource | null;
  thresholdConfidence?: number | null;
  thresholdConfirmedAt?: Date | string | null;
}

export interface BrakeReferenceSpecThicknessInput {
  frontPadNominalThicknessMm?: number | null;
  rearPadNominalThicknessMm?: number | null;
  frontDiscNominalThicknessMm?: number | null;
  rearDiscNominalThicknessMm?: number | null;
  frontPadMinimumThicknessMm?: number | null;
  rearPadMinimumThicknessMm?: number | null;
  frontDiscMinimumThicknessMm?: number | null;
  rearDiscMinimumThicknessMm?: number | null;
  frontPadEvidenceCategory?: BrakeReferenceSpecEvidenceCategory | null;
  rearPadEvidenceCategory?: BrakeReferenceSpecEvidenceCategory | null;
  frontDiscEvidenceCategory?: BrakeReferenceSpecEvidenceCategory | null;
  rearDiscEvidenceCategory?: BrakeReferenceSpecEvidenceCategory | null;
  /** @deprecated legacy pad field — mapped to nominal on write */
  frontPadThickness?: number | null;
  rearPadThickness?: number | null;
  /** @deprecated legacy rotor width — never auto-mapped to disc nominal */
  frontRotorWidth?: number | null;
  rearRotorWidth?: number | null;
}

export interface BrakeReferenceSpecRecord
  extends BrakeReferenceSpecThicknessInput,
    BrakeReferenceSpecProvenanceInput {
  id?: string;
  vehicleId?: string;
  frontRotorDiameter?: number | null;
  rearRotorDiameter?: number | null;
  semanticMappingVersion?: string | null;
  createdAt?: Date | string;
}

export interface ResolvedNominalThickness {
  thicknessMm: number;
  evidenceCategory: BrakeReferenceSpecEvidenceCategory;
  anchorEligible: boolean;
  sourceField: 'nominal' | 'legacy_pad' | 'legacy_rotor_width_rejected';
  semanticMappingVersion: string;
}

export interface LegacyRotorWidthAdaptation {
  legacyRotorWidthMm: number;
  axis: 'front' | 'rear';
  evidenceCategory: 'LEGACY_UNVERIFIED';
  anchorEligible: false;
  warning: string;
}

export interface ThicknessPlausibilityResult {
  valid: boolean;
  errors: string[];
}

export interface SpecVehicleFitContext {
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  powertrain?: string | null;
  brakePackage?: string | null;
  performanceVariant?: boolean | null;
}

export interface SpecVehicleFitResult {
  valid: boolean;
  errors: string[];
}
