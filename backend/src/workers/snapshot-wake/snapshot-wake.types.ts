export type SnapshotJobOrigin = 'SCHEDULED' | 'PROVIDER_WAKE' | 'WAKE_PROBE';

export type SnapshotWakeReason = 'SPEED_MOVEMENT' | 'IGNITION_ON';

export type SnapshotWakeSignalName = 'speed' | 'isIgnitionOn';

export type ProviderWakeTimestampClass =
  | 'FRESH'
  | 'STALE'
  | 'FUTURE_INVALID'
  | 'MISSING'
  | 'INVALID';

export interface SnapshotWakeContext {
  source: 'DIMO_TRIGGER';
  reason: SnapshotWakeReason;
  providerObservedAt: string | null;
  receivedAt: string;
  signalName: SnapshotWakeSignalName;
  probeGeneration: 0 | 1;
}

export interface DimoSnapshotJobData {
  vehicleId: string;
  dimoTokenId: number;
  origin?: SnapshotJobOrigin;
  wakeContext?: SnapshotWakeContext;
}

export type SnapshotWakeOutcome =
  | 'ENQUEUED'
  | 'COALESCED'
  | 'ALREADY_COVERED'
  | 'IGNORED_FSM_ACTIVE'
  | 'IGNORED_INELIGIBLE'
  | 'INVALID_SIGNAL'
  | 'QUEUE_FAILED';

export interface RequestSnapshotInput {
  vehicleId: string;
  dimoTokenId: number;
  origin: SnapshotJobOrigin;
  wakeContext?: SnapshotWakeContext;
  delayMs?: number;
}

export interface PendingSnapshotWakeRecord {
  dimoTokenId: number;
  wakeContext: SnapshotWakeContext;
  updatedAtMs: number;
  version: number;
}

export interface SuccessorSnapshotWakeRecord {
  dimoTokenId: number;
  origin: SnapshotJobOrigin;
  wakeContext: SnapshotWakeContext;
  notBeforeMs: number;
  updatedAtMs: number;
  version: number;
}

export interface PendingWakePersistResult {
  ok: boolean;
  version?: number;
  error?: string;
}

export interface SuccessorHandoffPersistResult {
  ok: boolean;
  version?: number;
  notBeforeMs?: number;
  error?: string;
}

export interface ClaimedPendingSnapshotWake {
  record: PendingSnapshotWakeRecord;
  version: number;
}

export interface SnapshotWakeForensics {
  source: 'DIMO_TRIGGER';
  reason: SnapshotWakeReason;
  providerObservedAt: string | null;
  receivedAt: string;
  snapshotFetchedAt: string | null;
  probeGeneration: 0 | 1;
  cooldownBypassUsed: boolean;
}

export interface EvaluateSnapshotForTripStartWakeOptions {
  wakeContext?: SnapshotWakeContext | null;
  snapshotFetchedAt?: Date | null;
}
