import type { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import type {
  HfCalibrationPhaseRuntimeCounters,
  HfCalibrationSeriesState,
} from './reference-capture-hf-calibration-phase.policy';

export type ReferenceCaptureTemporalClass =
  | 'WAVEFORM_DYNAMICS'
  | 'POWERTRAIN_DYNAMIC'
  | 'SPATIAL_ROUTE'
  | 'SLOW_PHYSICAL_CONTEXT'
  | 'HEALTH_DIAGNOSTIC'
  | 'EVENT'
  | 'SESSION_METADATA';

export type ReferenceCaptureCapabilityState =
  | 'SCHEMA_SUPPORTED'
  | 'LISTED_AVAILABLE'
  | 'OBSERVED_NON_NULL'
  | 'LISTED_BUT_NULL'
  | 'DIRECT_PROBE_SUPPORTED'
  | 'DIRECT_PROBE_NULL'
  | 'NOT_AVAILABLE_ON_VEHICLE'
  | 'UNKNOWN';

export type BroadObservationFieldDescriptor = {
  providerField: string;
  canonicalKey: string | null;
  rawIdentity: string;
  temporalClass: ReferenceCaptureTemporalClass;
  acquisitionTier: string;
  capabilityState: ReferenceCaptureCapabilityState;
};

export type ReferenceCapturePreflightResult = {
  availableSignals: string[];
  broadObservationFields: BroadObservationFieldDescriptor[];
  broadObservationFieldCount: number;
  manifestId: string;
  manifestVersion: string;
  connectionProfile: string;
  powertrainProfile: string | null;
  hardwareProfile: string | null;
  checkedAt: string;
};

export type VehicleMassBinding = {
  baseVehicleMassKg: number | null;
  massSource: 'MANUFACTURER_CURB_WEIGHT' | 'UNKNOWN';
  massConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  optionalSessionPayloadKg: number | null;
  effectiveMassKg: number | null;
  frontWeightDistributionPct: number | null;
  limitationNote: string;
};

export type ReferenceCaptureObservationEnvelope = {
  envelopeVersion: string;
  observationKind: ReferenceCaptureObservationKind;
  provider: string;
  connectionProfile: string;
  powertrainProfile?: string | null;
  providerField?: string | null;
  canonicalKey?: string | null;
  rawIdentity: string;
  acquisitionSurface?: string | null;
  acquisitionTier?: string | null;
  temporalClass?: string | null;
  rawValue: unknown;
  rawUnit?: string | null;
  normalizedValue?: unknown;
  normalizedUnit?: string | null;
  providerTimestamp?: Date | string | null;
  synqReceivedAt: Date | string;
  acquisitionRequestedAt?: Date | string | null;
  httpRequestStartedAt?: Date | string | null;
  httpResponseReceivedAt?: Date | string | null;
  requestStartedAt?: Date | string | null;
  requestCompletedAt?: Date | string | null;
  processingCompletedAt?: Date | string | null;
  requestCorrelationId?: string | null;
  captureCycleId?: string | null;
  sequenceNumber?: number | null;
  capabilityState?: string | null;
  providerEventFingerprint?: string | null;
  physicalSampleFingerprint?: string | null;
  provenance?: Record<string, unknown> | null;
};

export type CreateReferenceCaptureSessionInput = {
  organizationId: string;
  vehicleId: string;
  connectionProfile?: string;
  groundTruthVideoRef?: string | null;
};

export type ReferenceCaptureOperationalSnapshot = {
  cycleCount: number;
  runnerJobId: string | null;
  pendingCycleJobId: string | null;
  preflightAssessedAt: string | null;
  activeCycleJobId: string | null;
};

export type ReferenceCaptureSessionView = {
  id: string;
  organizationId: string;
  vehicleId: string;
  connectionProfile: string;
  powertrainProfile: string | null;
  hardwareProfile: string | null;
  manifestId: string;
  manifestVersion: string;
  status: ReferenceCaptureSessionStatus;
  recorderSoftwareVersion: string | null;
  broadObservationFieldCount: number | null;
  massBinding: VehicleMassBinding | null;
  preflight: ReferenceCapturePreflightResult | null;
  readiness: ReferenceCaptureReadinessReport | null;
  failureReason: string | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  operational?: ReferenceCaptureOperationalSnapshot;
};

export type ReferenceCaptureAcquisitionState = {
  cycleCount: number;
  lastCycleAt: string | null;
  /** Global HF DATA watermark — max(per-field) provider bucket time after durable persist. */
  hfWatermarkAt: string | null;
  /** Per-field DATA watermark: highest durable provider bucket timestamp represented. */
  hfWatermarkByField?: Record<string, string>;
  /** Per-field QUERY COVERAGE: highest query-to boundary successfully queried. */
  hfQueryCoverageByField?: Record<string, string>;
  /** HF physical identity algorithm version — do not mix V1/V2 in one session state cache. */
  hfPhysicalIdentityVersion?: 'LEGACY_VALUE_V1' | 'AGGREGATE_BUCKET_V2';
  eventWatermarkAt: string | null;
  seenEventFingerprints: string[];
  /** In-memory HF dedup cache only — DATABASE is idempotency authority. */
  seenPhysicalSampleFingerprints?: string[];
  /** DI-EV-0035C — bounded ring of HF query provenance (incl. zero-result windows). */
  hfQueryProvenanceRing?: Array<Record<string, unknown>>;
  /** DI-EV-0035C — per-field recovery sweep cursor (separate from DATA/QUERY watermarks). */
  hfRecoveryCursorByField?: Record<string, string>;
  lastRecoverySweepAt?: string | null;
  recoverySweepCount?: number;
  /** DI-EV-0035C.1 — last successful HF_HISTORICAL provider poll (V2 block cadence). */
  lastHfHistoricalPollAt?: string | null;
  /** DI-EV-0035C.1c — in-session multi-cadence calibration series (Reference Capture only). */
  hfCalibrationSeries?: HfCalibrationSeriesState | null;
  /** DI-EV-0035C.1d — per-active-phase runtime counters (merged into durable summary at boundary). */
  hfCalibrationActiveCounters?: HfCalibrationPhaseRuntimeCounters | null;
  /** DI-EV-0035C.1d — optimistic concurrency for acquisition-state writes. */
  acquisitionStateVersion?: number;
  lastSequenceNumber?: number;
  activeCycleJobId?: string | null;
  quarantinedProviderFields?: string[];
  consecutiveTransientFailures?: number;
  lastFailureClass?: string | null;
  lastFailureAt?: string | null;
};

export type ReferenceCaptureReadinessReport = {
  /** Code/runtime infrastructure ready for deployment preflight (not a real vehicle drive). */
  deploymentPreflightReady: boolean;
  /** Requires post-deploy vehicle canary — never true from code alone. */
  referenceDriveReady: boolean;
  blockers: string[];
  warnings: string[];
  checks: Record<string, boolean>;
  assessedAt: string;
};

export type ReferenceCaptureRetentionPolicy = {
  retentionDays: number;
  justification: string;
  estimatedLogicalBytesPerObservation: number;
  estimatedPostgresBytesPerObservation: number;
  estimatedObservationsPerMinutePerSignal: number;
  estimatedLogicalBytesPerHourBroadCapture: number;
  estimatedPostgresBytesPerHourBroadCapture: number;
  retentionPurgeMechanism: string;
  retentionIndexStrategy: string;
};

export type ReferenceCaptureStressEstimate = {
  observationsPerMinute: number;
  observationsPerHour: number;
  estimatedLogicalBytesPerHour: number;
  estimatedPostgresBytesPerHour: number;
  batchSize: number;
  maxPendingObservations: number;
  backpressureStrategy: string;
};

export type ManifestCanonicalSignal = {
  canonicalKey: string;
  providerField: string;
  providerUnit?: string;
  canonicalUnit?: string;
  captureClass?: string;
  acquisitionTiers?: string[];
};

export type FrozenReferenceManifest = {
  manifestId: string;
  manifestVersion: string;
  connectionProfile: string;
  hardwareProfile: string;
  canonicalSignals: ManifestCanonicalSignal[];
  temporalAcquisitionClasses?: {
    classes?: Record<string, { examples?: string[] }>;
  };
};

export type ReferenceCaptureValidationIssue = {
  code: string;
  message: string;
};

export type ReferenceCaptureValidationResult =
  | { ok: true }
  | { ok: false; issues: ReferenceCaptureValidationIssue[] };

export type NormalizedReferenceCaptureObservation = ReferenceCaptureObservationEnvelope & {
  sessionId: string;
  organizationId: string;
  vehicleId: string;
};
