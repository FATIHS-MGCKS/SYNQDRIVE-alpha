import { EnergyEventKind, type Prisma, type VehicleEnergyEvent } from '@prisma/client';

export const DEFAULT_PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS = 60 * 60 * 1000;

/**
 * Bounded same-vehicle REFUEL candidate window anchored on trigger observation time.
 *
 * CANDIDATE_LOOKBACK: default 6h (covers settlement horizon + Sept04 sibling stagger)
 * CANDIDATE_LOOKAHEAD: default 1h (near-future siblings in same detection batch)
 * FINALIZED_HISTORY_SCOPE: prior FINAL_* loaded from reconciliation table
 */
export function computeRefuelCandidateWindow(
  triggerObservationMs: number,
  lookbackMs: number = DEFAULT_PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS,
  lookaheadMs: number = DEFAULT_PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS,
): { from: Date; to: Date } {
  return {
    from: new Date(triggerObservationMs - lookbackMs),
    to: new Date(triggerObservationMs + lookaheadMs),
  };
}

export function buildRefuelCandidateWhere(
  vehicleId: string,
  window: { from: Date; to: Date },
  v2OwnershipCutoverAt?: Date | null,
): Prisma.VehicleEnergyEventWhereInput {
  const effectiveFrom =
    v2OwnershipCutoverAt != null
      ? new Date(Math.max(window.from.getTime(), v2OwnershipCutoverAt.getTime()))
      : window.from;

  return {
    vehicleId,
    kind: EnergyEventKind.REFUEL,
    createdAt: {
      gte: effectiveFrom,
      lte: window.to,
    },
  };
}

export function sortRefuelCandidates(rows: VehicleEnergyEvent[]): VehicleEnergyEvent[] {
  return [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}
