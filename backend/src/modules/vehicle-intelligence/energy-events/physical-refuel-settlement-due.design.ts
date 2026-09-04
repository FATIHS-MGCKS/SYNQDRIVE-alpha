import type { PhysicalRefuelFinalityState } from './physical-refuel-settlement.design';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';

const SETTLING_FINALITY: ReadonlySet<PhysicalRefuelFinalityState> = new Set([
  'PROVISIONAL',
  'SETTLING',
]);

/**
 * When a reconciliation row is PROVISIONAL/SETTLING, schedule the next durable wake-up
 * at latest sibling firstObservedAt + settlement horizon.
 */
export function computeNextReconciliationAt(params: {
  finalityState: PhysicalRefuelFinalityState;
  siblingEventIds: string[];
  firstObservedAtById: Record<string, number>;
  settlementHorizonMs?: number;
  asOfMs?: number;
}): Date | null {
  if (!SETTLING_FINALITY.has(params.finalityState)) {
    return null;
  }

  const horizon =
    params.settlementHorizonMs ??
    DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const memberIds =
    params.siblingEventIds.length > 0
      ? params.siblingEventIds
      : Object.keys(params.firstObservedAtById);

  const observedTimes = memberIds
    .map((id) => params.firstObservedAtById[id])
    .filter((t): t is number => t != null && Number.isFinite(t));

  if (!observedTimes.length) {
    return new Date(params.asOfMs ?? Date.now());
  }

  const dueMs = Math.max(...observedTimes) + horizon;
  return new Date(dueMs);
}

export function isReconciliationDue(
  nextReconciliationAt: Date | null | undefined,
  asOfMs: number,
): boolean {
  if (!nextReconciliationAt) return false;
  return nextReconciliationAt.getTime() <= asOfMs;
}
