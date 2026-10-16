export type LvDedupableObservationRow = {
  id: string;
  sourceMeasurementId: string;
  voltageObservedAt: Date | null;
  createdAt: Date;
};

/**
 * One row per source measurement — latest GE row wins (C3/D3 revisions must not double-count).
 */
export function dedupeObservationsBySourceMeasurementId<T extends LvDedupableObservationRow>(
  rows: T[],
): T[] {
  const bySource = new Map<string, T>();
  for (const row of rows) {
    const existing = bySource.get(row.sourceMeasurementId);
    if (!existing) {
      bySource.set(row.sourceMeasurementId, row);
      continue;
    }
    const rowAt = row.voltageObservedAt?.getTime() ?? row.createdAt.getTime();
    const existingAt =
      existing.voltageObservedAt?.getTime() ?? existing.createdAt.getTime();
    if (rowAt > existingAt || (rowAt === existingAt && row.createdAt > existing.createdAt)) {
      bySource.set(row.sourceMeasurementId, row);
    }
  }
  return [...bySource.values()].sort((a, b) => {
    const aAt = a.voltageObservedAt?.getTime() ?? a.createdAt.getTime();
    const bAt = b.voltageObservedAt?.getTime() ?? b.createdAt.getTime();
    return bAt - aAt;
  });
}
