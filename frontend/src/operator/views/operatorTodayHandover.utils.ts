import type { OperatorTodayBookingItem } from '../lib/operatorData';

export function handoverItemKey(
  item: Pick<OperatorTodayBookingItem, 'bookingId' | 'kind'>,
): string {
  return `${item.bookingId}:${item.kind}`;
}

/** Remove handovers already shown in the NOW bucket from today's list. */
export function dedupeHandoversExcludingDueNow(
  pickupsToday: OperatorTodayBookingItem[],
  returnsToday: OperatorTodayBookingItem[],
  dueNow: OperatorTodayBookingItem[],
): OperatorTodayBookingItem[] {
  const dueKeys = new Set(dueNow.map(handoverItemKey));
  const seen = new Set<string>();
  const out: OperatorTodayBookingItem[] = [];

  for (const item of [...pickupsToday, ...returnsToday]) {
    const key = handoverItemKey(item);
    if (dueKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function buildHandoverSuppressionKeys(
  items: OperatorTodayBookingItem[],
): Set<string> {
  return new Set(items.map(handoverItemKey));
}
