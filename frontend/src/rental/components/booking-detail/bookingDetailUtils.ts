import type { BookingDetailDto } from '../../../lib/api';
import { DEFAULT_ORG_TIMEZONE, formatBookingDateTime } from '../../../lib/datetime';
import { normalizeBookingStatus } from '../bookings/bookingStatus';

export const EM_DASH = '—';

export function formatCurrencyCents(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null || !Number.isFinite(cents)) return 'Noch nicht berechnet';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}

export function formatDateTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
  locale?: string | null,
): string {
  return formatBookingDateTime(iso, timeZone, locale);
}

export function formatDateRange(
  start: string,
  end: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
  locale?: string | null,
): string {
  return `${formatDateTime(start, timeZone, locale)} → ${formatDateTime(end, timeZone, locale)}`;
}

export function paymentStatusLabel(status: string | null): string {
  if (!status) return 'Unbekannt';
  switch (status.toUpperCase()) {
    case 'PAID':
      return 'Bezahlt';
    case 'PARTIAL':
      return 'Teilweise bezahlt';
    case 'OPEN':
      return 'Offen';
    case 'OVERDUE':
      return 'Überfällig';
    default:
      return status;
  }
}

export function depositStatusLabel(status: string | null): string {
  if (!status) return 'Keine Kaution';
  const map: Record<string, string> = {
    REQUESTED: 'Angefordert',
    RECEIVED: 'Erhalten',
    PARTIALLY_USED: 'Teilweise einbehalten',
    REFUNDED: 'Erstattet',
    PARTIALLY_REFUNDED: 'Teilweise erstattet',
    FORFEITED: 'Einbehalten',
  };
  return map[status] ?? status;
}

export function documentsShortStatus(detail: BookingDetailDto): string {
  const missingRequired = detail.documents.slots.filter((s) => s.required && !s.available).length;
  if (missingRequired === 0 && detail.documents.bundleStatus === 'COMPLETE') return 'Vollständig';
  if (missingRequired > 0) return `${missingRequired} fehlend`;
  if (detail.documents.bundleStatus === 'PARTIAL') return 'Unvollständig';
  return 'Ausstehend';
}

export function handoverShortStatus(detail: BookingDetailDto): string {
  const ui = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  if (detail.handover.return) return 'Rückgabe erledigt';
  if (detail.handover.pickup) return 'Abholung erledigt';
  if (ui === 'active') return 'Rückgabe ausstehend';
  if (ui === 'confirmed' || ui === 'pending') return 'Pickup bereit';
  if (ui === 'completed') return 'Abgeschlossen';
  return EM_DASH;
}

export function financeShortStatus(detail: BookingDetailDto): string {
  if (!detail.finance.computed) return 'Noch nicht berechnet';
  if (detail.finance.paymentStatus === 'PAID') return 'Bezahlt';
  if (detail.finance.depositStatus === 'REQUESTED') return 'Kaution offen';
  if ((detail.finance.openAmountCents ?? 0) > 0) return 'Offen';
  return paymentStatusLabel(detail.finance.paymentStatus);
}

export type BookingExtraLine = {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  totalPriceCents: number | null;
  taxable: boolean | null;
};

export function parseBookingExtras(extras: unknown[]): BookingExtraLine[] {
  const lines: BookingExtraLine[] = [];
  for (const raw of extras) {
    if (!raw || typeof raw !== 'object') continue;
    const ex = raw as Record<string, unknown>;
    const name = String(ex.name ?? ex.label ?? ex.title ?? 'Extra');
    const quantity = Number(ex.quantity ?? ex.qty ?? 1);
    const price = ex.price != null ? Number(ex.price) : null;
    const unitCents = price != null && Number.isFinite(price) ? Math.round(price * 100) : null;
    const totalCents =
      ex.totalCents != null
        ? Number(ex.totalCents)
        : unitCents != null
          ? unitCents * (Number.isFinite(quantity) ? quantity : 1)
          : null;
    lines.push({
      name,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      unitPriceCents: unitCents,
      totalPriceCents: totalCents != null && Number.isFinite(totalCents) ? totalCents : null,
      taxable: typeof ex.taxable === 'boolean' ? ex.taxable : null,
    });
  }
  return lines;
}

export function isPickupOverdue(detail: BookingDetailDto): boolean {
  if (detail.handover.pickup) return false;
  const ui = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  if (ui !== 'confirmed' && ui !== 'pending') return false;
  const start = new Date(detail.core.startDate);
  return !Number.isNaN(start.getTime()) && start.getTime() < Date.now();
}
