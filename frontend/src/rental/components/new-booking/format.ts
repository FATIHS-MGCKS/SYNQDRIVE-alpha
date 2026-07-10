import { formatMoneyMajorUnits } from '../../../lib/money';

/** Currency-aware booking amount display (major units from cents-derived values). */
export function formatBookingAmount(
  value: number | null | undefined,
  currency: string,
): string {
  return formatMoneyMajorUnits(value, currency);
}

/** Plain numeric label for inline HTML previews (currency symbol applied separately). */
export function amountLabel(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(2) : '—';
}

/** @deprecated Use formatBookingAmount(value, currency) */
export function formatEuroAmount(value: number | null | undefined): string {
  return formatBookingAmount(value, 'EUR');
}
