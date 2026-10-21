export const operatorBookingsCancelNoShowDe = {
  'operator.bookings.cancelNoShow.cancel.title': 'Buchung stornieren',
  'operator.bookings.cancelNoShow.cancel.warningTitle': 'Stornierung ≠ No-Show',
  'operator.bookings.cancelNoShow.cancel.warningBody':
    'Stornieren bedeutet, die Buchung vorab abzusagen. Wenn der Kunde nicht erschienen ist, nutze stattdessen „No-Show markieren“.',
  'operator.bookings.cancelNoShow.cancel.deniedTitle': 'Stornierung nicht möglich',
  'operator.bookings.cancelNoShow.cancel.deniedDefaultReason':
    'Dieser Status erlaubt keine Stornierung.',
  'operator.bookings.cancelNoShow.cancel.internalNoteLabel':
    'Interner Hinweis (optional, wird nicht an die API gesendet)',
  'operator.bookings.cancelNoShow.cancel.internalNotePlaceholder':
    'z. B. Kunde hat telefonisch abgesagt…',
  'operator.bookings.cancelNoShow.cancel.submit': 'Buchung stornieren',
  'operator.bookings.cancelNoShow.cancel.submitting': 'Storniere…',
  'operator.bookings.cancelNoShow.noShow.title': 'No-Show markieren',
  'operator.bookings.cancelNoShow.noShow.warningTitle': 'Kunde nicht erschienen',
  'operator.bookings.cancelNoShow.noShow.warningBody':
    'No-Show bedeutet: Der Kunde ist zum geplanten Abholzeitpunkt nicht erschienen. Das ist keine normale Stornierung und wird separat ausgewertet.',
  'operator.bookings.cancelNoShow.noShow.deniedTitle': 'No-Show nicht möglich',
  'operator.bookings.cancelNoShow.noShow.reasonPlaceholder':
    'z. B. Keine Antwort, nicht am Schalter…',
  'operator.bookings.cancelNoShow.noShow.submit': 'No-Show markieren',
  'operator.bookings.cancelNoShow.noShow.submitting': 'Speichere…',
  'operator.bookings.cancelNoShow.plannedPickup': 'Geplanter Pickup',
  'operator.bookings.cancelNoShow.loading': 'Laden…',
  'operator.bookings.cancelNoShow.error.bookingNotSpecified': 'Buchung nicht angegeben',
  'operator.bookings.cancelNoShow.error.bookingNotFound': 'Buchung nicht gefunden',
  'operator.bookings.cancelNoShow.gate.cancelNotInStatus':
    'Stornierung in diesem Status nicht möglich',
  'operator.bookings.cancelNoShow.gate.noShowConfirmedOnly':
    'No-Show nur bei bestätigten Buchungen möglich',
  'operator.bookings.cancelNoShow.gate.pickupAlreadyRecorded': 'Pickup bereits erfasst',
  'operator.bookings.cancelNoShow.gate.pickupInFuture':
    'Geplanter Abholzeitpunkt liegt noch in der Zukunft',
  'operator.bookings.cancelNoShow.toast.cancelled': 'Buchung storniert',
  'operator.bookings.cancelNoShow.toast.noShowMarked': 'Als No-Show markiert',
} as const;
