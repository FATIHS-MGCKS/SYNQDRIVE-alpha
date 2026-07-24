import type { StatusTone } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import type { TranslationKey } from '../../i18n/translations/en';
import { useLanguage } from '../../i18n/LanguageContext';
import { en } from '../../i18n/translations/en';
import type { BookingApiStatus } from './bookingTypes';

export type BookingUiStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'no_show';

const STATUS_LABEL_KEYS: Record<BookingUiStatus, TranslationKey> = {
  pending: 'booking.status.pending',
  confirmed: 'booking.status.confirmed',
  active: 'booking.status.active',
  completed: 'booking.status.completed',
  cancelled: 'booking.status.cancelled',
  no_show: 'booking.status.noShow',
};

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

export function bookingStatusLabel(
  status: BookingUiStatus,
  t?: (key: TranslationKey) => string,
): string {
  const translate = t ?? ((key: TranslationKey) => en[key] ?? key);
  return translate(STATUS_LABEL_KEYS[status]);
}

export function bookingStatusAriaLabel(
  status: BookingUiStatus,
  customerName?: string,
  t?: (key: TranslationKey) => string,
): string {
  const label = bookingStatusLabel(status, t);
  return customerName ? `${label}: ${customerName}` : label;
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

/** Icon name aligned with `Icon` component (vehicle schedule, agenda tiles). */
export function bookingStatusIcon(status: BookingUiStatus): string {
  switch (status) {
    case 'active':
      return 'clock';
    case 'pending':
      return 'alert-circle';
    case 'confirmed':
      return 'check-circle';
    case 'completed':
      return 'check-circle-2';
    case 'cancelled':
      return 'x-circle';
    case 'no_show':
      return 'user-x';
    default:
      return 'calendar';
  }
}

/** Surface class for compact timeline pills (`sq-tone-*` tokens). */
export function bookingTimelineBarClass(status: BookingUiStatus): string {
  switch (status) {
    case 'active':
      return 'sq-tone-brand border border-[color:var(--brand)]/25';
    case 'confirmed':
      return 'sq-tone-success border border-[color:var(--status-positive)]/25';
    case 'pending':
      return 'sq-tone-warning border border-[color:var(--status-attention)]/25';
    case 'completed':
      return 'sq-tone-neutral border border-border/70';
    case 'no_show':
      return 'sq-tone-critical border border-[color:var(--status-critical)]/30 opacity-90';
    case 'cancelled':
      return 'sq-tone-neutral border border-dashed border-border/80 opacity-60 line-through decoration-border/80';
    default:
      return 'sq-tone-neutral border border-border/70';
  }
}

/** Extra emphasis for vehicle availability timeline bars. */
export function bookingTimelineBarEmphasisClass(
  status: BookingUiStatus,
  isOverdue: boolean,
): string {
  if (isOverdue) {
    return 'ring-2 ring-[color:var(--status-critical)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--status-critical)_20%,transparent)] z-20';
  }
  if (status === 'active') {
    return 'ring-1 ring-[color:var(--brand)]/50 shadow-[var(--shadow-xs)] z-10';
  }
  if (status === 'no_show' || status === 'cancelled') {
    return 'z-0';
  }
  return 'z-[1]';
}

/** Solid bar fill for multi-vehicle Gantt (`BookingsTimelineView`). */
export function bookingTimelineSolidBarClass(status: BookingUiStatus): string {
  switch (status) {
    case 'active':
      return 'bg-[color:var(--brand)]';
    case 'confirmed':
      return 'bg-[color:var(--status-attention)]';
    case 'pending':
      return 'bg-[color:var(--status-attention)]/80';
    case 'completed':
      return 'bg-[color:var(--status-positive)]/70';
    case 'no_show':
      return 'bg-[color:var(--status-critical)]/80';
    case 'cancelled':
      return 'bg-muted-foreground/40';
    default:
      return 'bg-muted';
  }
}

export function BookingStatusBadge({ status }: { status: BookingUiStatus }) {
  const { t } = useLanguage();
  return (
    <StatusChip tone={bookingStatusTone(status)} dot={status === 'active'}>
      {bookingStatusLabel(status, t)}
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
