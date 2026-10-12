import type { StatusTone } from '../../components/patterns';
import type { DimoR9WebhookHealthDto, DimoR9WebhookOverallState } from './dimo-webhook-health.types';

/** Master Admin Platform Ops — presentation adapter (German ops copy). */
export const DIMO_R9_UI = {
  panelTitle: 'DIMO Webhooks',
  refreshNow: 'Jetzt prüfen',
  loadError: 'DIMO Webhook-Status konnte nicht geladen werden',
  cohortSectionTitle: 'Cohort & Ausschlüsse',
  speedCardTitle: 'Speed-Webhooks',
  ignitionCardTitle: 'Ignition-Webhooks',
  providerStatusLabel: 'Provider-Status',
  failureCountLabel: 'Failure Count',
  subscriptionsLabel: 'Abonnements',
  tokenIdsLabel: 'Token-IDs',
  expectedLabel: 'Erwartet',
  excludedLabel: 'Ausgeschlossen',
  excludedSubscribedLabel: 'Unerwartet abonniert (ausgeschlossen)',
  lastErrorPrefix: 'Letzter Fehler',
  wakeDisclaimer:
    'Wake-to-Snapshot und Trip-FSM werden hier nicht End-to-End bewertet — nur DIMO-Webhook-Definitionen und Abonnements.',
  providerAccessPrefix: 'Provider-Zugang',
  lastCheckedPrefix: 'Zuletzt geprüft',
  cacheSuffix: 'Cache',
  liveSuffix: 'Live',
  autoRefreshPrefix: 'Auto-Refresh alle',
  manualMinPrefix: 'manuell min.',
  secondsSuffix: 's',
  unknownStatus: 'unbekannt',
};

export const DIMO_R9_OVERALL_LABEL_DE: Record<DimoR9WebhookOverallState, string> = {
  HEALTHY: 'Betriebsbereit',
  DEGRADED: 'Eingeschränkt',
  CRITICAL: 'Kritisch',
  STALE: 'Veraltet',
  UNKNOWN: 'Unbekannt',
  NOT_CONFIGURED: 'Nicht konfiguriert',
};

export function dimoR9OverallTone(state: DimoR9WebhookOverallState): StatusTone {
  switch (state) {
    case 'HEALTHY':
      return 'success';
    case 'DEGRADED':
    case 'STALE':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function dimoR9HintMessagesDe(data: DimoR9WebhookHealthDto): string[] {
  const hints: string[] = [];
  if (data.isStale) {
    hints.push('Angezeigte Daten sind veraltet — kein aktueller Provider-Check.');
  }
  if (data.providerAccessState !== 'OK') {
    hints.push('DIMO konnte nicht abgefragt werden.');
  }
  for (const channel of [data.speed, data.ignition]) {
    const label = channel.kind === 'speed' ? 'Speed' : 'Ignition';
    for (const alert of channel.alerts) {
      if (alert.code === 'STATUS_NOT_ENABLED') {
        hints.push(`DIMO hat den ${label}-Webhook deaktiviert.`);
      }
      if (alert.code === 'FAILURE_COUNT_NONZERO') {
        hints.push('Fehlgeschlagene Webhook-Zustellungen erkannt.');
      }
      if (alert.code === 'COHORT_DRIFT' || alert.code === 'EXCLUDED_TOKEN_SUBSCRIBED') {
        hints.push('Fahrzeug-Abonnements stimmen nicht überein.');
      }
    }
  }
  return [...new Set(hints)];
}
