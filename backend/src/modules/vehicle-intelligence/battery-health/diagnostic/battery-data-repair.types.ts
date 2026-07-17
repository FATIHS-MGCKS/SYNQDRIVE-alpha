import type { BatteryDiagnosticReport } from './battery-data-diagnostic.types';

export const BATTERY_DATA_REPAIR_SCRIPT_VERSION = '1.0.0';

export const BATTERY_REPAIR_METADATA_KEY = 'batteryDataRepair';

export type BatteryRepairActionId =
  | 'reclassify_lv_soh_percent_evidence'
  | 'mark_rest_measurement_unverified'
  | 'reset_unsafe_publication'
  | 'clear_crank_readiness_fields'
  | 'dedupe_hv_snapshots'
  | 'mark_reference_capacity_unverified';

export interface BatteryRepairRunOptions {
  organizationId?: string;
  vehicleId?: string;
  /** When false (default), only plan repairs without writes. */
  apply?: boolean;
  batchSize?: number;
  referenceNow?: Date;
}

export interface BatteryRepairAction {
  actionId: BatteryRepairActionId;
  organizationId: string;
  vehicleId: string;
  entityType:
    | 'battery_evidence'
    | 'battery_measurement'
    | 'battery_publication'
    | 'battery_features'
    | 'hv_battery_health_snapshot'
    | 'vehicle_battery_reference_capacity';
  entityId: string;
  description: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  applied: boolean;
  diagnosticCheckId?: string;
}

export interface BatteryRepairUnresolved {
  organizationId: string;
  vehicleId: string;
  rule: string;
  reason: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface BatteryRepairSkipped {
  organizationId: string;
  vehicleId?: string;
  rule: string;
  reason: string;
  entityId?: string;
}

export interface BatteryRepairAuditLogEntry {
  at: string;
  level: 'info' | 'action' | 'skip' | 'error';
  message: string;
  actionId?: BatteryRepairActionId;
  vehicleId?: string;
  entityId?: string;
}

export interface BatteryRepairReport {
  mode: 'repair';
  dryRun: boolean;
  apply: boolean;
  scriptVersion: string;
  generatedAt: string;
  organizationId: string | null;
  vehicleId: string | null;
  organizationCount: number;
  vehiclesScanned: number;
  summary: {
    planned: number;
    applied: number;
    skipped: number;
    unresolved: number;
    errors: number;
    byAction: Partial<Record<BatteryRepairActionId, number>>;
  };
  actions: BatteryRepairAction[];
  unresolved: BatteryRepairUnresolved[];
  skipped: BatteryRepairSkipped[];
  auditLog: BatteryRepairAuditLogEntry[];
  diagnosticBefore: BatteryDiagnosticReport;
  diagnosticAfter?: BatteryDiagnosticReport;
}

export interface BatteryRepairMetadata {
  scriptVersion: string;
  actionId: BatteryRepairActionId;
  appliedAt: string;
  reclassifiedAs?: string;
  verificationStatus?: string;
  superseded?: boolean;
}
