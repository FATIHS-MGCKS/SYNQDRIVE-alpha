import { InsightSeverity, InsightType, type InsightCandidate } from '@modules/business-insights/insight.types';
import { BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES } from '@modules/bookings/overdue-return/overdue-return-explanation.constants';
import { NotificationEntityType } from '../notification.enums';
import { buildNotificationFingerprint } from '../notification-fingerprint.factory';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { BookingHandoverAdapterSource } from './notification-adapter.types';

export const BOOKING_HANDOVER_INSIGHT_TYPES = new Set<InsightType>([
  InsightType.PICKUP_OVERDUE,
  InsightType.TIGHT_HANDOVER,
  InsightType.RETURN_NEEDS_INSPECTION,
]);

export const BOOKING_HANDOVER_EVENT_TYPES = [
  'PICKUP_OVERDUE',
  'RETURN_OVERDUE',
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
] as const;

export type BookingHandoverEventType = (typeof BOOKING_HANDOVER_EVENT_TYPES)[number];

export function formatBookingRef(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

function parseDedupeSuffix(dedupeKey: string, prefix: string): string | null {
  if (!dedupeKey.startsWith(prefix)) return null;
  const id = dedupeKey.slice(prefix.length).trim();
  return id || null;
}

function resolveVehicleLabel(insight: InsightCandidate): string {
  const metrics = insight.metrics ?? {};
  if (typeof metrics.vehicleLicense === 'string' && metrics.vehicleLicense.trim()) {
    return metrics.vehicleLicense.trim();
  }
  const message = insight.message?.trim() ?? '';
  const head = message.split('·')[0]?.trim();
  if (head) return head;
  return insight.entityIds[0] ?? 'Buchung';
}

function resolveOccurredAt(insight: InsightCandidate): Date {
  const tc = insight.timeContext ?? {};
  const metrics = insight.metrics ?? {};
  const iso =
    (insight.type === InsightType.PICKUP_OVERDUE
      && (tc.pickupAt ?? (typeof metrics.scheduledStartAt === 'string' ? metrics.scheduledStartAt : null)))
    || (insight.type === InsightType.RETURN_NEEDS_INSPECTION && tc.returnAt)
    || (insight.type === InsightType.TIGHT_HANDOVER && (tc.nextPickupAt ?? tc.returnAt))
    || null;
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** Maps BI detector output to booking-scoped notification adapter sources. */
export function bookingHandoverSourceFromInsight(
  insight: InsightCandidate,
): BookingHandoverAdapterSource | null {
  if (!BOOKING_HANDOVER_INSIGHT_TYPES.has(insight.type)) return null;

  const eventType = insight.type as BookingHandoverEventType;
  let bookingId: string | null = null;
  let vehicleId: string | undefined;
  let conditionCodeVariant: string | undefined;

  if (insight.type === InsightType.PICKUP_OVERDUE) {
    bookingId =
      typeof insight.metrics?.bookingId === 'string' ? insight.metrics.bookingId.trim() : null;
    vehicleId = insight.entityIds[0];
  } else if (insight.type === InsightType.RETURN_NEEDS_INSPECTION) {
    bookingId = parseDedupeSuffix(insight.dedupeKey, 'return_inspection:');
    vehicleId = insight.entityIds[0];
  } else if (insight.type === InsightType.TIGHT_HANDOVER) {
    const parts = insight.dedupeKey.split(':');
    if (parts.length >= 4 && parts[0] === 'tight_handover') {
      vehicleId = parts[1];
      const currentId = parts[2];
      const nextId = parts[3];
      bookingId = nextId;
      conditionCodeVariant = `${currentId}:${nextId}`;
    }
  }

  if (!bookingId) return null;

  const customerId =
    typeof insight.metrics?.customerId === 'string' ? insight.metrics.customerId : undefined;

  return {
    eventType,
    bookingId,
    vehicleId,
    customerId,
    label: resolveVehicleLabel(insight),
    bookingRef: formatBookingRef(bookingId),
    insightSeverity: insight.severity,
    dedupeKey: insight.dedupeKey,
    sourceEventId: insight.dedupeKey,
    occurredAt: resolveOccurredAt(insight),
    conditionCodeVariant,
    minutesOverdue:
      typeof insight.metrics?.minutesOverdue === 'number'
        ? insight.metrics.minutesOverdue
        : undefined,
  };
}

export interface ReturnOverdueBookingRow {
  id: string;
  endDate: Date;
  vehicleId: string;
  customerId: string;
  vehicle?: { licensePlate: string | null; make: string | null; model: string | null } | null;
  customer?: { firstName: string | null; lastName: string | null } | null;
}

/** Build RETURN_OVERDUE source from an overdue ACTIVE booking row. */
export function returnOverdueSourceFromBooking(
  booking: ReturnOverdueBookingRow,
  referenceNow: Date,
): BookingHandoverAdapterSource {
  const graceMs = BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES * 60_000;
  const overdueAt = new Date(booking.endDate.getTime() + graceMs);
  const minutesOverdue = Math.max(
    0,
    Math.round((referenceNow.getTime() - overdueAt.getTime()) / 60_000),
  );

  const vehicleLabel =
    booking.vehicle?.licensePlate?.trim()
    || `${booking.vehicle?.make ?? ''} ${booking.vehicle?.model ?? ''}`.trim()
    || 'Fahrzeug';

  return {
    eventType: 'RETURN_OVERDUE',
    bookingId: booking.id,
    vehicleId: booking.vehicleId,
    customerId: booking.customerId,
    label: vehicleLabel,
    bookingRef: formatBookingRef(booking.id),
    insightSeverity:
      minutesOverdue >= 24 * 60 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING,
    dedupeKey: `return_overdue:${booking.id}`,
    sourceEventId: `return_overdue:${booking.id}`,
    occurredAt: booking.endDate,
    minutesOverdue,
  };
}

export function bookingHandoverFingerprint(
  organizationId: string,
  source: Pick<
    BookingHandoverAdapterSource,
    'eventType' | 'bookingId' | 'conditionCodeVariant'
  >,
): string {
  const def = requireEventTypeDefinition(source.eventType);
  const conditionCode = source.conditionCodeVariant?.trim()
    ? `${def.conditionCode}:${source.conditionCodeVariant.trim()}`
    : def.conditionCode;
  return buildNotificationFingerprint({
    organizationId,
    eventType: def.eventType,
    entityType: NotificationEntityType.BOOKING,
    entityId: source.bookingId,
    conditionCode,
    scopeVersion: def.fingerprintVersion,
  }).canonical;
}
