/** Known invariants that admin overrides may affect — used for audit classification. */
export const BOOKING_STATUS_OVERRIDE_INVARIANTS = [
  'STATUS_MACHINE_BYPASS',
  'TERMINAL_REACTIVATION',
  'VEHICLE_AVAILABILITY',
  'INVOICE_STATE',
  'PAYMENT_STATE',
  'HANDOVER_PROTOCOL',
  'DOCUMENT_STATE',
] as const;

export type BookingStatusOverrideInvariant =
  (typeof BOOKING_STATUS_OVERRIDE_INVARIANTS)[number];

export function isBookingStatusOverrideInvariant(
  value: string,
): value is BookingStatusOverrideInvariant {
  return (BOOKING_STATUS_OVERRIDE_INVARIANTS as readonly string[]).includes(value);
}

export function inferOverrideInvariants(input: {
  fromStatus: string;
  toStatus: string;
}): BookingStatusOverrideInvariant[] {
  const invariants = new Set<BookingStatusOverrideInvariant>(['STATUS_MACHINE_BYPASS']);

  const terminal = new Set(['CANCELLED', 'NO_SHOW', 'COMPLETED']);
  if (terminal.has(input.fromStatus) && !terminal.has(input.toStatus)) {
    invariants.add('TERMINAL_REACTIVATION');
  }
  if (input.toStatus === 'ACTIVE' || input.fromStatus === 'ACTIVE') {
    invariants.add('VEHICLE_AVAILABILITY');
  }
  if (input.toStatus === 'CANCELLED' || input.toStatus === 'NO_SHOW') {
    invariants.add('INVOICE_STATE');
    invariants.add('PAYMENT_STATE');
    invariants.add('DOCUMENT_STATE');
  }
  if (input.toStatus === 'ACTIVE' || input.toStatus === 'COMPLETED') {
    invariants.add('HANDOVER_PROTOCOL');
  }

  return [...invariants];
}
