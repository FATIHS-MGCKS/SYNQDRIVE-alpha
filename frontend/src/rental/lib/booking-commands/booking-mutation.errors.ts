import { getErrorMessage } from '../../../lib/api';
import type { BookingMutationErrorKind, BookingMutationErrorView } from './booking-edit-form.types';

function detectKind(message: string): BookingMutationErrorKind {
  const lower = message.toLowerCase();
  if (
    lower.includes('version') ||
    lower.includes('konflikt') ||
    lower.includes('conflict') ||
    lower.includes('stale') ||
    lower.includes('zwischenzeitlich geändert')
  ) {
    return 'version_conflict';
  }
  if (
    lower.includes('forbidden') ||
    lower.includes('nicht berechtigt') ||
    lower.includes('permission') ||
    lower.includes('zugriff verweigert') ||
    lower.includes('403')
  ) {
    return 'permission_denied';
  }
  if (lower.includes('bereits gebucht') || lower.includes('vehicle_booking_overlap')) {
    return 'overlap';
  }
  if (lower.includes('nicht vermietbar') || lower.includes('rental_blocked')) {
    return 'rental_blocked';
  }
  if (lower.includes('pricing_quote_required') || lower.includes('preisquote')) {
    return 'pricing_quote_required';
  }
  if (
    lower.includes('booking_activation_requires_handover') ||
    lower.includes('status') && lower.includes('handover')
  ) {
    return 'status_command_required';
  }
  if (lower.includes('enddate must be after') || lower.includes('ungültig') || lower.includes('invalid booking')) {
    return 'validation';
  }
  return 'unknown';
}

export function formatBookingMutationError(err: unknown, fallback = 'Aktion fehlgeschlagen'): BookingMutationErrorView {
  const message = getErrorMessage(err, fallback);
  const kind = detectKind(message);

  switch (kind) {
    case 'version_conflict':
      return {
        kind,
        title: 'Buchung wurde zwischenzeitlich geändert',
        description:
          'Ein anderer Nutzer oder eine andere Ansicht hat diese Buchung bereits aktualisiert. Bitte laden Sie die Buchung neu und wiederholen Sie die Änderung.',
      };
    case 'permission_denied':
      return { kind, title: 'Keine Berechtigung', description: message };
    case 'overlap':
      return { kind, title: 'Fahrzeug bereits gebucht', description: message };
    case 'rental_blocked':
      return { kind, title: 'Fahrzeug blockiert', description: message };
    case 'pricing_quote_required':
      return {
        kind,
        title: 'Neue Preisquote erforderlich',
        description:
          'Für bestätigte Buchungen mit geändertem Fahrzeug oder Zeitraum ist eine aktuelle Preisquote nötig. Bitte Preisberechnung durchführen.',
      };
    case 'status_command_required':
      return {
        kind,
        title: 'Statusänderung nicht per Bearbeitung',
        description: 'Statuswechsel erfolgen über Pickup-, Return-, Storno- oder No-Show-Aktionen.',
      };
    case 'validation':
      return { kind, title: 'Ungültige Eingabe', description: message };
    default:
      return { kind, title: 'Aktion fehlgeschlagen', description: message };
  }
}
