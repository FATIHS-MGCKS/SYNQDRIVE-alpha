import type {
  ClaimLevel,
  NativeEventCalibrationState,
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
 * Ingested native event row shape (e.g. `driving_events` / DIMO native ingest).
 * Library-only — no Prisma import required at call sites.
 */
export interface DiV0NativeEventInputRecord {
  id: string;
  providerEventName: string;
  providerTimestamp: string | null;
  sourceFamily: TelemetrySourceFamily;
  calibrationState?: NativeEventCalibrationState;
  payloadRef?: string | null;
  metadataJson?: Record<string, unknown> | null;
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
  calibrationState: NativeEventCalibrationState;
  maxClaimLevel: ClaimLevel;
  observation: NativeEventObservation;
  qualityFlags: string[];
}

export interface DiV0NativeEventEvidenceResult {
  adapterVersion: string;
  status: 'NO_EVENT' | 'EVENTS_PRESENT';
  events: DiV0NativeEventEvidenceItem[];
  snapshotIdentity: DiV0NativeEventSnapshotIdentity;
}

/** Channel B — never merged with R1 OBD at this layer. */
export interface NativeEventEvidence {
  channel: 'NATIVE_PROVIDER_EVENT';
  result: DiV0NativeEventEvidenceResult;
}

export interface DiV0NativeEventNormalizationRequest {
  vehicleId: string;
  sourceFamily: TelemetrySourceFamily;
  records: DiV0NativeEventInputRecord[];
}
