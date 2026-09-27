import type {
  EvidenceAvailability,
  NormalizedPositionObservation,
  TelemetrySourceFamily,
  TemporalConfidence,
} from '../core/types';
import type { DiV0PositionQuerySpecification } from './di-v0-position-acquisition.versions';

/**
 * Internal-only acquisition request. `dimoDeviceIdentity` is the stored DIMO identity
 * (`DimoVehicle.rawJson`); `Vehicle.hardwareType` is intentionally not accepted.
 */
export interface DiV0PositionAcquisitionRequest {
  organizationId: string;
  vehicleId: string;
  tripId?: string | null;
  dimoTokenId: number;
  dimoDeviceIdentity: unknown;
  /** UTC instant, `Z` suffix, whole second (inclusive grid start). */
  fromUtc: string;
  /** UTC instant, `Z` suffix, whole second (exclusive grid end). */
  toUtc: string;
}

export interface DiV0PositionAcquisitionOptions {
  maxWindowSeconds?: number;
  now?: () => Date;
}

export interface DiV0ValidatedPositionWindow {
  fromUtc: string;
  toUtc: string;
  fromMs: number;
  toMs: number;
  expectedBucketCount: number;
  boundary: DiV0PositionQuerySpecification['gridBoundary'];
}

export type DiV0CoordinateStatus =
  | 'VALID'
  | 'NOT_APPLICABLE'
  | 'FIELD_MISSING'
  | 'MALFORMED_VALUE'
  | 'MISSING_LATITUDE'
  | 'MISSING_LONGITUDE'
  | 'NON_NUMERIC'
  | 'NON_FINITE'
  | 'LATITUDE_OUT_OF_RANGE'
  | 'LONGITUDE_OUT_OF_RANGE'
  | 'CONFLICTING_DUPLICATE';

export type DiV0BucketAnomaly =
  | 'DUPLICATE_BUCKET_IDENTICAL'
  | 'DUPLICATE_BUCKET_CONFLICTING'
  | 'INVALID_COORDINATE';

export type DiV0RejectedRowReason =
  | 'ROW_NOT_OBJECT'
  | 'LABEL_MISSING'
  | 'LABEL_UNPARSEABLE'
  | 'LABEL_NOT_SECOND_ALIGNED'
  | 'LABEL_OUTSIDE_WINDOW';

export interface DiV0RejectedProviderRow {
  reason: DiV0RejectedRowReason;
  /** Provider label as returned (never a coordinate). */
  rawLabel: string | null;
}

export type DiV0AcquisitionQualityFlag =
  | 'NO_PROVIDER_ROWS'
  | 'PROVIDER_SIGNALS_NULL'
  | 'PROVIDER_ROWS_REJECTED'
  | 'ROWS_OUTSIDE_WINDOW'
  | 'DUPLICATE_BUCKETS_PRESENT'
  | 'CONFLICTING_DUPLICATE_BUCKETS'
  | 'INVALID_COORDINATES_PRESENT';

export interface DiV0AcquiredPositionBucket {
  /** Canonical query-bucket label (bucket start). Not a physical source timestamp. */
  bucketLabel: string;
  availability: EvidenceAvailability;
  coordinateStatus: DiV0CoordinateStatus;
  temporalConfidence: TemporalConfidence;
  /** Provider rows matched to this bucket (0 for ROW_ABSENT, >1 for duplicates). */
  providerRowCount: number;
  anomalies: DiV0BucketAnomaly[];
  /** Pre-classification S1 input; hold/release/FRESH assignment remains in S1. */
  observation: NormalizedPositionObservation;
}

/** Future-safe structured counters (no runtime metrics emitted in S3A). */
export interface DiV0PositionAcquisitionCounters {
  requestedBuckets: number;
  providerRows: number;
  matchedProviderRows: number;
  rejectedProviderRows: number;
  outsideWindowRows: number;
  present: number;
  presentUsable: number;
  signalNull: number;
  rowAbsent: number;
  invalidCoordinate: number;
  duplicateBuckets: number;
  duplicateIdenticalBuckets: number;
  duplicateConflictingBuckets: number;
}

export interface DiV0SourceFamilyResolution {
  sourceFamily: TelemetrySourceFamily;
  policyVersion: string;
  evidence: 'DIMO_DEVICE_IDENTITY';
  /** Mirrors the canonical containment helper; UNKNOWN never inherits R1 semantics. */
  historicalObdRecordTimeUncertain: boolean;
  /** S1 abstains for UNKNOWN (`UNSUPPORTED_SOURCE_FAMILY`); evidence is still normalized. */
  s1Supported: boolean;
}

export interface DiV0PositionSnapshotIdentity {
  version: string;
  algorithm: 'sha256';
  digest: string;
  /** Value for S2 `DiV0ShadowRunIdentity.inputEvidenceVersion`. */
  inputEvidenceVersion: string;
}

export interface DiV0PositionAcquisitionProvenance {
  provider: 'DIMO';
  queryFamily: DiV0PositionQuerySpecification['queryFamily'];
  querySpecificationId: DiV0PositionQuerySpecification['id'];
  interval: DiV0PositionQuerySpecification['interval'];
  coordinateAggregation: DiV0PositionQuerySpecification['coordinateAggregation'];
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  dimoTokenId: number;
  requestedFromUtc: string;
  requestedToUtc: string;
  sourceFamilyPolicyVersion: string;
  adapterVersion: string;
  /** Wall-clock acquisition time; excluded from snapshot identity. */
  acquiredAtUtc: string;
}

export interface DiV0PositionAcquisitionResult {
  sourceFamily: TelemetrySourceFamily;
  sourceFamilyResolution: DiV0SourceFamilyResolution;
  requestedWindow: DiV0ValidatedPositionWindow;
  querySpecification: DiV0PositionQuerySpecification;
  expectedBucketCount: number;
  providerRowCount: number;
  presentCount: number;
  signalNullCount: number;
  rowAbsentCount: number;
  duplicateBucketCount: number;
  invalidCoordinateCount: number;
  counters: DiV0PositionAcquisitionCounters;
  qualityFlags: DiV0AcquisitionQualityFlag[];
  rejectedProviderRows: DiV0RejectedProviderRow[];
  buckets: DiV0AcquiredPositionBucket[];
  observations: NormalizedPositionObservation[];
  snapshotIdentity: DiV0PositionSnapshotIdentity;
  acquisitionProvenance: DiV0PositionAcquisitionProvenance;
}

export type DiV0PositionAcquisitionFailureClass =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_BUDGET_UNAVAILABLE'
  | 'GRAPHQL_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN';

export interface DiV0PositionAcquisitionFailure {
  failureClass: DiV0PositionAcquisitionFailureClass;
  /** Hint for a future worker; S3A itself never retries (transport already bounds transient retries). */
  retryable: boolean;
  httpStatus: number | null;
  /** Redacted; never contains tokens, authorization headers, or coordinates. */
  safeMessage: string;
}

export type DiV0PositionAcquisitionOutcome =
  | { status: 'ACQUIRED'; result: DiV0PositionAcquisitionResult }
  | { status: 'FAILED'; failure: DiV0PositionAcquisitionFailure };

export interface DiV0HistoricalPositionQueryInput {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number;
  query: string;
}

/** Transport port. Returns the raw GraphQL response body (`{ data, errors }`). */
export interface DiV0HistoricalPositionTransport {
  executeHistoricalPositionQuery(input: DiV0HistoricalPositionQueryInput): Promise<unknown>;
}
