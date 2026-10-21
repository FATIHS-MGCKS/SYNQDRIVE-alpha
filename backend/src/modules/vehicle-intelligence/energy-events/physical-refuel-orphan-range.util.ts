/**
 * Bounded orphan REFUEL scan window for G2 recovery.
 *
 * Effective range:
 *   createdAt >= max(v2OwnershipCutoverAt, orphanLookbackFrom)
 *   createdAt <= asOf
 */
export function computeOrphanCreatedAtRange(params: {
  v2OwnershipCutoverAt: Date;
  orphanLookbackFrom: Date;
  asOf: Date;
}): { gte: Date; lte: Date } {
  return {
    gte: new Date(
      Math.max(params.v2OwnershipCutoverAt.getTime(), params.orphanLookbackFrom.getTime()),
    ),
    lte: params.asOf,
  };
}
