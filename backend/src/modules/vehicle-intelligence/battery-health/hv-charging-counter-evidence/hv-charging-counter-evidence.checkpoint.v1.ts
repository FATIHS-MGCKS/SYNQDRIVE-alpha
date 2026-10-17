export interface HvChargingCounterCheckpointMergeInputV1 {
  queriedAt: Date;
  observationSetFingerprint: string;
}

export interface HvChargingCounterCheckpointMergeStateV1 {
  lastProviderQueryAt: Date;
  lastObservationSetFingerprint: string;
}

/**
 * Monotonic merge for provider revalidation checkpoints.
 * Out-of-order or concurrent writes cannot move lastProviderQueryAt backwards
 * or replace a newer observation-set fingerprint with an older provider response.
 */
export function mergeRevalidationCheckpointMonotonicV1(
  existing: HvChargingCounterCheckpointMergeStateV1 | null,
  incoming: HvChargingCounterCheckpointMergeInputV1,
): HvChargingCounterCheckpointMergeStateV1 {
  if (!existing) {
    return {
      lastProviderQueryAt: incoming.queriedAt,
      lastObservationSetFingerprint: incoming.observationSetFingerprint,
    };
  }

  const existingMs = existing.lastProviderQueryAt.getTime();
  const incomingMs = incoming.queriedAt.getTime();

  if (incomingMs >= existingMs) {
    return {
      lastProviderQueryAt: incoming.queriedAt,
      lastObservationSetFingerprint: incoming.observationSetFingerprint,
    };
  }

  return {
    lastProviderQueryAt: existing.lastProviderQueryAt,
    lastObservationSetFingerprint: existing.lastObservationSetFingerprint,
  };
}
