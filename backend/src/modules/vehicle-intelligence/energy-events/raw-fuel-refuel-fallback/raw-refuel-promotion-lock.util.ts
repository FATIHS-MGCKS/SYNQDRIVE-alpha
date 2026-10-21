/** Transaction-scoped advisory lock for F5-PR2 atomic fallback promotion (TRANSACTION A). */
export function buildRfrfPromotionLockKey(vehicleId: string): string {
  return `rfrf_promote:${vehicleId}`;
}
