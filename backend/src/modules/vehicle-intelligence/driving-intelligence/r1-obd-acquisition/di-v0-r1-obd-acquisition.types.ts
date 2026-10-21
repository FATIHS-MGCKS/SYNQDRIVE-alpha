import type { NormalizedR1ObdObservation, TelemetrySourceFamily } from '../core/types';
import type {
  DiV0SourceFamilyResolution,
  DiV0ValidatedPositionWindow,
} from '../position-acquisition/di-v0-position-acquisition.types';
import type { DiV0ValidatedPositionRequest } from '../position-acquisition/di-v0-position-window';
import type { DiV0R1ObdQuerySpecification } from './di-v0-r1-obd-acquisition.versions';

/** Distinct from core `EvidenceAvailability.PRESENT` — task vocabulary alias documented in S3B contract. */
/**
 * `CONFLICTING_DUPLICATE`: several provider rows share one bucket label and disagree on this
 * signal. The value is withheld (no first-row-wins, no averaging); the distinct observed values
 * are preserved in `conflictingValues` for provenance.
 */
export type DiV0R1SignalAvailability = 'VALUE_PRESENT' | 'SIGNAL_NULL' | 'ROW_ABSENT' | 'CONFLICTING_DUPLICATE';

export type DiV0R1ObdQualityFlag =
  | 'NO_PROVIDER_ROWS'
  | 'PROVIDER_SIGNALS_NULL'
  | 'SPARSE_SIGNAL'
  | 'LONG_GAP'
  | 'APPARENT_STALE_SEQUENCE'
  | 'APPARENT_BACKLOG'
  | 'TEMPORAL_UNCERTAINTY'
  | 'UNSUPPORTED_SOURCE_FAMILY'
  | 'DUPLICATE_BUCKET_IDENTICAL'
  | 'DUPLICATE_BUCKET_CONFLICTING';

export interface DiV0R1ObdScalarSignal<T = number> {
  signal: DiV0R1ObdQuerySpecification['signals'][number]['id'];
  unit: string;
  availability: DiV0R1SignalAvailability;
  value: T | null;
  /** Present only for `CONFLICTING_DUPLICATE`; sorted distinct values (`null` = row carried no usable value). */
  conflictingValues?: (T | null)[];
}

export interface DiV0R1ObdAcquiredBucket {
  bucketLabel: string;
  rowAvailability: 'ROW_PRESENT' | 'ROW_ABSENT';
  /** Number of in-window provider rows mapped to this label (0 when ROW_ABSENT). */
  providerRowCount: number;
  temporalSemantics: 'INTERVAL_ONLY';
  signals: DiV0R1ObdScalarSignal[];
  qualityFlags: DiV0R1ObdQualityFlag[];
}

export interface DiV0R1ObdSnapshotIdentity {
  version: string;
  algorithm: 'sha256';
  digest: string;
  inputEvidenceVersion: string;
}

export interface DiV0R1ObdAcquisitionRequest {
  organizationId: string;
  vehicleId: string;
  tripId?: string | null;
  dimoTokenId: number;
  dimoDeviceIdentity: unknown;
  fromUtc: string;
  toUtc: string;
}

export interface DiV0R1ObdAcquisitionOptions {
  maxWindowSeconds?: number;
  now?: () => Date;
  /** Labels between present speed rows above this gap (seconds) receive LONG_GAP. */
  longGapThresholdSeconds?: number;
}

export type DiV0ValidatedR1ObdRequest = DiV0ValidatedPositionRequest;

export interface DiV0R1ObdAcquisitionCounters {
  requestedBuckets: number;
  providerRows: number;
  rowAbsent: number;
  rowPresent: number;
  speedValuePresent: number;
  duplicateBuckets: number;
  conflictingDuplicateBuckets: number;
}

export interface DiV0R1ObdAcquisitionResult {
  adapterVersion: string;
  querySpecId: DiV0R1ObdQuerySpecification['id'];
  sourceFamily: TelemetrySourceFamily;
  sourceFamilyResolution: DiV0SourceFamilyResolution;
  window: DiV0ValidatedPositionWindow;
  buckets: DiV0R1ObdAcquiredBucket[];
  observations: NormalizedR1ObdObservation[];
  qualityFlags: DiV0R1ObdQualityFlag[];
  counters: DiV0R1ObdAcquisitionCounters;
  snapshotIdentity: DiV0R1ObdSnapshotIdentity;
  /** Explicit contract marker — no fixed timing offsets in normalization. */
  fixedTimeCorrectionApplied: false;
}

export type DiV0R1ObdAcquisitionFailureCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_SOURCE_FAMILY'
  | 'AUTHORIZATION'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'GRAPHQL_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'VEHICLE_JWT_UNAVAILABLE';

export interface DiV0R1ObdAcquisitionFailure {
  code: DiV0R1ObdAcquisitionFailureCode;
  retryable: boolean;
  message: string;
}

export type DiV0R1ObdAcquisitionOutcome =
  | { status: 'ACQUIRED'; result: DiV0R1ObdAcquisitionResult }
  | { status: 'FAILED'; failure: DiV0R1ObdAcquisitionFailure };

export interface DiV0HistoricalR1ObdQueryInput {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number;
  query: string;
}

export interface DiV0HistoricalR1ObdTransport {
  executeHistoricalR1ObdQuery(input: DiV0HistoricalR1ObdQueryInput): Promise<unknown>;
}

/** Channel A evidence bundle — never merged with native events at this layer. */
export interface R1ObdEvidence {
  channel: 'R1_HISTORICAL_OBD';
  result: DiV0R1ObdAcquisitionResult;
}
