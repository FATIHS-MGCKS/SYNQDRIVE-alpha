/**
 * Visible conflict reason codes for device-connection episodes.
 * Never silently resolve ambiguous binding or ordering conflicts.
 */
export const EpisodeConflictReasonCode = {
  STALE_UNPLUG_AFTER_RECOVERY: 'STALE_UNPLUG_AFTER_RECOVERY',
  STALE_PLUG_BEFORE_UNPLUG: 'STALE_PLUG_BEFORE_UNPLUG',
  BINDING_ID_CHANGED: 'BINDING_ID_CHANGED',
  TOKEN_CHANGED: 'TOKEN_CHANGED',
  PROVIDER_DEVICE_HASH_MISMATCH: 'PROVIDER_DEVICE_HASH_MISMATCH',
  HISTORICAL_BACKFILL_SNAPSHOT: 'HISTORICAL_BACKFILL_SNAPSHOT',
  OUT_OF_ORDER_WEBHOOK: 'OUT_OF_ORDER_WEBHOOK',
  AMBIGUOUS_BINDING_CHANGE: 'AMBIGUOUS_BINDING_CHANGE',
  OEM_SYNTHETIC_NO_PHYSICAL_BINDING: 'OEM_SYNTHETIC_NO_PHYSICAL_BINDING',
  PARALLEL_BINDING_EPISODES: 'PARALLEL_BINDING_EPISODES',
  PROVIDER_CHANGED: 'PROVIDER_CHANGED',
} as const;

export type EpisodeConflictReasonCode =
  (typeof EpisodeConflictReasonCode)[keyof typeof EpisodeConflictReasonCode];

export function mergeReasonCodes(
  existing: string[],
  incoming: EpisodeConflictReasonCode[],
): string[] {
  return [...new Set([...existing, ...incoming])];
}
