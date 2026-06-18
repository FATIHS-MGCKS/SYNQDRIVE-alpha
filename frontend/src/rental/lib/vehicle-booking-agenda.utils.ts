import {
  allowedBookingActions,
  type BookingUiStatus,
} from '../components/bookings/bookingStatus';

const MS_HOUR = 60 * 60 * 1000;
const HANDOVER_WINDOW_MS = 72 * MS_HOUR;

export interface VehicleAgendaBooking {
  id: string;
  customerName: string;
  status: BookingUiStatus;
  startDate: Date;
  endDate: Date;
  pickupLocation: string;
  returnLocation: string;
  totalPriceCents: number | null;
  days: number;
  hasPickup: boolean;
  hasReturn: boolean;
  isOverdue: boolean;
  needsPickup: boolean;
  needsReturn: boolean;
}

export type VehicleAgendaGroupId =
  | 'active'
  | 'next_handovers'
  | 'upcoming'
  | 'completed'
  | 'terminal';

export interface VehicleAgendaGroup {
  id: VehicleAgendaGroupId;
  label: string;
  description: string;
  bookings: VehicleAgendaBooking[];
  tone: 'critical' | 'info' | 'watch' | 'success' | 'neutral';
}

export type VehicleAgendaSafeAction = 'open' | 'pickup' | 'return' | 'documents';

const GROUP_META: Record<
  VehicleAgendaGroupId,
  { label: string; description: string; tone: VehicleAgendaGroup['tone'] }
> = {
  active: {
    label: 'Jetzt aktiv',
    description: 'Laufende Vermietungen und überfällige Rückgaben',
    tone: 'info',
  },
  next_handovers: {
    label: 'Nächste Übergaben',
    description: 'Pickups und Rückgaben in den nächsten 72 Stunden',
    tone: 'watch',
  },
  upcoming: {
    label: 'Kommende Buchungen',
    description: 'Bestätigte und ausstehende Reservierungen',
    tone: 'success',
  },
  completed: {
    label: 'Abgeschlossen',
    description: 'Beendete Buchungen im gewählten Zeitraum',
    tone: 'neutral',
  },
  terminal: {
    label: 'Storniert / No-Show',
    description: 'Nicht operative Buchungen',
    tone: 'neutral',
  },
};

export function enrichAgendaBooking(
  row: Omit<
    VehicleAgendaBooking,
    'isOverdue' | 'needsPickup' | 'needsReturn' | 'hasPickup' | 'hasReturn'
  > & {
    hasPickup: boolean;
    hasReturn: boolean;
  },
  now = Date.now(),
): VehicleAgendaBooking {
  const isOverdue =
    (row.status === 'active' && row.endDate.getTime() < now) ||
    ((row.status === 'confirmed' || row.status === 'pending') &&
      !row.hasPickup &&
      row.startDate.getTime() < now);

  return {
    ...row,
    isOverdue,
    needsPickup:
      (row.status === 'confirmed' || row.status === 'pending') && !row.hasPickup,
    needsReturn: row.status === 'active' && row.hasPickup && !row.hasReturn,
  };
}

function classifyBooking(
  booking: VehicleAgendaBooking,
  now: number,
): VehicleAgendaGroupId {
  if (booking.status === 'cancelled' || booking.status === 'no_show') return 'terminal';
  if (booking.status === 'completed') return 'completed';
  if (booking.status === 'active') return 'active';

  const untilStart = booking.startDate.getTime() - now;
  const isImminentPickup =
    (booking.status === 'confirmed' || booking.status === 'pending') &&
    !booking.hasPickup &&
    (untilStart <= HANDOVER_WINDOW_MS || booking.startDate.getTime() < now);

  if (isImminentPickup) return 'next_handovers';
  return 'upcoming';
}

function sortGroup(id: VehicleAgendaGroupId, items: VehicleAgendaBooking[]): VehicleAgendaBooking[] {
  const copy = [...items];
  switch (id) {
    case 'active':
      return copy.sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.endDate.getTime() - b.endDate.getTime();
      });
    case 'next_handovers':
    case 'upcoming':
      return copy.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    case 'completed':
    case 'terminal':
      return copy.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    default:
      return copy;
  }
}

export function groupVehicleAgendaBookings(
  bookings: VehicleAgendaBooking[],
  now = Date.now(),
): VehicleAgendaGroup[] {
  const buckets: Record<VehicleAgendaGroupId, VehicleAgendaBooking[]> = {
    active: [],
    next_handovers: [],
    upcoming: [],
    completed: [],
    terminal: [],
  };

  for (const booking of bookings) {
    buckets[classifyBooking(booking, now)].push(booking);
  }

  const order: VehicleAgendaGroupId[] = [
    'active',
    'next_handovers',
    'upcoming',
    'completed',
    'terminal',
  ];

  return order
    .map((id) => ({
      id,
      ...GROUP_META[id],
      bookings: sortGroup(id, buckets[id]),
    }))
    .filter((g) => g.bookings.length > 0);
}

export function handoverListStatus(booking: VehicleAgendaBooking): string | null {
  if (booking.hasReturn) return 'Rückgabe erfasst';
  if (booking.hasPickup) return 'Abholung erfasst';
  if (booking.status === 'active') return 'Rückgabe ausstehend';
  if (booking.status === 'confirmed' || booking.status === 'pending') return 'Pickup ausstehend';
  return null;
}

export function getVehicleAgendaSafeActions(booking: VehicleAgendaBooking): VehicleAgendaSafeAction[] {
  const allowed = allowedBookingActions(booking.status, booking.hasPickup);
  const actions: VehicleAgendaSafeAction[] = ['open'];
  if (allowed.includes('pickup') && booking.needsPickup) actions.push('pickup');
  if (allowed.includes('return') && booking.needsReturn) actions.push('return');
  if (allowed.includes('documents')) actions.push('documents');
  return actions;
}

export function vehicleAgendaActionLabel(action: VehicleAgendaSafeAction): string {
  switch (action) {
    case 'open':
      return 'Öffnen';
    case 'pickup':
      return 'Pickup starten';
    case 'return':
      return 'Return starten';
    case 'documents':
      return 'Dokumente';
    default:
      return action;
  }
}
