import type {
  IntegrationAttentionCode,
  IntegrationAuthenticationState,
  IntegrationConfigurationState,
  IntegrationEnvironment,
  IntegrationRuntimeHealth,
  IntegrationScope,
  PlatformIntegrationsSection,
} from './types';

export const PLATFORM_INTEGRATIONS_REFRESH_MS = 60_000;

export const PLATFORM_INTEGRATIONS_SECTIONS: Array<{ id: PlatformIntegrationsSection; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'integrations', label: 'Integrationen' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'settings', label: 'Plattform-Einstellungen' },
  { id: 'changelog', label: 'Änderungsprotokoll' },
];

export function formatRelativeDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

export function configurationLabel(state: IntegrationConfigurationState): string {
  return state === 'complete' ? 'Vollständig' : 'Unvollständig';
}

export function authenticationLabel(state: IntegrationAuthenticationState): string {
  if (state === 'valid') return 'Gültig';
  if (state === 'failed') return 'Fehlgeschlagen';
  return 'Unbekannt';
}

export function runtimeHealthLabel(state: IntegrationRuntimeHealth): string {
  if (state === 'healthy') return 'Gesund';
  if (state === 'degraded') return 'Eingeschränkt';
  if (state === 'error') return 'Fehler';
  return 'Unbekannt';
}

export function environmentLabel(state: IntegrationEnvironment): string {
  if (state === 'test') return 'Test';
  if (state === 'live') return 'Live';
  if (state === 'simulate') return 'Simuliert';
  return '—';
}

export function scopeLabel(scope: IntegrationScope): string {
  if (scope === 'platform') return 'Plattform';
  if (scope === 'platform_tenant') return 'Plattform + Mandant';
  return 'Mandant';
}

export function configurationTone(state: IntegrationConfigurationState): string {
  return state === 'complete' ? 'sq-tone-success' : 'sq-tone-warning';
}

export function runtimeHealthTone(state: IntegrationRuntimeHealth): string {
  if (state === 'healthy') return 'sq-tone-success';
  if (state === 'degraded') return 'sq-tone-warning';
  if (state === 'error') return 'sq-tone-danger';
  return 'sq-tone-neutral';
}

export function environmentTone(state: IntegrationEnvironment): string {
  if (state === 'test') return 'sq-tone-warning';
  if (state === 'live') return 'sq-tone-info';
  if (state === 'simulate') return 'sq-tone-warning';
  return 'sq-tone-neutral';
}

export function attentionLabel(code: IntegrationAttentionCode): string {
  const map: Record<IntegrationAttentionCode, string> = {
    CONFIG_INCOMPLETE: 'Konfiguration unvollständig',
    AUTH_FAILED: 'Authentifizierung fehlgeschlagen',
    WEBHOOK_FAILURES: 'Webhook-Fehler',
    RECONCILIATION_DRIFT: 'Abgleichs-Drift',
    DELIVERY_FAILURES: 'Zustellfehler',
    SIMULATE_MODE_ACTIVE: 'Simulationsmodus',
    STALE_DATA: 'Daten veraltet',
    PROVIDER_DEGRADED: 'Provider eingeschränkt',
  };
  return map[code] ?? code;
}

export function buildEnvironmentSummaryLine(summary: {
  stripeMode: 'TEST' | 'LIVE' | null;
  whatsappSimulate: boolean;
}): string {
  const parts: string[] = [];
  if (summary.stripeMode) parts.push(`Stripe: ${summary.stripeMode === 'LIVE' ? 'Live' : 'Test'}`);
  if (summary.whatsappSimulate) parts.push('WhatsApp: Simuliert');
  return parts.join(' · ') || 'Produktion';
}
