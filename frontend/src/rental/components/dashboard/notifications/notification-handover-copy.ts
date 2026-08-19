import { dt, dashboardFormattingLocale } from '../dashboard-i18n';
import type { VehicleData } from '../../../data/vehicles';
import { formatFleetDateTime } from '../../../../lib/formatVehicleDisplay';
import { bookingRef } from '../../bookings/bookingUtils';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import type { ActionQueueItem } from '../dashboardTypes';

export type HandoverKind = 'pickup' | 'return';

export interface NotificationDetailField {
  label: string;
  value: string;
}

function parseTimeMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatOverdueDuration(minutes: number, locale: string): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(
      locale === 'de'
        ? dt(locale, 'dashboard.time.hoursShortDe', { count: hours })
        : dt(locale, 'dashboard.time.hoursShort', { count: hours }),
    );
  }
  if (mins > 0 || hours === 0) {
    parts.push(
      locale === 'de'
        ? dt(locale, 'dashboard.time.minutesShortDe', { count: mins })
        : dt(locale, 'dashboard.time.minutesShort', { count: mins }),
    );
  }
  return parts.join(' ');
}

export function isOverdueHandoverNotification(item: ActionQueueItem): boolean {
  if (!item.isOverdue) return false;
  if (item.pickupItem?.isOverdue || item.returnItem?.isOverdue) return true;
  const issueType = (item.issueType ?? item.queue?.issueType ?? '').toLowerCase();
  return issueType === 'pickup_overdue' || issueType === 'return_overdue';
}

export function resolveHandoverKind(item: ActionQueueItem): HandoverKind | null {
  if (item.pickupItem || item.issueType === 'pickup_overdue') return 'pickup';
  if (item.returnItem || item.issueType === 'return_overdue') return 'return';
  if (item.semanticKey?.includes(':return:')) return 'return';
  if (item.id.startsWith('return-')) return 'return';
  if (item.id.startsWith('pickup-')) return 'pickup';
  return null;
}

function resolveOverdueMinutes(item: ActionQueueItem, referenceNowMs: number): number {
  const tile = item.pickupItem ?? item.returnItem;
  if (
    tile
    && 'minutesOverdue' in tile
    && typeof tile.minutesOverdue === 'number'
    && tile.minutesOverdue > 0
  ) {
    return tile.minutesOverdue;
  }
  const scheduled = item.pickupItem?.startDate ?? item.returnItem?.endDate;
  const ms = parseTimeMs(scheduled);
  if (ms == null) return 0;
  return Math.max(0, Math.round((referenceNowMs - ms) / 60_000));
}

export function buildOverdueHandoverIssueHeadline(
  item: ActionQueueItem,
  locale: string,
  referenceNowMs: number = Date.now(),
): string {
  const kind = resolveHandoverKind(item);
  const duration = formatOverdueDuration(resolveOverdueMinutes(item, referenceNowMs), locale);
  if (kind === 'return') {
    return dt(locale, 'dashboard.handover.returnOverdueSince', { duration });
  }
  return dt(locale, 'dashboard.handover.pickupOverdueSince', { duration });
}

export function resolveOverdueHandoverEyebrow(item: ActionQueueItem, locale: string): string {
  const kind = resolveHandoverKind(item);
  if (kind === 'return') {
    return dt(locale, 'dashboard.handover.overdueReturn');
  }
  if (kind === 'pickup') {
    return dt(locale, 'dashboard.handover.overdueHandover');
  }
  return dt(locale, 'dashboard.handover.overdueHandover');
}

export function buildHandoverEntityContext(
  tile: PickupTileItem | ReturnTileItem,
  fleetById: Map<string, VehicleData>,
) {
  const vehicle = tile.vehicleId ? fleetById.get(tile.vehicleId) : undefined;
  return {
    plate: tile.plate || vehicle?.license,
    make: vehicle?.make,
    model: vehicle?.model,
    year: vehicle?.year,
  };
}

export function buildOverdueHandoverDetailFields(
  item: ActionQueueItem,
  locale: string,
): NotificationDetailField[] {
  const tile = item.pickupItem ?? item.returnItem;
  if (!tile) return [];

  const de = locale === 'de';
  const kind = resolveHandoverKind(item);
  const bookingNumber = tile.bookingNumber ?? (tile.bookingId ? bookingRef(tile.bookingId) : '');
  const appointmentIso = kind === 'return' ? tile.endDate : tile.startDate;
  const appointmentLabel = kind === 'return'
    ? (dt(locale, 'dashboard.handover.returnAppointment'))
    : (dt(locale, 'dashboard.handover.pickupAppointment'));

  const fields: NotificationDetailField[] = [];
  if (bookingNumber) fields.push({ label: 'BNR', value: bookingNumber });
  if (tile.customer) fields.push({ label: dt(locale, 'dashboard.label.customer'), value: tile.customer });
  if (tile.station) fields.push({ label: dt(locale, 'dashboard.label.station'), value: tile.station });
  if (appointmentIso) {
    const formatted = formatFleetDateTime(appointmentIso, dashboardFormattingLocale(locale));
    if (formatted) fields.push({ label: appointmentLabel, value: formatted });
  }
  return fields;
}

export function resolveHandoverCustomerId(item: ActionQueueItem): string | undefined {
  return item.customerId ?? item.pickupItem?.customerId ?? item.returnItem?.customerId;
}
