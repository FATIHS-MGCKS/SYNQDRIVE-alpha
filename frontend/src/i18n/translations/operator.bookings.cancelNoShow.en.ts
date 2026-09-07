export const operatorBookingsCancelNoShowEn = {
  'operator.bookings.cancelNoShow.cancel.title': 'Cancel booking',
  'operator.bookings.cancelNoShow.cancel.warningTitle': 'Cancellation ≠ no-show',
  'operator.bookings.cancelNoShow.cancel.warningBody':
    'Cancelling means proactively calling off the booking before pickup. If the customer did not show up, use “Mark as no-show” instead.',
  'operator.bookings.cancelNoShow.cancel.deniedTitle': 'Cancellation not possible',
  'operator.bookings.cancelNoShow.cancel.deniedDefaultReason': 'This status does not allow cancellation.',
  'operator.bookings.cancelNoShow.cancel.internalNoteLabel':
    'Internal note (optional, not sent to the API)',
  'operator.bookings.cancelNoShow.cancel.internalNotePlaceholder':
    'e.g. Customer cancelled by phone…',
  'operator.bookings.cancelNoShow.cancel.submit': 'Cancel booking',
  'operator.bookings.cancelNoShow.cancel.submitting': 'Cancelling…',
  'operator.bookings.cancelNoShow.noShow.title': 'Mark as no-show',
  'operator.bookings.cancelNoShow.noShow.warningTitle': 'Customer did not show up',
  'operator.bookings.cancelNoShow.noShow.warningBody':
    'No-show means the customer did not appear at the planned pickup time. This is not a normal cancellation and is tracked separately.',
  'operator.bookings.cancelNoShow.noShow.deniedTitle': 'No-show not possible',
  'operator.bookings.cancelNoShow.noShow.reasonPlaceholder':
    'e.g. No response, not at the counter…',
  'operator.bookings.cancelNoShow.noShow.submit': 'Mark as no-show',
  'operator.bookings.cancelNoShow.noShow.submitting': 'Saving…',
  'operator.bookings.cancelNoShow.plannedPickup': 'Planned pickup',
  'operator.bookings.cancelNoShow.loading': 'Loading…',
  'operator.bookings.cancelNoShow.error.bookingNotSpecified': 'Booking not specified',
  'operator.bookings.cancelNoShow.error.bookingNotFound': 'Booking not found',
  'operator.bookings.cancelNoShow.gate.cancelNotInStatus': 'Cancellation is not possible in this status',
  'operator.bookings.cancelNoShow.gate.noShowConfirmedOnly':
    'No-show is only possible for confirmed bookings',
  'operator.bookings.cancelNoShow.gate.pickupAlreadyRecorded': 'Pickup already recorded',
  'operator.bookings.cancelNoShow.gate.pickupInFuture': 'Planned pickup time is still in the future',
  'operator.bookings.cancelNoShow.toast.cancelled': 'Booking cancelled',
  'operator.bookings.cancelNoShow.toast.noShowMarked': 'Marked as no-show',
} as const;
