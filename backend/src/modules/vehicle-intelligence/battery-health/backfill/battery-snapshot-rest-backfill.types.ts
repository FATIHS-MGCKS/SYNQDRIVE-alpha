import type { BatteryMeasurementQuality } from '@prisma/client';

export const BATTERY_SNAPSHOT_REST_BACKFILL_VERSION =
  'battery-snapshot-rest-backfill-2026-07-v1';

export const DEFAULT_BATTERY_SNAPSHOT_REST_BACKFILL_DAYS = 60;

export interface SnapshotRestBackfillCandidate {
  snapshotId: string;
  vehicleId: string;
  organizationId: string;
  observedAt: Date;
  voltageV: number;
  restingVoltage: number | null;
  engineRunning: boolean;
  temperatureC: number | null;
  createdAt: Date;
}

export interface SnapshotRestBackfillClassification {
  quality: BatteryMeasurementQuality;
  reasonCode: string;
  reasonLabel: string;
  evidenceEligible: boolean;
  voltage: number;
  wakeFlank: boolean;
  skipped: boolean;
  skipReason?: string;
}

export interface SnapshotRestBackfillPlanItem {
  snapshotId: string;
  vehicleId: string;
  organizationId: string;
  observedAt: string;
  voltage: number;
  quality: BatteryMeasurementQuality;
  reasonCode: string;
  reasonLabel: string;
  evidenceEligible: boolean;
  idempotencyKey: string;
  action: 'CREATE' | 'SKIP_EXISTS' | 'SKIP_INELIGIBLE';
  skipReason?: string;
}

export interface SnapshotRestBackfillPlan {
  version: string;
  dryRun: boolean;
  lookbackDays: number;
  from: string;
  to: string;
  organizationId?: string;
  vehicleId?: string;
  candidatesScanned: number;
  plannedCreates: number;
  skippedExisting: number;
  skippedIneligible: number;
  byQuality: Record<string, number>;
  affectedVehicleIds: string[];
  items: SnapshotRestBackfillPlanItem[];
}

export interface SnapshotRestBackfillApplyResult {
  dryRun: boolean;
  measurementsCreated: number;
  measurementsSkipped: number;
  measurementsFailed: number;
  assessmentsReplayed: number;
  assessmentsSkipped: number;
  publicationsReplayed: number;
  publicationsSkipped: number;
  errors: string[];
  vehicleResults: Array<{
    vehicleId: string;
    organizationId: string;
    measurementsCreated: number;
    assessmentOk: boolean;
    assessmentIds: string[];
    publicationPersisted: boolean;
    publicationMaturity?: string;
  }>;
}

export interface SnapshotRestBackfillRunOptions {
  organizationId?: string;
  vehicleId?: string;
  days?: number;
  apply?: boolean;
  batchSize?: number;
  replayAssessment?: boolean;
  enablePublicationReplay?: boolean;
  operator?: string;
  reason?: string;
  purgeBackfillMeasurements?: boolean;
}
