import type { BookingDetailDto } from '../../../../lib/api';
import type { TripTimelineTrip } from '../trips.types';
import { formatTripDistance } from './tripFormatters';
import { hasAbuseSuspicion } from './tripStatus';

export type RentalAlignmentKind =
  | 'within_rental'
  | 'outside_rental'
  | 'after_return'
  | 'before_pickup'
  | 'during_blocked'
  | 'no_active_booking'
  | 'context_unavailable';

export interface RentalAlignmentHint {
  kind: RentalAlignmentKind;
  label: string;
  description: string;
  tone: 'success' | 'watch' | 'critical' | 'neutral';
}

export interface TripBookingRef {
  id: string;
  bookingNumber: string;
  customerName: string;
  status: string;
  startDate: string;
  endDate: string;
  pickupStationName: string | null;
  returnStationName: string | null;
  kmIncluded: number | null;
  kmDriven: number | null;
}

export interface TripKmContext {
  tripKm: string;
  dayKm: string;
  bookingKm: string | null;
  potentialExcessKm: string | null;
  kmDeviation: string | null;
}

export interface TripRentalContextView {
  booking: TripBookingRef | null;
  bookingDetail: BookingDetailDto | null;
  alignment: RentalAlignmentHint[];
  km: TripKmContext;
  needsReview: boolean;
  reviewReason: string | null;
}

const RENTAL_ACTIVE_STATUSES = new Set(['ACTIVE', 'COMPLETED', 'CONFIRMED', 'PENDING']);

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function bookingRefFromListRow(raw: Record<string, unknown>): TripBookingRef | null {
  const id = String(raw.id ?? '');
  if (!id) return null;
  const start = String(raw.startDate ?? raw.startDateIso ?? '');
  const end = String(raw.endDate ?? raw.endDateIso ?? '');
  if (!start || !end) return null;

  const customer =
    raw.customerName ??
    (raw.customer as { name?: string; fullName?: string } | undefined)?.fullName ??
    (raw.customer as { name?: string } | undefined)?.name;

  return {
    id,
    bookingNumber: String(raw.bookingNumber ?? raw.reference ?? `BK-${id.slice(-6).toUpperCase()}`),
    customerName: String(customer ?? 'Unbekannter Kunde'),
    status: String(raw.statusEnum ?? raw.status ?? ''),
    startDate: start,
    endDate: end,
    pickupStationName:
      (raw.pickupStationName as string | null | undefined) ??
      (raw.pickupStation as { name?: string } | undefined)?.name ??
      null,
    returnStationName:
      (raw.returnStationName as string | null | undefined) ??
      (raw.returnStation as { name?: string } | undefined)?.name ??
      null,
    kmIncluded: typeof raw.kmIncluded === 'number' ? raw.kmIncluded : null,
    kmDriven: typeof raw.kmDriven === 'number' ? raw.kmDriven : null,
  };
}

export function bookingRefFromDetail(detail: BookingDetailDto): TripBookingRef {
  return {
    id: detail.core.bookingId,
    bookingNumber: detail.core.bookingNumber,
    customerName: detail.customer.fullName,
    status: detail.core.statusEnum,
    startDate: detail.core.startDate,
    endDate: detail.core.endDate,
    pickupStationName: detail.core.pickupStationName,
    returnStationName: detail.core.returnStationName,
    kmIncluded: detail.core.kmIncluded,
    kmDriven: detail.core.kmDriven,
  };
}

export function findBookingForTrip(
  trip: TripTimelineTrip,
  bookings: TripBookingRef[],
): TripBookingRef | null {
  if (trip.assignedBookingId) {
    const linked = bookings.find((b) => b.id === trip.assignedBookingId);
    if (linked) return linked;
    return {
      id: trip.assignedBookingId,
      bookingNumber: `BK-${trip.assignedBookingId.slice(-6).toUpperCase()}`,
      customerName: trip.driverName ?? 'Buchungskunde',
      status: trip.assignmentStatus === 'ASSIGNED_BOOKING_CUSTOMER' ? 'ACTIVE' : '',
      startDate: '',
      endDate: '',
      pickupStationName: null,
      returnStationName: null,
      kmIncluded: null,
      kmDriven: null,
    };
  }

  const tripStart = parseIso(trip.startTime);
  const tripEnd = parseIso(trip.endTime ?? trip.startTime);
  if (!tripStart || !tripEnd) return null;

  const candidates = bookings.filter((b) => {
    const status = b.status.toUpperCase();
    if (!RENTAL_ACTIVE_STATUSES.has(status)) return false;
    const bStart = parseIso(b.startDate);
    const bEnd = parseIso(b.endDate);
    if (!bStart || !bEnd) return false;
    return overlaps(tripStart, tripEnd, bStart, bEnd);
  });

  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )[0];
}

