import type { StatusTone } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import type { BookingApiStatus } from './bookingTypes';

export type BookingUiStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export function normalizeBookingStatus(
  statusEnum?: string | null,
  displayStatus?: string | null,
): BookingUiStatus {
  const raw = (statusEnum ?? displayStatus ?? '').toString().toUpperCase().replace(/\s+/g, '_');
  if (raw === 'NO_SHOW' || raw === 'NO-SHOW') return 'no_show';
  if (raw === 'CANCELLED' || raw === 'CANCELED') return 'cancelled';
  if (raw === 'ACTIVE') return 'active';
  if (raw === 'CONFIRMED') return 'confirmed';
  if (raw === 'COMPLETED') return 'completed';
  if (raw === 'PENDING') return 'pending';
  const v = (displayStatus ?? '').toLowerCase();
  if (v === 'no show') return 'no_show';
  if (v === 'cancelled') return 'cancelled';
  if (v === 'active') return 'active';
  if (v === 'confirmed') return 'confirmed';
  if (v === 'completed') return 'completed';
  if (v === 'pending') return 'pending';
  return 'pending';
}

export function bookingStatusLabel(status: BookingUiStatus): string {
  switch (status) {
    case 'pending':
      return 'Ausstehend';
    case 'confirmed':
      return 'Bestätigt';
    case 'active':
      return 'Aktiv';
    case 'completed':
      return 'Abgeschlossen';
    case 'cancelled':
      return 'Storniert';
    case 'no_show':
      return 'No-Show';
    default:
      return status;
  }
}

export function bookingStatusTone(status: BookingUiStatus): StatusTone {
  switch (status) {
    case 'active':
      return 'info';
    case 'pending':
      return 'warning';
    case 'confirmed':
      return 'success';
    case 'completed':
      return 'neutral';
    case 'cancelled':
      return 'neutral';
    case 'no_show':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function BookingStatusBadge({ status }: { status: BookingUiStatus }) {
  return (
    <StatusChip tone={bookingStatusTone(status)} dot={status === 'active'}>
      {bookingStatusLabel(status)}
    </StatusChip>
  );
}

export type BookingAction =
  | 'edit'
  | 'cancel'
  | 'no_show'
  | 'pickup'
  | 'return'
  | 'documents';

export function allowedBookingActions(status: BookingUiStatus, hasPickup: boolean): BookingAction[] {
  switch (status) {
    case 'pending':
      return ['edit', 'cancel'];
    case 'confirmed':
      return hasPickup ? ['edit', 'cancel', 'no_show', 'pickup'] : ['edit', 'cancel', 'no_show', 'pickup'];
    case 'active':
      return ['return', 'documents'];
    case 'completed':
      return ['documents'];
    case 'cancelled':
    case 'no_show':
      return [];
    default:
      return [];
  }
}

export function isTerminalBookingStatus(status: BookingUiStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'no_show';
}

export function apiStatusFromFilter(filter: string): BookingApiStatus | null {
  switch (filter) {
    case 'pending':
      return 'PENDING';
    case 'confirmed':
      return 'CONFIRMED';
    case 'active':
      return 'ACTIVE';
    case 'completed':
      return 'COMPLETED';
    case 'cancelled':
      return 'CANCELLED';
    case 'no_show':
      return 'NO_SHOW';
    default:
      return null;
  }
}
