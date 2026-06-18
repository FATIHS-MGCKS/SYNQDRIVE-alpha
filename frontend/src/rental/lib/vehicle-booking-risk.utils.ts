import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import type { ReadinessCheckpoint } from './vehicle-booking-readiness.utils';
import type { VehicleAgendaBooking } from './vehicle-booking-agenda.utils';
import { enrichAgendaBooking } from './vehicle-booking-agenda.utils';

export type VehicleBookingRiskCategory =
  | 'system_conflict'
  | 'preparation_open'
  | 'health_hint';

export type VehicleBookingRiskSeverity = 'info' | 'watch' | 'critical';

export interface VehicleBookingRiskItem {
  id: string;
  category: VehicleBookingRiskCategory;
  severity: VehicleBookingRiskSeverity;
  label: string;
  hint?: string;
  bookingIds?: string[];
  icon: string;
}

export interface BookingAgendaRiskHint {
  bookingId: string;
  message: string;
  severity: VehicleBookingRiskSeverity;
  category: VehicleBookingRiskCategory;
}

const BLOCKING_STATUSES: BookingUiStatus[] = ['pending', 'confirmed', 'active'];

export function isBlockingBookingStatus(status: BookingUiStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

function bookingsOverlap(a: VehicleAgendaBooking, b: VehicleAgendaBooking): boolean {
  return (
    a.startDate.getTime() < b.endDate.getTime() && a.endDate.getTime() > b.startDate.getTime()
  );
}

export function findOverlappingBookingIds(
  bookings: VehicleAgendaBooking[],
): Set<string> {
  const blocking = bookings.filter((b) => isBlockingBookingStatus(b.status));
  const ids = new Set<string>();

  for (let i = 0; i < blocking.length; i += 1) {
    for (let j = i + 1; j < blocking.length; j += 1) {
      if (bookingsOverlap(blocking[i]!, blocking[j]!)) {
        ids.add(blocking[i]!.id);
        ids.add(blocking[j]!.id);
      }
    }
  }

  return ids;
}

export function findActiveEndsAfterPickupIds(
  bookings: VehicleAgendaBooking[],
  now = Date.now(),
): Set<string> {
  const ids = new Set<string>();
  const activeBookings = bookings.filter((b) => b.status === 'active');
  const upcomingPickups = bookings
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'pending') &&
        b.startDate.getTime() > now,
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  if (activeBookings.length === 0 || upcomingPickups.length === 0) return ids;

  const nextPickup = upcomingPickups[0]!;

  for (const active of activeBookings) {
    if (active.endDate.getTime() > nextPickup.startDate.getTime()) {
      ids.add(active.id);
      ids.add(nextPickup.id);
    }
  }

  return ids;
}

export function hasStationMismatch(booking: VehicleAgendaBooking): boolean {
  const pickup = booking.pickupLocation.trim().toLowerCase();
  const ret = booking.returnLocation.trim().toLowerCase();
  if (!pickup || !ret) return false;
  if (pickup.includes('offen') || ret.includes('offen')) return false;
  return pickup !== ret;
}

export function detectSystemConflicts(
  bookings: VehicleAgendaBooking[],
  now = Date.now(),
): VehicleBookingRiskItem[] {
  const enriched = bookings.map((b) => enrichAgendaBooking(b, now));
  const overlapIds = findOverlappingBookingIds(enriched);
  const pickupCollisionIds = findActiveEndsAfterPickupIds(enriched, now);
  const overdueActive = enriched.filter((b) => b.status === 'active' && b.isOverdue);

  const items: VehicleBookingRiskItem[] = [];

  if (overlapIds.size > 0) {
    items.push({
      id: 'overlap',
      category: 'system_conflict',
      severity: 'critical',
      label: 'Zeitüberschneidung',
      hint: `${overlapIds.size} Buchung(en) überlappen im Plan`,
      bookingIds: [...overlapIds],
      icon: 'layers',
    });
  }

  if (pickupCollisionIds.size > 0) {
    items.push({
      id: 'active-after-pickup',
      category: 'system_conflict',
      severity: 'watch',
      label: 'Rückgabe nach Pickup',
      hint: 'Aktive Buchung endet nach nächstem geplanten Pickup',
      bookingIds: [...pickupCollisionIds],
      icon: 'calendar-clock',
    });
  }

  if (overdueActive.length > 0) {
    items.push({
      id: 'overdue-active',
      category: 'system_conflict',
      severity: 'critical',
      label: 'Überfällige Rückgabe',
      hint: `${overdueActive.length} aktive Buchung(en) mit Rückgabe in der Vergangenheit`,
      bookingIds: overdueActive.map((b) => b.id),
      icon: 'alert-circle',
    });
  }

  const stationMismatch = enriched.filter(
    (b) => isBlockingBookingStatus(b.status) && hasStationMismatch(b),
  );
  if (stationMismatch.length > 0) {
    items.push({
      id: 'station-mismatch',
      category: 'system_conflict',
      severity: 'info',
      label: 'One-Way Stationen',
      hint: `${stationMismatch.length} Buchung(en) mit abweichendem Pickup/Return`,
      bookingIds: stationMismatch.map((b) => b.id),
      icon: 'map-pin',
    });
  }

  return items;
}

