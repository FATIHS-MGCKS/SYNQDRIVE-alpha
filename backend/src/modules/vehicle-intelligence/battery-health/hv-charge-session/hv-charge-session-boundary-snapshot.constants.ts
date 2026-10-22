/** Persisted on session metadata when SOC/current-energy boundaries come from HV poll snapshots. */
export const HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE =
  'SNAPSHOT_TEMPORAL_BOUNDARY_V1' as const;

export type HvChargeSessionSnapshotBoundaryProvenance =
  typeof HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE;

/** Max |snapshot.recordedAt − segment boundary instant| for a boundary match. */
export const HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS = 20 * 60 * 1000;

/** Extra window padding when loading snapshots (bounded query). */
export const HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS = 30 * 60 * 1000;

/** Per-anchor cap (start window + end window); avoids truncating the end on long sessions. */
export const HV_CHARGE_SESSION_BOUNDARY_ANCHOR_QUERY_LIMIT = 250;

export const HV_CHARGE_SESSION_BOUNDARY_ENRICHMENT_VERSION = 1;

const PROVENANCE_RANK: Record<string, number> = {
  [HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE]: 2,
  SEGMENT_EXTREMA: 1,
  UNKNOWN: 0,
};

export function isStrongerHvSessionBoundaryProvenance(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): boolean {
  const inRank = PROVENANCE_RANK[incoming ?? ''] ?? 0;
  const exRank = PROVENANCE_RANK[existing ?? ''] ?? 0;
  return inRank > exRank;
}

export function shouldPreserveExistingBoundaryScalars(
  existingProvenance: string | null | undefined,
  incomingProvenance: string | null | undefined,
): boolean {
  const exRank = PROVENANCE_RANK[existingProvenance ?? ''] ?? 0;
  const inRank = PROVENANCE_RANK[incomingProvenance ?? ''] ?? 0;
  return exRank > inRank;
}
