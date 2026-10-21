import type { BatteryGroundTruthVerificationStatus } from '@prisma/client';

/** Minimal row shape for F5 historical asOf reconstruction (G3.1). */
export type GroundTruthHistoricalLifecycleRow = {
  id: string;
  createdAt: Date;
  effectiveAt: Date;
  verificationStatus: BatteryGroundTruthVerificationStatus;
  revocations: { revokedAt: Date }[];
  supersedesGroundTruthEventId: string | null;
};

export function buildGroundTruthSuccessorsByPriorId(
  rows: GroundTruthHistoricalLifecycleRow[],
): Map<string, GroundTruthHistoricalLifecycleRow[]> {
  const map = new Map<string, GroundTruthHistoricalLifecycleRow[]>();
  for (const row of rows) {
    if (!row.supersedesGroundTruthEventId) continue;
    const list = map.get(row.supersedesGroundTruthEventId) ?? [];
    list.push(row);
    map.set(row.supersedesGroundTruthEventId, list);
  }
  for (const [key, list] of map) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    map.set(key, list);
  }
  return map;
}

/**
 * F5 asOf-only authority — does NOT replace present-tense G1/G2 active checks.
 * Reconstructs whether a row was scientifically active at `asOf` using lifecycle timestamps.
 */
export function isGroundTruthActiveAtAsOf(
  row: GroundTruthHistoricalLifecycleRow,
  asOf: Date,
  successorsByPriorId: Map<string, GroundTruthHistoricalLifecycleRow[]>,
): boolean {
  if (row.createdAt.getTime() > asOf.getTime()) {
    return false;
  }
  if (row.effectiveAt.getTime() > asOf.getTime()) {
    return false;
  }
  for (const rev of row.revocations) {
    if (rev.revokedAt.getTime() <= asOf.getTime()) {
      return false;
    }
  }
  const successors = successorsByPriorId.get(row.id) ?? [];
  for (const successor of successors) {
    if (successor.createdAt.getTime() <= asOf.getTime()) {
      return false;
    }
  }
  return true;
}
