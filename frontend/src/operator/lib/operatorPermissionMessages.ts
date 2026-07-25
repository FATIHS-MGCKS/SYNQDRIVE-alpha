import type { OperatorPermissionAction } from './operatorPermissions';

/**
 * UX-only denial copy for Operator actions.
 * Backend RBAC remains authoritative — these strings explain why a control is disabled.
 */
const MESSAGES: Record<OperatorPermissionAction, string> = {
  'operator.app.access': 'Keine Berechtigung für die Operator App (operator-app).',
  'operator.today.read': 'Kein Zugriff auf die Heute-Ansicht.',
  'operator.scan.use': 'Kein Zugriff auf die Scan-Funktion.',
  'operator.booking.read': 'Keine Berechtigung zum Anzeigen von Buchungen.',
  'operator.booking.create': 'Keine Berechtigung zum Anlegen von Buchungen.',
  'operator.booking.update': 'Keine Berechtigung zum Bearbeiten von Buchungen.',
  'operator.booking.cancel': 'Keine Berechtigung zum Stornieren von Buchungen.',
  'operator.vehicle.read': 'Keine Berechtigung zum Anzeigen von Fahrzeugen.',
  'operator.vehicle.inspect': 'Keine Berechtigung zur Fahrzeuginspektion.',
  'operator.handover.read': 'Keine Berechtigung zum Anzeigen von Übergaben.',
  'operator.handover.start': 'Keine Berechtigung zum Starten einer Abholung (Field Agent erforderlich).',
  'operator.handover.update': 'Keine Berechtigung zum Bearbeiten von Übergaben.',
  'operator.handover.complete': 'Keine Berechtigung zum Abschließen einer Übergabe (Field Agent erforderlich).',
  'operator.handover.override': 'Keine Berechtigung für Übergabe-Overrides.',
  'operator.return.start': 'Keine Berechtigung zum Starten einer Rückgabe (Field Agent erforderlich).',
  'operator.return.complete': 'Keine Berechtigung zum Abschließen einer Rückgabe (Field Agent erforderlich).',
  'operator.damage.read': 'Keine Berechtigung zum Anzeigen von Schäden.',
  'operator.damage.create': 'Keine Berechtigung zum Erfassen von Schäden.',
  'operator.damage.update': 'Keine Berechtigung zum Bearbeiten von Schäden.',
  'operator.damage.verify': 'Keine Berechtigung zur Schadenfreigabe.',
  'operator.document.read': 'Keine Berechtigung zum Anzeigen von Dokumenten.',
  'operator.document.upload': 'Keine Berechtigung zum Hochladen von Dokumenten.',
  'operator.document.verify': 'Keine Berechtigung zur Dokumentenprüfung.',
  'operator.signature.capture': 'Keine Berechtigung zur Signaturerfassung (Field Agent erforderlich).',
  'operator.task.read': 'Keine Berechtigung zum Anzeigen von Aufgaben.',
  'operator.task.complete': 'Keine Berechtigung zum Bearbeiten von Aufgaben.',
  'operator.tire_measurement.create': 'Keine Berechtigung zum Erfassen von Reifenmessungen.',
  'operator.technical_observation.create': 'Keine Berechtigung für technische Beobachtungen.',
};

export function operatorPermissionDenialMessage(action: OperatorPermissionAction): string {
  return MESSAGES[action];
}
