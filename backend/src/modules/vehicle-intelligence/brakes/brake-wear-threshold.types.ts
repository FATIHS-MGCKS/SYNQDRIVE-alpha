import type { BrakeWearThresholdSource } from '@prisma/client';
import type { BrakeReferenceSpecComponent } from './brake-reference-spec.types';

/** UI/API contract for component wear thresholds. */
export interface BrakeComponentWearThresholdContract {
  component: BrakeReferenceSpecComponent;
  nominalThicknessMm: number | null;
  currentMeasuredThicknessMm: number | null;
  /** Operational warning threshold — conservative, separate from safety minimum. */
  warningThresholdMm: number | null;
  /** Manufacturer / service safety minimum — basis for measured CRITICAL. */
  criticalThresholdMm: number | null;
  minimumThicknessMm: number | null;
  source: BrakeWearThresholdSource | null;
  confirmed: boolean;
  thresholdMissing: boolean;
  thresholdConfidence: number | null;
  usesLegacyDefault: boolean;
}

export interface BrakeReferenceSpecThresholdInput {
  frontPadMinimumThicknessMm?: number | null;
  rearPadMinimumThicknessMm?: number | null;
  frontDiscMinimumThicknessMm?: number | null;
  rearDiscMinimumThicknessMm?: number | null;
  thresholdSource?: BrakeWearThresholdSource | null;
  thresholdConfidence?: number | null;
  thresholdConfirmedAt?: Date | string | null;
}

export interface ResolveWearThresholdOptions {
  anchorMm?: number | null;
  installationMinimumMm?: number | null;
  currentMeasuredThicknessMm?: number | null;
}
