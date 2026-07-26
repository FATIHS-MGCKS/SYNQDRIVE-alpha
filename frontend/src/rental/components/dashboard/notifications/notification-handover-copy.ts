import type { VehicleData } from '../../../data/vehicles';
import { formatFleetDateTime } from '../../../../lib/formatVehicleDisplay';
import { bookingRef } from '../../bookings/bookingUtils';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import type { ActionQueueItem } from '../dashboardTypes';
import { createNotificationTranslator } from '../notificationQueueEnricher';

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
  const t = createNotificationTranslator(locale);
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(t('notification.handover.duration.hours', { count: hours }));
  if (mins > 0 || hours === 0) parts.push(t('notification.handover.duration.minutes', { count: mins }));
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
  const t = createNotificationTranslator(locale);
  const kind = resolveHandoverKind(item);
  const duration = formatOverdueDuration(resolveOverdueMinutes(item, referenceNowMs), locale);
  if (kind === 'return') {
    return t('notification.handover.headline.return', { duration });
  }
  return t('notification.handover.headline.pickup', { duration });
}

export function resolveOverdueHandoverEyebrow(item: ActionQueueItem, locale: string): string {
  const t = createNotificationTranslator(locale);
  const kind = resolveHandoverKind(item);
  if (kind === 'return') return t('notification.handover.eyebrow.return');
  return t('notification.handover.eyebrow.pickup');
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

  const t = createNotificationTranslator(locale);
  const kind = resolveHandoverKind(item);
  const bookingNumber = tile.bookingNumber ?? (tile.bookingId ? bookingRef(tile.bookingId) : '');
  const appointmentIso = kind === 'return' ? tile.endDate : tile.startDate;
  const appointmentLabel =
    kind === 'return'
      ? t('notification.handover.detail.returnAppointment')
      : t('notification.handover.detail.pickupAppointment');

  const fields: NotificationDetailField[] = [];
  if (bookingNumber) fields.push({ label: 'BNR', value: bookingNumber });
  if (tile.customer) fields.push({ label: t('notification.handover.detail.customer'), value: tile.customer });
  if (tile.station) fields.push({ label: t('notification.handover.detail.station'), value: tile.station });
  if (appointmentIso) {
    const formatted = formatFleetDateTime(appointmentIso, locale === 'de' ? 'de-DE' : 'en-US');
    if (formatted) fields.push({ label: appointmentLabel, value: formatted });
  }
  return fields;
}

export function resolveHandoverCustomerId(item: ActionQueueItem): string | undefined {
  return item.customerId ?? item.pickupItem?.customerId ?? item.returnItem?.customerId;
}
