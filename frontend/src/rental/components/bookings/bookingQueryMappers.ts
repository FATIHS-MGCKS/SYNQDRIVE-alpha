import type { BookingStatusFilter } from './bookingTypes';

const STATUS_MAP: Record<Exclude<BookingStatusFilter, 'all'>, string> = {
  active: 'ACTIVE',
  confirmed: 'CONFIRMED',
  pending: 'PENDING',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  no_show: 'NO_SHOW',
};

export function statusFilterToApiStatuses(
  filter: BookingStatusFilter,
): string[] | undefined {
  if (filter === 'all') return undefined;
  return [STATUS_MAP[filter]];
}
