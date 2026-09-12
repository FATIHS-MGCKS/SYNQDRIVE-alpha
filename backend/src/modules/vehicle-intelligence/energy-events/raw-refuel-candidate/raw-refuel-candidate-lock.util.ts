/**
 * Per-vehicle transaction-scoped advisory lock for raw refuel candidate resolution.
 * Separate from G2 physical-refuel reconciliation lock to avoid coupling F2/F5 scopes.
 */
export function buildRawRefuelCandidateLockKey(vehicleId: string): string {
  return `raw_refuel_candidate:${vehicleId}`;
}