export function deriveRentalAlignmentHints(
  trip: TripTimelineTrip,
  booking: TripBookingRef | null,
  detail: BookingDetailDto | null,
): RentalAlignmentHint[] {
  if (!booking?.startDate || !booking.endDate) {
    if (trip.assignedBookingId || trip.assignmentStatus === 'ASSIGNED_BOOKING_CUSTOMER') {
      return [
        {
          kind: 'context_unavailable',
          label: 'Buchungskontext nicht verfügbar',
          description: 'Buchungszeiten konnten nicht geladen werden.',
          tone: 'neutral',
        },
      ];
    }
    if (
      !trip.isPrivateTrip &&
      trip.assignmentStatus !== 'ASSIGNED_DRIVER' &&
      trip.tripStatus === 'COMPLETED'
    ) {
      return [
        {
          kind: 'no_active_booking',
          label: 'Fahrt ohne aktive Buchung',
          description: 'Keine überlappende Mietbuchung für diesen Zeitraum gefunden.',
          tone: 'watch',
        },
      ];
    }
    return [];
  }

  const tripStart = parseIso(trip.startTime);
  const tripEnd = parseIso(trip.endTime ?? trip.startTime);
  const rentalStart =
    parseIso(detail?.handover.pickup?.completedAt ?? null) ?? parseIso(booking.startDate);
  const rentalEnd =
    parseIso(detail?.handover.return?.completedAt ?? null) ?? parseIso(booking.endDate);
  if (!tripStart || !tripEnd || !rentalStart || !rentalEnd) {
    return [
      {
        kind: 'context_unavailable',
        label: 'Buchungskontext nicht verfügbar',
        description: 'Zeitfenster konnten nicht verglichen werden.',
        tone: 'neutral',
      },
    ];
  }

  const hints: RentalAlignmentHint[] = [];

  if (detail?.health.rentalBlocked || detail?.vehicle.rentalBlocked) {
    hints.push({
      kind: 'during_blocked',
      label: 'Fahrzeug gesperrt',
      description:
        detail.health.blockingReasons.length > 0
          ? detail.health.blockingReasons.join(' · ')
          : 'Mietblockade oder Wartungsstatus zum Ladezeitpunkt.',
      tone: 'watch',
    });
  }

  const fullyInside = tripStart >= rentalStart && tripEnd <= rentalEnd;
  const startsBefore = tripStart < rentalStart;
  const endsAfter = tripEnd > rentalEnd;

  if (fullyInside && !startsBefore && !endsAfter) {
    hints.push({
      kind: 'within_rental',
      label: 'Fahrt innerhalb Mietzeit',
      description: 'Start und Ende liegen im verknüpften Mietzeitraum.',
      tone: 'success',
    });
  } else {
    if (startsBefore) {
      hints.push({
        kind: 'before_pickup',
        label: 'Fahrt vor Übergabe',
        description: 'Die Fahrt beginnt vor dem Mietbeginn bzw. der dokumentierten Übergabe.',
        tone: 'watch',
      });
    }
    if (endsAfter) {
      const afterReturn = detail?.handover.return != null;
      hints.push({
        kind: afterReturn ? 'after_return' : 'outside_rental',
        label: afterReturn ? 'Fahrt nach Rückgabe' : 'Fahrt außerhalb Mietzeit',
        description: afterReturn
          ? 'Die Fahrt endet nach der dokumentierten Rückgabe.'
          : 'Die Fahrt endet nach dem geplanten Mietende.',
        tone: 'critical',
      });
    }
    if (!startsBefore && !endsAfter && !fullyInside) {
      hints.push({
        kind: 'outside_rental',
        label: 'Fahrt außerhalb Mietzeit',
        description: 'Die Fahrt liegt nur teilweise im Mietzeitraum.',
        tone: 'watch',
      });
    }
  }

  return hints;
}

