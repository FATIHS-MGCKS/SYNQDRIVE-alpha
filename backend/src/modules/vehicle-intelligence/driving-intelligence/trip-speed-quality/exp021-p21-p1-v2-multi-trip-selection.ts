export const EXP021_P21_REFERENCE_TRIP_EXCLUDED =
  'd0af9cc7-ce0d-4e40-9854-2c1341e83bed' as const;

export const EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1 = [
  'Pool: completed PRIMARY work items for the org where the row is the active primary (highest boundary_occurrence, non-SUPERSEDED).',
  'Require pinned_snapshot_hash, shadow_run_id, and a matching di_v0_s4_evidence_snapshots row.',
  'Exclude reference trip d0af9cc7-ce0d-4e40-9854-2c1341e83bed (validated separately).',
  'At most one work item per distinct trip_id.',
  'Greedy diversity pick up to 10: prefer new vehicle_id (+3), new UTC shadow-window start date (+3), new shadow-derived duration bucket (+1: short <30m, medium <120m, long).',
  'Tie-break: completed_at DESC, then trip_id lexicographic.',
  'Selection is fixed from inventory metadata before any V1/V2 compare (no cherry-picking on V2 outcomes).',
].join(' ');

export type P21InventoryRow = {
  work_item_id: string;
  trip_id: string;
  vehicle_id: string;
  pinned_snapshot_hash: string;
  shadow_run_id: string;
  completed_at: Date;
  start_time: Date;
  duration_minutes: number | null;
  interval_count: number;
  stationary_band_count: number;
};

export function durationBucket(minutes: number | null): 'short' | 'medium' | 'long' | 'unknown' {
  if (minutes == null || !Number.isFinite(minutes)) return 'unknown';
  if (minutes < 30) return 'short';
  if (minutes < 120) return 'medium';
  return 'long';
}

export function tripUtcDateLabel(startTime: Date): string {
  return startTime.toISOString().slice(0, 10);
}

/** Deterministic pre-compare trip selection (max 10). */
export function selectTripsForMultiCompare(
  inventory: P21InventoryRow[],
  options: { excludeTripIds?: string[]; maxTrips?: number } = {},
): P21InventoryRow[] {
  const exclude = new Set(options.excludeTripIds ?? [EXP021_P21_REFERENCE_TRIP_EXCLUDED]);
  const maxTrips = options.maxTrips ?? 10;
  const pool = inventory
    .filter((r) => !exclude.has(r.trip_id))
    .sort((a, b) => {
      const ca = a.completed_at.getTime();
      const cb = b.completed_at.getTime();
      if (cb !== ca) return cb - ca;
      return a.trip_id.localeCompare(b.trip_id);
    });

  const picked: P21InventoryRow[] = [];
  const vehicles = new Set<string>();
  const dates = new Set<string>();
  const buckets = new Set<string>();
  const remaining = [...pool];

  while (picked.length < maxTrips && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      let score = 0;
      if (!vehicles.has(r.vehicle_id)) score += 3;
      const d = tripUtcDateLabel(r.start_time);
      if (!dates.has(d)) score += 3;
      const b = durationBucket(r.duration_minutes);
      if (!buckets.has(b)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      } else if (score === bestScore) {
        const cur = remaining[bestIdx];
        const ca = cur.completed_at.getTime();
        const cb = r.completed_at.getTime();
        if (cb > ca || (cb === ca && r.trip_id < cur.trip_id)) {
          bestIdx = i;
        }
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    picked.push(chosen);
    vehicles.add(chosen.vehicle_id);
    dates.add(tripUtcDateLabel(chosen.start_time));
    buckets.add(durationBucket(chosen.duration_minutes));
  }
  return picked;
}
