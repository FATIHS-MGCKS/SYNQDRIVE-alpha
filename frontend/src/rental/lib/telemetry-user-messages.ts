import type { TelemetryErrorKind } from './vehicle-telemetry-request-error';

const MESSAGES: Record<Exclude<TelemetryErrorKind, 'abort'>, string> = {
  offline: 'Keine Netzwerkverbindung. Live-Daten werden fortgesetzt, sobald Sie wieder online sind.',
  auth: 'Sitzung abgelaufen. Bitte melden Sie sich erneut an.',
  permission: 'Keine Berechtigung für Fahrzeugsignale.',
  data_authorization: 'Telemetrie-Zugriff ist für dieses Fahrzeug nicht freigegeben.',
  not_found: 'Fahrzeugsignale sind derzeit nicht verfügbar.',
  rate_limit: 'Live-Daten werden kurzzeitig gedrosselt. Aktualisierung folgt automatisch.',
  server: 'Fahrzeugsignale vorübergehend nicht erreichbar.',
  timeout: 'Zeitüberschreitung beim Laden der Fahrzeugsignale.',
  unknown: 'Fahrzeugsignale vorübergehend nicht verfügbar.',
};

export function telemetryUserMessage(kind: TelemetryErrorKind): string | null {
  if (kind === 'abort') return null;
  return MESSAGES[kind];
}
