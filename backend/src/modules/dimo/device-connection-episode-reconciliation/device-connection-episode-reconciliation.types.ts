import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { DeviceConnectionEpisodeResolutionMethod } from '@prisma/client';

export const RECONCILIATION_AUDIT_ID = 'device-connection-episode-reconciliation-2026-07';

export type EpisodeReconciliationClassification =
  | 'OPEN_CONFIRMED'
  | 'RESOLVED_EXPLICIT'
  | 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL'
  | 'SHOULD_RESOLVE_BY_TELEMETRY'
  | 'SUPERSEDED_BY_BINDING_CHANGE'
  | 'OUT_OF_ORDER'
  | 'DUPLICATE'
  | 'CONFLICTING_DATA'
  | 'NOT_ENOUGH_DATA';

export type BindingClass =
  | 'PHYSICAL_OBD_LTE_R1'
  | 'PHYSICAL_OBD_AFTERMARKET'
  | 'SYNTHETIC_ONLY'
  | 'OEM_API'
  | 'UNKNOWN';

export type ReconciliationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ReconciliationEventInput {
  id: string;
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
  receivedAt: Date;
  tokenId: number;
  dedupBucket: bigint;
  providerEventIdPresent: boolean;
  providerEventIdConflict: boolean;
}

export interface ReconciliationBindingInput {
  id: string;
  provider: string;
  sourceType: string;
  sourceSubtype: string | null;
  isActive: boolean;
  activatedAt: Date;
  deactivatedAt: Date | null;
  sourceReferenceId: string;
}

export interface ReconciliationSnapshotInput {
  observedAt: Date | null;
  receivedAt: Date | null;
  source: string | null;
  obdIsPluggedIn: boolean | null;
  sameBindingAsEpisode: boolean | null;
}

export interface ReconciliationTelemetryInput {
  firstAfterUnplugAt: Date | null;
  lastSeenAt: Date | null;
  sustainedAfterUnplug: boolean;
}

export interface ReconciliationTripInput {
  firstTripStartAfterUnplug: Date | null;
  tripCountAfterUnplug: number;
}

export interface ReconciliationAlertInput {
  openDeviceUnplugAlert: boolean;
  openDeviceReconnectAlert: boolean;
}

export interface ReconciliationVehicleInput {
  vehicleId: string;
  anonymizedVehicleId: string;
  provider: string;
  hardwareType: string | null;
  dimoConnectionStatus: DimoConnectionStatus | null;
  bindings: ReconciliationBindingInput[];
  events: ReconciliationEventInput[];
  snapshot: ReconciliationSnapshotInput;
  telemetry: ReconciliationTelemetryInput;
  trips: ReconciliationTripInput;
  alerts: ReconciliationAlertInput;
  persistedOpenEpisode: boolean;
}

export interface EpisodeReconciliationCandidate {
  anonymizedVehicleId: string;
  provider: string;
  bindingClass: BindingClass;
  openedAt: string;
  latestEventAt: string | null;
  firstTelemetryAfterUnplug: string | null;
  explicitPlugSignal: boolean;
  sustainedTelemetry: boolean;
  tripAfterUnplug: boolean;
  classification: EpisodeReconciliationClassification;
  recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  confidence: ReconciliationConfidence;
  conflicts: string[];
  applyEligible: boolean;
  reviewRequired: boolean;
  notes: string[];
}

export interface EpisodeReconciliationReport {
  auditId: string;
  generatedAt: string;
  mode: 'READ_ONLY';
  organizationScope: string | null;
  vehicleScope: string | null;
  summary: {
    totalCandidates: number;
    byClassification: Record<EpisodeReconciliationClassification, number>;
    applyEligibleCount: number;
    reviewRequiredCount: number;
  };
  candidates: EpisodeReconciliationCandidate[];
}
