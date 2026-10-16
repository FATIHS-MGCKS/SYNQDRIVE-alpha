import {
  EXP021_P21_REFERENCE_TRIP_EXCLUDED,
  type P21InventoryRow,
  selectTripsForMultiCompare,
} from './exp021-p21-p1-v2-multi-trip-selection';

/** Production-validated reference trips (always included when present in inventory). */
export const EXP021_COVERAGE_FORCED_TRIP_IDS = [
  '9ead317c-8725-4373-b9ac-8bb84d5549be',
  '72617129-0b33-4ef7-92ae-33ce1c4feffc',
] as const;

export const EXP021_COVERAGE_DIAGNOSTIC_SELECTION_RULE_V1 = [
  'Pool: same as EXP021 P2.1 multi-trip inventory (completed active PRIMARY + pinned snapshot + shadow intervals + evidence snapshot row).',
  `Always include forced trip ids: ${EXP021_COVERAGE_FORCED_TRIP_IDS.join(', ')} when present.`,
  `Exclude reference trip ${EXP021_P21_REFERENCE_TRIP_EXCLUDED} from greedy fill only (forced ids override).`,
  'Greedy diversity fill up to maxTrips total (default 20): same scoring as P2.1 (vehicle +3, UTC date +3, duration bucket +1).',
  'Tie-break: completed_at DESC, trip_id lexicographic.',
  'Selection fixed from inventory metadata before per-trip compute.',
].join(' ');

export function selectTripsForCoverageDiagnostic(
  inventory: P21InventoryRow[],
  options: { maxTrips?: number } = {},
): { selected: P21InventoryRow[]; forcedIncluded: string[]; greedyIncluded: string[]; poolSize: number } {
  const maxTrips = options.maxTrips ?? 20;
  const byTrip = new Map(inventory.map((r) => [r.trip_id, r]));
  const forced: P21InventoryRow[] = [];
  const forcedIncluded: string[] = [];
  for (const tripId of EXP021_COVERAGE_FORCED_TRIP_IDS) {
    const row = byTrip.get(tripId);
    if (row) {
      forced.push(row);
      forcedIncluded.push(tripId);
    }
  }
  const forcedSet = new Set(forced.map((r) => r.trip_id));
  const remainingSlots = Math.max(0, maxTrips - forced.length);
  const greedy = selectTripsForMultiCompare(
    inventory.filter((r) => !forcedSet.has(r.trip_id)),
    { excludeTripIds: [EXP021_P21_REFERENCE_TRIP_EXCLUDED], maxTrips: remainingSlots },
  );
  const selected = [...forced, ...greedy].sort((a, b) => {
    const ca = a.completed_at.getTime();
    const cb = b.completed_at.getTime();
    if (cb !== ca) return cb - ca;
    return a.trip_id.localeCompare(b.trip_id);
  });
  return {
    selected,
    forcedIncluded,
    greedyIncluded: greedy.map((r) => r.trip_id),
    poolSize: inventory.length,
  };
}