export function deriveKmContext(
  trip: TripTimelineTrip,
  dayTrips: TripTimelineTrip[],
  booking: TripBookingRef | null,
): TripKmContext {
  const tripKmVal = trip.distanceKm ?? 0;
  const dayKmVal = dayTrips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);

  let bookingKm: string | null = null;
  let potentialExcess: string | null = null;
  let deviation: string | null = null;

  if (booking?.kmDriven != null) {
    bookingKm = formatTripDistance(booking.kmDriven);
    if (booking.kmIncluded != null && booking.kmIncluded > 0) {
      const excess = booking.kmDriven - booking.kmIncluded;
      if (excess > 0) {
        potentialExcess = formatTripDistance(excess);
      }
    }
  }

  if (booking?.kmIncluded != null && booking.kmDriven != null) {
    const delta = booking.kmDriven - booking.kmIncluded;
    if (Math.abs(delta) >= 1) {
      deviation = `${delta > 0 ? '+' : ''}${formatTripDistance(delta)}`;
    }
  }

  return {
    tripKm: formatTripDistance(tripKmVal),
    dayKm: formatTripDistance(dayKmVal),
    bookingKm,
    potentialExcessKm: potentialExcess,
    kmDeviation: deviation,
  };
}

export function needsAssignmentReview(
  trip: TripTimelineTrip,
  booking: TripBookingRef | null,
): { needsReview: boolean; reason: string | null } {
  if (trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') {
    return { needsReview: false, reason: null };
  }
  const unassigned =
    trip.assignmentStatus === 'UNKNOWN_ASSIGNMENT';
  const noBooking =
    !booking &&
    !trip.assignedBookingId &&
    trip.assignmentStatus !== 'ASSIGNED_BOOKING_CUSTOMER' &&
    trip.assignmentStatus !== 'ASSIGNED_DRIVER';

  if (unassigned && (hasAbuseSuspicion(trip) || noBooking)) {
    return {
      needsReview: true,
      reason: 'Zuordnung oder Buchungsbezug unklar — bei auffälliger Fahrt prüfen.',
    };
  }
  if (noBooking && trip.tripStatus === 'COMPLETED') {
    return {
      needsReview: true,
      reason: 'Keine Buchung verknüpft — Mietkontext manuell prüfen.',
    };
  }
  return { needsReview: false, reason: null };
}

export function isEvidenceWorthyTrip(trip: TripTimelineTrip): boolean {
  if (hasAbuseSuspicion(trip)) return true;
  if (trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') return true;
  if (!trip.assignedBookingId && trip.assignmentStatus !== 'ASSIGNED_BOOKING_CUSTOMER') {
    return trip.tripStatus === 'COMPLETED';
  }
  return false;
}

export function buildTripRentalContextView(
  trip: TripTimelineTrip,
  dayTrips: TripTimelineTrip[],
  bookings: TripBookingRef[],
  detailById: Record<string, BookingDetailDto>,
): TripRentalContextView {
  const booking = findBookingForTrip(trip, bookings);
  const bookingDetail = booking ? detailById[booking.id] ?? null : null;
  const resolvedBooking = bookingDetail ? bookingRefFromDetail(bookingDetail) : booking;
  const alignment = deriveRentalAlignmentHints(trip, resolvedBooking, bookingDetail);
  const km = deriveKmContext(trip, dayTrips, resolvedBooking);
  const review = needsAssignmentReview(trip, resolvedBooking);

  return {
    booking: resolvedBooking,
    bookingDetail,
    alignment,
    km,
    needsReview: review.needsReview,
    reviewReason: review.reason,
  };
}

export function alignmentToChipTone(
  tone: RentalAlignmentHint['tone'],
): 'neutral' | 'info' | 'watch' | 'critical' | 'private' | 'success' {
  switch (tone) {
    case 'success':
      return 'success';
    case 'watch':
      return 'watch';
    case 'critical':
      return 'critical';
    default:
      return 'neutral';
  }
}
