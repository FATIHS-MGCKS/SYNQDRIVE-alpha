import type { DeviceConnectionEpisodeResolutionMethod } from '@prisma/client';
import type {
  EpisodeReconciliationClassification,
  ReconciliationConfidence,
} from './device-connection-episode-reconciliation.types';
import type { HistoricalEvidenceSourceType } from './device-connection-episode-reconciliation-historical.types';

export type RecoveryEvidenceType =
  | 'explicit_plug'
  | 'snapshot_signal'
  | 'telemetry_resumed'
  | 'binding_change';

export interface EpisodeReconciliationOperationalSignalSummary {
  sustained: boolean;
  sampleCountAfterUnplug: number;
  hasOperationalSignal: boolean;
  providerConnectionStatus: string | null;
}

export interface EpisodeReconciliationTripEvidenceSummary {
  tripCountAfterUnplug: number;
  firstTripAfterUnplug: string | null;
}

export interface EpisodeReconciliationBindingEvidenceSummary {
  bindingIdAtUnplug: string | null;
  bindingChangedInWindow: boolean;
  tokenIdAtUnplug: number;
}

/** Deterministic, secret-free evidence frozen at audit time for controlled apply. */
export interface EpisodeReconciliationEvidencePackage {
  episodeId: string;
  organizationId: string;
  vehicleId: string;
  provider: string;
  deviceBindingId: string | null;
  hardwareType: string | null;
  unplugEventId: string;
  plugEventId: string | null;
  unplugObservedAt: string;
  unplugReceivedAt: string;
  recoveryEvidenceType: RecoveryEvidenceType;
  relevantSnapshotIds: string[];
  resolutionSnapshotId: string;
  providerObservedAt: string;
  receivedAt: string;
  processedAt: string | null;
  sourceType: HistoricalEvidenceSourceType | 'explicit_plug_event';
  obdIsPluggedIn: boolean | null;
  operationalSignalSummary: EpisodeReconciliationOperationalSignalSummary;
  tripEvidence: EpisodeReconciliationTripEvidenceSummary;
  bindingEvidence: EpisodeReconciliationBindingEvidenceSummary;
  classification: EpisodeReconciliationClassification;
  confidence: ReconciliationConfidence;
  recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  auditWaterlineAt: string;
  generatedAt: string;
  codeVersion: string;
  evidenceHash: string;
}

export type EvidencePackageValidationFailureReason =
  | 'hash_mismatch'
  | 'code_version_mismatch'
  | 'episode_not_open'
  | 'episode_not_found'
  | 'episode_binding_changed'
  | 'episode_opened_at_mismatch'
  | 'cross_tenant_mismatch'
  | 'newer_event_after_audit'
  | 'not_auto_applicable'
  | 'missing_plug_event'
  | 'already_resolved';

export interface EvidencePackageValidationResult {
  valid: boolean;
  reason?: EvidencePackageValidationFailureReason;
  detail?: string;
}
