/** UTC calendar-month billing period boundaries. */
export function currentBillingPeriodBounds(reference = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodEnd = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { periodStart, periodEnd };
}

export function isWithinPeriod(
  occurredAt: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const ts = occurredAt.getTime();
  return ts >= periodStart.getTime() && ts < periodEnd.getTime();
}