export function getTimelineConflictBookingIds(
  bookings: VehicleAgendaBooking[],
  now = Date.now(),
): Set<string> {
  const enriched = bookings.map((b) => enrichAgendaBooking(b, now));
  const ids = new Set<string>();
  for (const id of findOverlappingBookingIds(enriched)) ids.add(id);
  for (const id of findActiveEndsAfterPickupIds(enriched, now)) ids.add(id);
  for (const b of enriched) {
    if (b.status === 'active' && b.isOverdue) ids.add(b.id);
  }
  return ids;
}

const HEALTH_CHECKPOINT_IDS = new Set(['health']);
const PREP_CHECKPOINT_IDS = new Set([
  'RENTAL_CONTRACT',
  'BOOKING_INVOICE',
  'DEPOSIT_RECEIPT',
  'legal',
  'payment',
  'deposit',
  'handover-pickup',
  'handover-return',
  'tasks',
  'eligibility',
]);

export function risksFromReadinessCheckpoints(
  checkpoints: ReadinessCheckpoint[],
): VehicleBookingRiskItem[] {
  return checkpoints
    .filter((cp) => cp.state !== 'ok' && cp.state !== 'unavailable')
    .map((cp) => ({
      id: `readiness-${cp.id}`,
      category: categoryForCheckpoint(cp.id),
      severity: severityForCheckpointState(cp.state),
      label: cp.label,
      hint: cp.hint,
      icon: cp.icon,
    }));
}

function categoryForCheckpoint(id: string): VehicleBookingRiskCategory {
  if (HEALTH_CHECKPOINT_IDS.has(id)) return 'health_hint';
  if (PREP_CHECKPOINT_IDS.has(id)) return 'preparation_open';
  return 'preparation_open';
}

function severityForCheckpointState(
  state: ReadinessCheckpoint['state'],
): VehicleBookingRiskSeverity {
  if (state === 'blocked') return 'critical';
  if (state === 'warning') return 'watch';
  return 'info';
}

export function buildAgendaRiskHints(
  bookings: VehicleAgendaBooking[],
  now = Date.now(),
): Record<string, BookingAgendaRiskHint[]> {
  const enriched = bookings.map((b) => enrichAgendaBooking(b, now));
  const overlapIds = findOverlappingBookingIds(enriched);
  const pickupCollisionIds = findActiveEndsAfterPickupIds(enriched, now);
  const hints: Record<string, BookingAgendaRiskHint[]> = {};

  const push = (bookingId: string, hint: Omit<BookingAgendaRiskHint, 'bookingId'>) => {
    if (!bookingId) return;
    const row: BookingAgendaRiskHint = { bookingId, ...hint };
    hints[bookingId] = hints[bookingId] ?? [];
    if (!hints[bookingId]!.some((h) => h.message === row.message)) {
      hints[bookingId]!.push(row);
    }
  };

  for (const booking of enriched) {
    if (booking.status === 'active' && booking.isOverdue) {
      push(booking.id, {
        message: 'Rückgabe überfällig — Status noch aktiv',
        severity: 'critical',
        category: 'system_conflict',
      });
    }

    if (overlapIds.has(booking.id)) {
      push(booking.id, {
        message: 'Zeitüberschneidung mit anderer Buchung',
        severity: 'watch',
        category: 'system_conflict',
      });
    }

    if (pickupCollisionIds.has(booking.id)) {
      const message =
        booking.status === 'active'
          ? 'Rückgabe liegt nach nächstem geplanten Pickup'
          : 'Pickup vor erwarteter Rückgabe der aktiven Buchung';
      push(booking.id, {
        message,
        severity: 'watch',
        category: 'system_conflict',
      });
    }

    if (isBlockingBookingStatus(booking.status) && hasStationMismatch(booking)) {
      push(booking.id, {
        message: `Stationen: ${booking.pickupLocation} → ${booking.returnLocation}`,
        severity: 'info',
        category: 'system_conflict',
      });
    }

    if (booking.needsPickup) {
      push(booking.id, {
        message: 'Pickup-Übergabe noch offen',
        severity: 'watch',
        category: 'preparation_open',
      });
    }

    if (booking.needsReturn) {
      push(booking.id, {
        message: 'Return-Übergabe noch offen',
        severity: 'watch',
        category: 'preparation_open',
      });
    }
  }

  return hints;
}

export function riskCategoryLabel(category: VehicleBookingRiskCategory): string {
  switch (category) {
    case 'system_conflict':
      return 'Systemkonflikt';
    case 'preparation_open':
      return 'Vorbereitung offen';
    case 'health_hint':
      return 'Health/Rental Hinweis';
    default:
      return category;
  }
}

export function riskSeverityTone(
  severity: VehicleBookingRiskSeverity,
): 'info' | 'watch' | 'critical' | 'neutral' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'watch':
      return 'watch';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}
