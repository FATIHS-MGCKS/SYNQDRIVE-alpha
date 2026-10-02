import type {
  ClaimLevel,
  NativeEventObservation,
  TelemetrySourceFamily,
  TemporalConfidence,
} from '../core/types';

export type DiV0NativeNormalizedEventType =
  | 'HARSH_BRAKING'
  | 'HARSH_ACCELERATION'
  | 'EXTREME_BRAKING'
  | 'HARSH_CORNERING'
  | 'SPEEDING'
  | 'SAFETY_COLLISION'
  | 'UNKNOWN_NATIVE_EVENT';

/**
 * Ingested native event row shape, mirroring the provable relations of a persisted
 * `DrivingEvent` row (library-only — no Prisma import at call sites).
 *
 * Deliberately has NO calibration / claim field: native calibration authority is not
 * caller-suppliable. `providerTimestamp` maps from `DrivingEvent.recordedAt`.
 * `organizationId` is nullable on `DrivingEvent`; null cannot prove tenant membership.
 */
export interface DiV0NativeEventInputRecord {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId?: string | null;
  provider?: string | null;
  providerEventName: string;
  providerTimestamp: string | null;
  sourceFamily: TelemetrySourceFamily;
  providerFingerprint?: string | null;
  payloadRef?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

/**
 * Expected binding context, supplied independently of the rows.
 * `tripId: null` = not trip-scoped (trip relation not asserted).
 * `provider: null` = provider identity not asserted.
 * Window is inclusive on both ends: `windowStart <= providerTimestamp <= windowEnd`.
 */
export interface DiV0NativeEventExpectedContext {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  windowStart: string;
  windowEnd: string;
  sourceFamily: TelemetrySourceFamily;
  provider: string | null;
}

export type DiV0NativeEventSourceFailureCode = 'READ_THREW' | 'MALFORMED_READ_RESULT' | 'SOURCE_UNAVAILABLE';

/** What the (future S4) repository read produced — before any normalization. */
export type DiV0NativeEventSourceEnvelope =
  | { kind: 'SOURCE_SUCCESS'; records: DiV0NativeEventInputRecord[] }
  | { kind: 'SOURCE_FAILURE'; failureCode: DiV0NativeEventSourceFailureCode };

export type DiV0NativeEventSourceOutcome =
  | 'SOURCE_SUCCESS_WITH_EVENTS'
  | 'SOURCE_SUCCESS_NO_EVENTS'
  | 'SOURCE_FAILURE';

export type DiV0NativeEventContextMismatchReason =
  | 'ORGANIZATION_MISMATCH'
  | 'ORGANIZATION_UNPROVABLE'
  | 'VEHICLE_MISMATCH'
  | 'TRIP_MISMATCH'
  | 'TRIP_UNPROVABLE'
  | 'PROVIDER_MISMATCH'
  | 'PROVIDER_UNPROVABLE'
  | 'SOURCE_FAMILY_MISMATCH'
  | 'TIMESTAMP_MISSING'
  | 'TIMESTAMP_INVALID'
  | 'OUTSIDE_WINDOW';

export interface DiV0NativeEventContextMismatch {
  disposition: 'CONTEXT_MISMATCH';
  eventId: string;
  reasons: DiV0NativeEventContextMismatchReason[];
  maxClaimLevel: 'L0';
  observed: {
    organizationId: string | null;
    vehicleId: string;
    tripId: string | null;
    provider: string | null;
    sourceFamily: TelemetrySourceFamily;
    providerTimestamp: string | null;
  };
}

export type DiV0NativeEventDuplicateField =
  | 'organizationId'
  | 'vehicleId'
  | 'tripId'
  | 'provider'
  | 'providerEventName'
  | 'providerTimestamp'
  | 'sourceFamily'
  | 'providerFingerprint'
  | 'payloadRef'
  | 'metadataJson';

export interface DiV0NativeEventConflictingDuplicate {
  disposition: 'CONFLICTING_DUPLICATE';
  eventId: string;
  maxClaimLevel: 'L0';
  conflictingFields: DiV0NativeEventDuplicateField[];
  /** Sorted sha256 digests of each distinct variant's canonical form. */
  variantDigests: string[];
  inputRecordCount: number;
}

export interface DiV0NativeEventSnapshotIdentity {
  version: string;
  algorithm: 'sha256';
  digest: string;
  inputEvidenceVersion: string;
}

export interface DiV0NativeEventEvidenceItem {
  evidenceKind: typeof import('./di-v0-native-event-evidence.versions').DI_V0_NATIVE_EVENT_EVIDENCE_KIND;
  eventId: string;
  providerEventName: string;
  normalizedEventType: DiV0NativeNormalizedEventType;
  sourceFamily: TelemetrySourceFamily;
  providerTimestamp: string | null;
  temporalConfidence: TemporalConfidence;
  calibrationState: 'UNCALIBRATED';
  maxClaimLevel: ClaimLevel;
  observation: NativeEventObservation;
  qualityFlags: string[];
}

export type DiV0NativeEventEvidenceStatus =
  | 'EVENTS_PRESENT'
  | 'NO_EVENT'
  | 'NO_ACCEPTED_EVENT'
  | 'EVENT_SOURCE_FAILURE';

/** Channel state vocabulary shared with the combined input identity. */
export type DiV0NativeEventChannelState = 'PRESENT' | 'NO_EVENT' | 'SOURCE_FAILURE';

export interface DiV0NativeEventCounts {
  inputRecords: number;
  distinctEventIds: number;
  identicalDuplicatesCollapsed: number;
  accepted: number;
  contextMismatch: number;
  conflictingDuplicate: number;
}

export interface DiV0NativeEventEvidenceResult {
  adapterVersion: string;
  status: DiV0NativeEventEvidenceStatus;
  sourceOutcome: DiV0NativeEventSourceOutcome;
  sourceFailureCode: DiV0NativeEventSourceFailureCode | null;
  channelState: DiV0NativeEventChannelState;
  context: DiV0NativeEventExpectedContext;
  /** Accepted, context-bound, de-duplicated observations (UNCALIBRATED, max L1). */
  events: DiV0NativeEventEvidenceItem[];
  contextMismatches: DiV0NativeEventContextMismatch[];
  conflictingDuplicates: DiV0NativeEventConflictingDuplicate[];
  counts: DiV0NativeEventCounts;
  snapshotIdentity: DiV0NativeEventSnapshotIdentity;
}

/** Channel B — never merged with R1 OBD at this layer. */
export interface NativeEventEvidence {
  channel: 'NATIVE_PROVIDER_EVENT';
  result: DiV0NativeEventEvidenceResult;
}

export interface DiV0NativeEventNormalizationRequest {
  context: DiV0NativeEventExpectedContext;
  source: DiV0NativeEventSourceEnvelope;
}
