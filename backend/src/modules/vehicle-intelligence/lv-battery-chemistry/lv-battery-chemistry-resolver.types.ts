import type { BatteryChemistry } from '../battery-health/battery-v2-domain';

/** Canonical LV chemistry output — aligned with `BatteryChemistry`. */
export type LvBatteryChemistry = BatteryChemistry;

export const LvBatteryChemistrySource = {
  BATTERY_SPEC: 'BATTERY_SPEC',
  WORKSHOP_DOCUMENT: 'WORKSHOP_DOCUMENT',
  MANUAL_VERIFIED: 'MANUAL_VERIFIED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type LvBatteryChemistrySource =
  (typeof LvBatteryChemistrySource)[keyof typeof LvBatteryChemistrySource];

export const LvBatteryChemistryConfidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type LvBatteryChemistryConfidence =
  (typeof LvBatteryChemistryConfidence)[keyof typeof LvBatteryChemistryConfidence];

/** Priority 1 — confirmed `VehicleBatterySpec` row. */
export interface ConfirmedBatterySpecInput {
  batteryType?: string | null;
  batteryVolt?: number | null;
  sourceType?: string | null;
  sourceConfidence?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Explicit operator confirmation when available. */
  confirmed?: boolean | null;
}

/** Priority 2 — workshop or document-confirmed evidence. */
export interface ChemistryEvidenceInput {
  sourceType: string;
  observedAt?: Date | string | null;
  chemistryRaw?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

/** Priority 3 — verified manual entry (spec or evidence). */
export interface VerifiedManualChemistryInput {
  batteryType?: string | null;
  sourceType?: string | null;
  sourceConfidence?: number | null;
  verifiedAt?: Date | string | null;
}

export interface LvBatteryChemistryResolverInput {
  specs?: ConfirmedBatterySpecInput[] | null;
  workshopDocumentEvidence?: ChemistryEvidenceInput[] | null;
  verifiedManual?: VerifiedManualChemistryInput | null;
  manualEvidence?: ChemistryEvidenceInput[] | null;
}

export interface ResolvedLvBatteryChemistry {
  chemistry: LvBatteryChemistry;
  source: LvBatteryChemistrySource;
  confidence: LvBatteryChemistryConfidence;
  /** ISO timestamp of the underlying verified source, when known. */
  verifiedAt: string | null;
  evidence: string[];
}

export interface ChemistryLayerResolution {
  chemistry: LvBatteryChemistry;
  source: LvBatteryChemistrySource;
  confidence: LvBatteryChemistryConfidence;
  verifiedAt: string | null;
  evidence: string[];
}
