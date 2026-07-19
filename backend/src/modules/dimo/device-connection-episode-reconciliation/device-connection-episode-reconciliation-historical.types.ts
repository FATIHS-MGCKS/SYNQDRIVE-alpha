export type HistoricalEvidenceSourceType =
  | 'telemetry_recovery_observation'
  | 'dimo_poll_log'
  | 'clickhouse_telemetry_mirror'
  | 'resolution_audit'
  | 'vehicle_latest_state_only';

export interface HistoricalSnapshotSample {
  sourceType: HistoricalEvidenceSourceType;
  providerObservedAt: Date;
  receivedAt: Date;
  processedAt: Date | null;
  providerBindingId: string | null;
  sourceSubtype: string | null;
  obdIsPluggedIn: boolean | null;
  hasOperationalSignal: boolean;
  providerConnectionStatus: string | null;
  backfillLagMs: number;
  delayedSnapshot: boolean;
}

export interface HistoricalFirstSnapshotAfterUnplug {
  providerObservedAt: string;
  receivedAt: string;
  processedAt: string | null;
  sourceType: HistoricalEvidenceSourceType;
  obdIsPluggedIn: boolean | null;
  hasOperationalSignal: boolean;
  providerBindingId: string | null;
}

export interface EpisodeReconciliationApplyEvidence {
  kind: 'snapshot_signal' | 'telemetry_resumed' | 'explicit_plug' | 'binding_change';
  resolutionEvidenceAt: string;
  resolutionSnapshotId?: string;
  recoverySource: string;
  observationCount?: number;
  policyVariant?: string;
}

export interface EpisodeHistoricalEvidence {
  windowStart: string;
  windowEnd: string;
  unplugObservedAt: string;
  unplugReceivedAt: string;
  sampleCount: number;
  samplesAfterUnplug: number;
  firstSnapshotAfterUnplug: HistoricalFirstSnapshotAfterUnplug | null;
  cadenceMedianMs: number | null;
  longestGapMs: number | null;
  tripCountAfterUnplug: number;
  firstTripAfterUnplug: string | null;
  providerConnectionStatusAtEnd: string | null;
  tokenIdAtUnplug: number;
  tokenIdsAfterUnplug: number[];
  bindingIdAtUnplug: string | null;
  bindingChangedInWindow: boolean;
  latestStateOnlyEvidence: boolean;
  delayedSnapshotCount: number;
  backfillIndicator: boolean;
  sustainedTelemetryFromHistory: boolean;
  sourcesPresent: HistoricalEvidenceSourceType[];
  applyEvidence: EpisodeReconciliationApplyEvidence | null;
}

export interface ReconciliationVehicleHistoricalSources {
  pollLogs: Array<{
    id: string;
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
  }>;
  telemetryObservations: Array<{
    providerObservedAt: Date;
    receivedAt: Date;
    hasOperationalSignal: boolean;
    connectionStatusActive: boolean;
    providerBindingId: string | null;
    snapshotReferenceId: string;
  }>;
  resolutionAudits: Array<{
    providerObservedAt: Date;
    receivedAt: Date;
    resolutionSnapshotId: string;
    resolutionMethod: string;
    metadata: unknown;
  }>;
  clickhouseSnapshots: Array<{
    recordedAt: Date;
    hasOperationalSignal: boolean;
  }>;
  latestStateFallback: {
    providerObservedAt: Date | null;
    receivedAt: Date | null;
    processedAt: Date | null;
    sourceTimestamp: Date | null;
    providerFetchedAt: Date | null;
    providerBindingId: string | null;
    sourceSubtype: string | null;
    obdIsPluggedIn: boolean | null;
    dimoTokenId: number | null;
  } | null;
}
