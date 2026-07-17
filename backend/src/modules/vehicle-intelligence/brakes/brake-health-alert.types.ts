import type { BrakeAlertCode, BrakeCondition, BrakeConfidenceLevel, BrakeDataBasis } from './brake-status';
import type { BrakeHealthAlertResolutionReason } from '@prisma/client';

export const BRAKE_HEALTH_ALERT_CATEGORIES = ['WEAR', 'SAFETY', 'DATA_QUALITY'] as const;
export type BrakeHealthAlertCategory = (typeof BRAKE_HEALTH_ALERT_CATEGORIES)[number];

export const BRAKE_HEALTH_ALERT_TYPES = [
  'PAD_WARNING',
  'PAD_CRITICAL',
  'DISC_WARNING',
  'DISC_CRITICAL',
  'LOW_REMAINING_KM',
  'ABS_WARNING',
  'BRAKE_DTC',
  'BRAKE_FLUID',
  'IMMEDIATE_REPLACEMENT',
  'WEAR_SENSOR',
  'NO_BASELINE',
  'SPEC_UNCONFIRMED',
  'COVERAGE_GAP',
  'DISTANCE_CONFLICT',
  'MEASUREMENT_REQUIRED',
  'STALE_EVIDENCE',
] as const;

export type BrakeHealthAlertType = (typeof BRAKE_HEALTH_ALERT_TYPES)[number];

export const BRAKE_HEALTH_ALERT_REASON_CODES = [
  'PAD_WARNING_MEASURED',
  'PAD_WARNING_ESTIMATED',
  'PAD_CRITICAL_MEASURED',
  'PAD_CRITICAL_ESTIMATED',
  'DISC_WARNING_MEASURED',
  'DISC_WARNING_ESTIMATED',
  'DISC_CRITICAL_MEASURED',
  'DISC_CRITICAL_ESTIMATED',
  'LOW_REMAINING_KM',
  'ABS_DTC_ACTIVE',
  'ABS_DTC_CRITICAL',
  'BRAKE_DTC_ACTIVE',
  'BRAKE_DTC_CRITICAL',
  'BRAKE_FLUID_CRITICAL',
  'BRAKE_FLUID_WARNING',
  'IMMEDIATE_REPLACEMENT_DOCUMENTED',
  'WEAR_SENSOR_ACTIVE',
  'NO_BASELINE',
  'SPEC_UNCONFIRMED',
  'COVERAGE_GAP',
  'DISTANCE_CONFLICT',
  'MEASUREMENT_REQUIRED',
  'STALE_EVIDENCE',
] as const;

export type BrakeHealthAlertReasonCode =
  (typeof BRAKE_HEALTH_ALERT_REASON_CODES)[number];

export type BrakeAlertDisplayMode =
  | 'MEASURED'
  | 'ESTIMATED'
  | 'SAFETY_EVIDENCE'
  | 'DATA_GAP';

export type BrakeAlertSeverity = 'info' | 'warning' | 'critical';

export interface StructuredBrakeAlertCandidate {
  alertType: BrakeHealthAlertType;
  category: BrakeHealthAlertCategory;
  reasonCode: BrakeHealthAlertReasonCode;
  code: BrakeAlertCode;
  severity: BrakeAlertSeverity;
  displayMode: BrakeAlertDisplayMode;
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN' | null;
  value?: number | null;
  componentInstallationId?: string | null;
  evidenceFingerprint: string;
  dedupeKey: string;
  notifyEligible: boolean;
  templateParams: Record<string, string | number | null>;
}

export interface BrakeAlertSyncResult {
  openAlerts: StructuredBrakeAlertCandidate[];
  newlyOpened: string[];
  resolved: string[];
  notificationsToEmit: StructuredBrakeAlertCandidate[];
}

export interface PersistedBrakeAlertRow {
  id: string;
  alertType: string;
  category: string;
  reasonCode: string;
  severity: string;
  axle: string | null;
  displayMode: string;
  dedupeKey: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionReason: BrakeHealthAlertResolutionReason | null;
  templateParamsJson: Record<string, unknown> | null;
}

export interface BuildBrakeHealthAlertsInput {
  organizationId: string;
  vehicleId: string;
  modelSnapshotId?: string | null;
  initialized: boolean;
  stateClass?: string | null;
  frontPadCondition: BrakeCondition;
  rearPadCondition: BrakeCondition;
  frontDiscCondition: BrakeCondition;
  rearDiscCondition: BrakeCondition;
  frontPadBasis: BrakeDataBasis;
  rearPadBasis: BrakeDataBasis;
  frontDiscBasis: BrakeDataBasis;
  rearDiscBasis: BrakeDataBasis;
  minRemainingKm: number | null;
  fluidCondition: BrakeCondition;
  dtcCondition: BrakeCondition;
  dtcCode?: string | null;
  dtcCategory?: string | null;
  immediateReplacement: boolean;
  wearSensorActive: boolean;
  coverageGap: boolean;
  distanceConflict: boolean;
  specUnconfirmed: boolean;
  staleEvidence: boolean;
  overallConfidence: BrakeConfidenceLevel;
  componentInstallationIds?: Partial<
    Record<'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS', string>
  >;
}

export { BrakeHealthAlertResolutionReason };
