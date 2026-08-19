import { formatFleetDateTime } from '../../../lib/formatVehicleDisplay';
import { dashboardFormattingLocale, dt } from './dashboard-i18n';

export function kmProgressPercent(
  driven: number | null | undefined,
  included: number | null | undefined,
): number | null {
  if (typeof driven !== 'number' || typeof included !== 'number' || included <= 0) return null;
  return Math.max(0, Math.round((driven / included) * 100));
}

export function kmRemainingPercent(
  driven: number | null | undefined,
  included: number | null | undefined,
): number | null {
  const consumed = kmProgressPercent(driven, included);
  if (consumed == null) return null;
  return Math.max(0, Math.min(100, 100 - consumed));
}

export function formatFreeKmLabel(
  driven: number | null | undefined,
  included: number | null | undefined,
  locale: string,
): string {
  if (typeof driven !== 'number' || typeof included !== 'number') return '—';
  const remaining = Math.round(included - driven);
  const formatted = Math.abs(remaining).toLocaleString(dashboardFormattingLocale(locale));
  if (remaining < 0) {
    return dt(locale, 'dashboard.drilldown.freeKmOver', { km: formatted });
  }
  return dt(locale, 'dashboard.drilldown.freeKmRemaining', { km: formatted });
}

/** @deprecated Use formatFreeKmLabel */
export function formatKmRemainingLabel(
  driven: number | null | undefined,
  included: number | null | undefined,
  locale: string,
): string {
  return formatFreeKmLabel(driven, included, locale);
}

export function activeRentalKmBarTone(
  driven: number | null | undefined,
  included: number | null | undefined,
): 'success' | 'watch' | 'critical' {
  const consumed = kmProgressPercent(driven, included);
  if (consumed == null) return 'success';
  if (consumed > 100) return 'critical';
  if (consumed > 85) return 'watch';
  return 'success';
}

export function activeRentalKmBarFillPercent(
  driven: number | null | undefined,
  included: number | null | undefined,
): number {
  const remaining = kmRemainingPercent(driven, included);
  if (remaining != null) return remaining;
  const consumed = kmProgressPercent(driven, included);
  if (consumed != null) return Math.max(0, 100 - Math.min(consumed, 100));
  return 0;
}

export function activeRentalRentedTillText(
  returnAt: string | null | undefined,
  locale: string,
): string {
  const when = formatFleetDateTime(returnAt, dashboardFormattingLocale(locale));
  return dt(locale, 'dashboard.drilldown.rentedUntil', { when });
}
