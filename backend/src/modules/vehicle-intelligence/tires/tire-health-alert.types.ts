import type { TireAlertCode, TireDisplayMode } from './tire-status';
import type { TireHealthAlertResolutionReason } from '@prisma/client';

/** Internal alert type keys — stable across API and persistence. */
export const TIRE_HEALTH_ALERT_TYPES = [
  'CRITICAL_TREAD',
  'LOW_TREAD',
  'CRITICAL_REMAINING_KM',
  'LOW_REMAINING_KM',
  'UNEVEN_WEAR_CRITICAL',
  'UNEVEN_WEAR_ATTENTION',
  'AXLE_WEAR_IMBALANCE',
  'ROTATION_OVERDUE',
  'ROTATION_RECOMMENDED',
  'PRESSURE_IMPACT',
  'TPMS_WARNING',
  'SEASON_MISMATCH',
  'MEASUREMENT_OVERDUE',
  'TIRE_AGE_WARNING',
  'USED_TIRE_NO_MEASUREMENT',
  'LOW_CONFIDENCE',
  'ODOMETER_ANCHOR_REQUIRED',
] as const;

export type TireHealthAlertType = (typeof TIRE_HEALTH_ALERT_TYPES)[number];

/** Structured reason codes — replace regex / free-text business logic. */
export const TIRE_HEALTH_ALERT_REASON_CODES = [
  'TREAD_CRITICAL_MEASURED',
  'TREAD_CRITICAL_ESTIMATED',
  'TREAD_LOW_MEASURED',
  'TREAD_LOW_ESTIMATED',
  'REMAINING_KM_CRITICAL',
  'REMAINING_KM_LOW',
  'WEAR_UNEVEN_CRITICAL',
  'WEAR_UNEVEN_WARNING',
  'AXLE_WEAR_IMBALANCE',
  'ROTATION_OVERDUE',
  'ROTATION_RECOMMENDED',
  'PRESSURE_UNDERINFLATION_IMPACT',
  'TPMS_WARNING_ACTIVE',
  'SEASON_MISMATCH_WINTER',
  'SEASON_MISMATCH_SUMMER',
  'MEASUREMENT_OVERDUE',
  'TIRE_AGE_REPLACE',
  'TIRE_AGE_INSPECT',
  'USED_TIRE_NO_MEASUREMENT',
  'LOW_CONFIDENCE_ESTIMATE',
  'ODOMETER_ANCHOR_REQUIRED',
] as const;

export type TireHealthAlertReasonCode =
  (typeof TIRE_HEALTH_ALERT_REASON_CODES)[number];

export type TireAlertSeverity = 'info' | 'warning' | 'critical';

export interface TireAlertPressureContext {
  sourceLabel: string | null;
  sourceTimestamp: string | null;
  freshness: string;
  tpmsWarning: boolean | null;
}

export interface StructuredTireAlertCandidate {
  alertType: TireHealthAlertType;
  reasonCode: TireHealthAlertReasonCode;
  code: TireAlertCode;
  severity: TireAlertSeverity;
  displayMode: TireDisplayMode;
  wheelPosition?: string | null;
  value?: number | null;
  evidenceFingerprint: string;
  dedupeKey: string;
  templateParams: Record<string, string | number | null>;
  pressureContext?: TireAlertPressureContext | null;
  notifyEligible: boolean;
}

export interface TireAlertSyncResult {
  openAlerts: StructuredTireAlertCandidate[];
  newlyOpened: string[];
  resolved: string[];
  notificationsToEmit: StructuredTireAlertCandidate[];
}

export interface PersistedTireAlertRow {
  id: string;
  alertType: string;
  reasonCode: string;
  severity: string;
  wheelPosition: string | null;
  displayMode: string;
  dedupeKey: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionReason: TireHealthAlertResolutionReason | null;
  templateParamsJson: Record<string, unknown> | null;
}

export { TireHealthAlertResolutionReason };
