/**
 * Durable lifecycle recovery fingerprints persisted on VehicleTrip.rawDetectionMeta.
 * Enables orphan recovery from DB state alone after worker restart.
 */
export const LIFECYCLE_RECOVERY_META_VERSION = 'r2a-v1';

export interface StartEpisodeRecoveryMeta {
  version: typeof LIFECYCLE_RECOVERY_META_VERSION;
  type: 'start_episode';
  candidateStartAt: string;
  effectiveStartAt: string;
  dimoSegmentId?: string | null;
  episodeId: string;
}

export interface MergeReopenRecoveryMeta {
  version: typeof LIFECYCLE_RECOVERY_META_VERSION;
  type: 'merge_reopen';
  candidateStartAt: string;
  effectiveStartAt?: string | null;
  reopenedAt: string;
}

export interface TripLifecycleRecoveryMetaRoot {
  startEpisode?: StartEpisodeRecoveryMeta;
  mergeReopen?: MergeReopenRecoveryMeta;
}

export function buildStartEpisodeId(
  vehicleId: string,
  candidateStartAt: Date,
): string {
  return `${vehicleId}:${candidateStartAt.getTime()}`;
}

export function buildStartEpisodeRecoveryMeta(params: {
  vehicleId: string;
  candidateStartAt: Date;
  effectiveStartAt: Date;
  dimoSegmentId?: string | null;
}): StartEpisodeRecoveryMeta {
  return {
    version: LIFECYCLE_RECOVERY_META_VERSION,
    type: 'start_episode',
    candidateStartAt: params.candidateStartAt.toISOString(),
    effectiveStartAt: params.effectiveStartAt.toISOString(),
    dimoSegmentId: params.dimoSegmentId ?? null,
    episodeId: buildStartEpisodeId(params.vehicleId, params.candidateStartAt),
  };
}

export function buildMergeReopenRecoveryMeta(params: {
  candidateStartAt: Date;
  effectiveStartAt?: Date | null;
  reopenedAt?: Date;
}): MergeReopenRecoveryMeta {
  return {
    version: LIFECYCLE_RECOVERY_META_VERSION,
    type: 'merge_reopen',
    candidateStartAt: params.candidateStartAt.toISOString(),
    effectiveStartAt: params.effectiveStartAt?.toISOString() ?? null,
    reopenedAt: (params.reopenedAt ?? new Date()).toISOString(),
  };
}

function asRecord(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta as Record<string, unknown>;
}

export function readLifecycleRecoveryRoot(
  rawDetectionMeta: unknown,
): TripLifecycleRecoveryMetaRoot | null {
  const root = asRecord(rawDetectionMeta).lifecycleRecovery;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  return root as TripLifecycleRecoveryMetaRoot;
}

export function readStartEpisodeFromTrip(
  rawDetectionMeta: unknown,
): StartEpisodeRecoveryMeta | null {
  const episode = readLifecycleRecoveryRoot(rawDetectionMeta)?.startEpisode;
  if (!episode || episode.type !== 'start_episode') return null;
  return episode;
}

export function readMergeReopenFromTrip(
  rawDetectionMeta: unknown,
): MergeReopenRecoveryMeta | null {
  const merge = readLifecycleRecoveryRoot(rawDetectionMeta)?.mergeReopen;
  if (!merge || merge.type !== 'merge_reopen') return null;
  return merge;
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Resolve FSM possibleStartAt for RECOVERABLE_MERGE_ORPHAN.
 * Never uses the reopened trip's original trip.startTime.
 */
export function resolveMergeReopenPossibleStartAt(params: {
  rawDetectionMeta: unknown;
  detPossibleStartAt?: Date | null;
}): Date | null {
  const merge = readMergeReopenFromTrip(params.rawDetectionMeta);
  if (merge?.effectiveStartAt) {
    return parseIsoDate(merge.effectiveStartAt);
  }
  if (merge?.candidateStartAt) {
    return parseIsoDate(merge.candidateStartAt);
  }
  if (params.detPossibleStartAt) {
    return params.detPossibleStartAt;
  }
  return null;
}

export function mergeLifecycleRecoveryMeta(
  existingMeta: unknown,
  patch: TripLifecycleRecoveryMetaRoot,
): Record<string, unknown> {
  const base = asRecord(existingMeta);
  const current = readLifecycleRecoveryRoot(existingMeta) ?? {};
  return {
    ...base,
    lifecycleRecovery: {
      ...current,
      ...patch,
    },
  };
}
