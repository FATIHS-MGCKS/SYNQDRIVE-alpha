/**
 * Master-Admin connectivity diagnostic copy (German — master shell is DE-only).
 *
 * Describes the observed symptom, never a fabricated root cause. A provider that
 * responds while the vehicle observation is frozen can indicate a device, SIM or
 * provider-side telemetry inactivity — but we only state what the data shows.
 */
import type { StatusTone } from '../../components/patterns/status-utils';
import type {
  ConnectivityDiagnosticAdmin,
  ConnectivityDiagnosticState,
  ConnectivityTriState,
  FleetTelemetryFreshness,
} from '../../lib/api';

const DIAGNOSTIC_STATE_LABELS: Record<ConnectivityDiagnosticState, string> = {
  PROVIDER_REACHABLE_DATA_FRESH: 'Provider erreichbar · Fahrzeugdaten aktuell',
  PROVIDER_REACHABLE_DATA_STALE: 'Provider erreichbar · Fahrzeugdaten veraltet',
  PROVIDER_UNREACHABLE: 'Provider nicht erreichbar',
  AUTH_OR_BINDING_ERROR: 'Authorisierung oder Bindung fehlerhaft',
  UNKNOWN: 'Unbekannt',
};

const DIAGNOSTIC_STATE_TONES: Record<ConnectivityDiagnosticState, StatusTone> = {
  PROVIDER_REACHABLE_DATA_FRESH: 'success',
  PROVIDER_REACHABLE_DATA_STALE: 'warning',
  PROVIDER_UNREACHABLE: 'critical',
  AUTH_OR_BINDING_ERROR: 'critical',
  UNKNOWN: 'neutral',
};

const DIAGNOSTIC_HINTS: Record<ConnectivityDiagnosticState, string | null> = {
  PROVIDER_REACHABLE_DATA_FRESH: null,
  PROVIDER_REACHABLE_DATA_STALE:
    'Provider antwortet, aber das Fahrzeuggerät liefert keine neuen Daten.',
  PROVIDER_UNREACHABLE:
    'Es wurden keine aktuellen Provider-Antworten empfangen. Provider-Anbindung prüfen.',
  AUTH_OR_BINDING_ERROR:
    'Freigabe, Consent oder Fahrzeugbindung prüfen — die Provider-Kette ist unterbrochen.',
  UNKNOWN: 'Nicht genügend Diagnosedaten für eine Einordnung.',
};

/**
 * Replaces the generic UNKNOWN hint when we can name the reason: the vehicle is
 * simply not in the Abfrage-Kohorte, so a stale Provider-Abfrage is expected.
 */
const NOT_SCHEDULED_HINT =
  'Für dieses Fahrzeug werden derzeit keine Provider-Abfragen geplant (Fahrzeug- oder Verbindungsstatus). Eine veraltete Provider-Abfrage ist hier kein Provider-Ausfall.';

const POLL_SCHEDULED_LABELS: Record<'true' | 'false' | 'null', string> = {
  true: 'geplant',
  false: 'nicht geplant',
  null: 'unbekannt',
};

const OBSERVATION_STATE_LABELS: Record<FleetTelemetryFreshness, string> = {
  live: 'aktuell',
  standby: 'Standby',
  signal_delayed: 'verzögert (Soft-Offline)',
  offline: 'offline',
  no_signal: 'kein Signal',
};

const TRI_STATE_LABELS: Record<ConnectivityTriState, string> = {
  ACTIVE: 'aktiv',
  INACTIVE: 'inaktiv',
  UNKNOWN: 'unbekannt',
};

export interface ConnectivityDiagnosticView {
  headline: string;
  tone: StatusTone;
  hint: string | null;
  providerLabel: string;
  providerApiLabel: string;
  lastProviderFetchLabel: string;
  lastObservationLabel: string;
  observationStateLabel: string;
  bindingLabel: string;
  consentLabel: string;
  connectionStatusLabel: string;
  providerPollScheduledLabel: string;
  deviceBindingRef: string | null;
  providerErrorCategory: string | null;
}

export function buildConnectivityDiagnosticView(
  diagnostic: ConnectivityDiagnosticAdmin,
): ConnectivityDiagnosticView {
  const state = diagnostic.diagnosticState;

  return {
    headline: buildHeadline(diagnostic),
    tone: DIAGNOSTIC_STATE_TONES[state] ?? 'neutral',
    hint: buildHint(diagnostic),
    providerLabel: diagnostic.provider ?? 'keine Datenquelle',
    providerApiLabel: providerApiLabel(diagnostic.providerApiReachable),
    lastProviderFetchLabel: relativeAgeLabel(diagnostic.lastProviderFetchAgeMs),
    lastObservationLabel: relativeAgeLabel(diagnostic.lastVehicleObservationAgeMs),
    observationStateLabel:
      OBSERVATION_STATE_LABELS[diagnostic.observationState] ?? 'unbekannt',
    bindingLabel: TRI_STATE_LABELS[diagnostic.bindingState] ?? 'unbekannt',
    consentLabel: TRI_STATE_LABELS[diagnostic.consentState] ?? 'unbekannt',
    connectionStatusLabel: diagnostic.connectionStatus ?? 'unbekannt',
    providerPollScheduledLabel:
      POLL_SCHEDULED_LABELS[String(diagnostic.providerPollScheduled) as 'true' | 'false' | 'null'] ??
      'unbekannt',
    deviceBindingRef: diagnostic.deviceBindingRef,
    providerErrorCategory: diagnostic.providerErrorCategory,
  };
}

function buildHint(diagnostic: ConnectivityDiagnosticAdmin): string | null {
  if (
    diagnostic.diagnosticState === 'UNKNOWN' &&
    diagnostic.providerPollScheduled === false
  ) {
    return NOT_SCHEDULED_HINT;
  }
  return DIAGNOSTIC_HINTS[diagnostic.diagnosticState] ?? null;
}

/**
 * Incident-signature headline, e.g.
 * "Provider erreichbar · Fahrzeugdaten seit 27 Std. nicht aktualisiert".
 */
function buildHeadline(diagnostic: ConnectivityDiagnosticAdmin): string {
  const base = DIAGNOSTIC_STATE_LABELS[diagnostic.diagnosticState] ?? 'Unbekannt';
  if (diagnostic.diagnosticState !== 'PROVIDER_REACHABLE_DATA_STALE') return base;

  const age = coarseAgeLabel(diagnostic.lastVehicleObservationAgeMs);
  if (!age) return base;
  return `Provider erreichbar · Fahrzeugdaten seit ${age} nicht aktualisiert`;
}

function providerApiLabel(reachable: boolean | null): string {
  if (reachable === true) return 'erreichbar';
  if (reachable === false) return 'nicht erreichbar';
  return 'unbekannt';
}

/** "vor 20 Sek." / "vor 27 Std." — null age renders as unknown. */
export function relativeAgeLabel(ageMs: number | null): string {
  const age = coarseAgeLabel(ageMs);
  return age ? `vor ${age}` : 'unbekannt';
}

function coarseAgeLabel(ageMs: number | null): string | null {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return null;

  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds} Sek.`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} Std.`;

  return `${Math.floor(hours / 24)} Tg.`;
}
