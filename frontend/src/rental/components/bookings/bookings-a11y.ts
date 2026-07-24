/** Shared focus, touch-target, and screen-reader helpers for booking planner surfaces. */

/** Visible focus ring aligned with existing SynqDrive brand tokens. */
export const BOOKING_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-1';

/** Minimum interactive target (~44 CSS px) without changing visual density on desktop. */
export const BOOKING_TOUCH_TARGET = 'inline-flex items-center justify-center min-h-11 min-w-11';

/** Compact nav control (prev/next) with touch-friendly hit area. */
export const BOOKING_NAV_BUTTON =
  'inline-flex items-center justify-center min-h-11 min-w-11 px-2 text-[10px] rounded border border-border hover:bg-muted/40';

export function bookingPlannerNavButtonClass(): string {
  return `${BOOKING_NAV_BUTTON} ${BOOKING_FOCUS_RING}`;
}

export function bookingChipAriaLabel(ref: string, customer: string): string {
  return `Buchung ${ref}, Kunde ${customer}`;
}

export function bookingRowActionAria(ref: string, action: 'edit' | 'cancel'): string {
  return action === 'edit' ? `Buchung ${ref} bearbeiten` : `Buchung ${ref} stornieren`;
}

export function bookingSortHeaderAria(
  label: string,
  column: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
): string {
  if (sortBy !== column) return `${label} sortieren`;
  return `${label} sortiert ${sortOrder === 'asc' ? 'aufsteigend' : 'absteigend'}`;
}
