import { DOCUMENT_ACTION_ERROR_CODES } from './document-action.errors';

const ERROR_MESSAGES: Record<string, string> = {
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_NOT_CONFIRMED]:
    'Der Aktionsplan ist noch nicht bestätigt — bitte die Prüfung erneut durchführen.',
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_INVALIDATED]:
    'Der Aktionsplan wurde invalidiert — bitte Felder speichern und Vorschau neu laden.',
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_VERSION_MISMATCH]:
    'Der Aktionsplan ist veraltet — bitte die Vorschau erneut laden.',
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_FINGERPRINT_MISMATCH]:
    'Die Daten haben sich geändert — bitte Vorschau erneut prüfen und bestätigen.',
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_BLOCKED]:
    'Der Aktionsplan ist blockiert — fehlende Angaben oder Konflikte müssen zuerst behoben werden.',
  [DOCUMENT_ACTION_ERROR_CODES.PLAN_LOCKED]:
    'Die Übernahme läuft bereits und kann gerade nicht erneut gestartet werden.',
  [DOCUMENT_ACTION_ERROR_CODES.EXECUTOR_NOT_FOUND]:
    'Für diese Aktion ist kein Ausführungspfad hinterlegt.',
  [DOCUMENT_ACTION_ERROR_CODES.REQUIRED_ACTION_FAILED]:
    'Eine erforderliche Aktion ist fehlgeschlagen.',
  [DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION]:
    'Geschäftsregel verletzt — die Aktion konnte nicht ausgeführt werden.',
  [DOCUMENT_ACTION_ERROR_CODES.TECHNICAL_FAILURE]:
    'Technischer Fehler bei der Ausführung — bitte später erneut versuchen.',
  [DOCUMENT_ACTION_ERROR_CODES.IDEMPOTENCY_CONFLICT]:
    'Die Aktion wurde bereits mit abweichendem Ergebnis ausgeführt.',
};

export function translateDocumentActionErrorCode(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (fallback?.trim()) return fallback.trim();
  return 'Unbekannter Fehler bei der Ausführung.';
}
