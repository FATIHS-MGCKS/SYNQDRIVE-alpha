import type { SnapshotJobOrigin, SnapshotWakeReason, SnapshotWakeSignalName } from './snapshot-wake.types';
import type { WAKE_CORRELATION_ID_VERSION } from './r9-wake-correlation.constants';

/**
 * Canonical R9 provider-wake correlation contract (forensic lineage; not queue identity).
 * Timestamps are distinct: never substitute receivedAt for providerObservedAt.
 */
export interface R9ProviderWakeCorrelationContext {
  wakeCorrelationId: string;
  wakeCorrelationVersion: typeof WAKE_CORRELATION_ID_VERSION;
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number;
  signalName: SnapshotWakeSignalName;
  wakeReason: SnapshotWakeReason;
  /** Provider signal/event time when known; null only when genuinely unavailable. */
  providerObservedAt: string | null;
  /** SynqDrive webhook intake wall time (always set at intake). */
  receivedAt: string;
  providerDeliveryId: string | null;
  payloadFingerprint: string | null;
  probeGeneration: 0 | 1;
  /** Monotonic forensic schema version for context extensions (default 1). */
  wakeVersion: number;
  origin: SnapshotJobOrigin;
}

export interface BuildR9WakeCorrelationInput {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number;
  signalName: SnapshotWakeSignalName;
  wakeReason: SnapshotWakeReason;
  providerObservedAt: Date | null;
  receivedAt: Date;
  providerDeliveryId?: string | null;
  payloadFingerprint?: string | null;
  probeGeneration?: 0 | 1;
  origin?: SnapshotJobOrigin;
}

export type R9DegradedIdentityStrategy =
  | 'PROVIDER_DELIVERY_ID'
  | 'PROVIDER_OBSERVED_AT'
  | 'PAYLOAD_FINGERPRINT'
  | 'DEGRADED_NO_PROVIDER_OBSERVED_AT';
