import type { StatusTone } from '../../components/patterns';
import type {
  CvSection,
  IntegrationConnectivity,
  TelemetryFreshness,
  VehicleAttentionSeverity,
  VehiclesOperationalQuery,
} from './types';

const ATTENTION_LABELS: Record<string, string> = {
  MAPPING_CONFLICT: 'Zuordnungskonflikt',
  MISSING_ORG_MAPPING: 'Nicht zugeordnet',
  DIMO_AUTH_ERROR: 'DIMO-Autorisierung fehlgeschlagen',
  DIMO_DISCONNECTED: 'DIMO getrennt',
  TELEMETRY_PERSISTENT_OFFLINE: 'Länger offline',
  TELEMETRY_NO_SIGNAL: 'Kein Signal',
  INGESTION_ERROR: 'Ingestion-Fehler',
  PIPELINE_STALE: 'Pipeline veraltet',
  PLATFORM_DIMO_DEGRADED: 'DIMO-Plattform eingeschränkt',
};

export function attentionReasonLabel(code: string): string {
  return ATTENTION_LABELS[code] ?? code;
}

export function attentionSeverityTone(severity: VehicleAttentionSeverity): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  if (severity === 'info') return 'info';
  return 'neutral';
}

export function integrationConnectivityTone(state: IntegrationConnectivity): StatusTone {
  if (state === 'connected') return 'success';
  if (state === 'disconnected') return 'warning';
  if (state === 'error') return 'critical';
  return 'neutral';
}

export function telemetryFreshnessTone(freshness: TelemetryFreshness): StatusTone {
  if (freshness === 'live') return 'success';
  if (freshness === 'standby') return 'info';
  if (freshness === 'signal_delayed') return 'warning';
  if (freshness === 'offline') return 'critical';
  return 'noData';
}

export function integrityTone(state: string): StatusTone {
  if (state === 'healthy') return 'success';
  if (state === 'conflict') return 'critical';
  return 'warning';
}

export function formatDateTimeDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function readCvLocation(search: string): {
  section: CvSection;
  vehicleId: string | null;
  dimoVehicleId: string | null;
  organizationId: string | null;
} {
  const p = new URLSearchParams(search);
  const section = (p.get('cvSection') as CvSection) ?? 'overview';
  return {
    section: section === 'vehicles' || section === 'import' ? section : 'overview',
    vehicleId: p.get('vehicleId'),
    dimoVehicleId: p.get('dimoVehicleId'),
    organizationId: p.get('organizationId'),
  };
}

export function readCvListStateFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'cvSearch',
    'cvPage',
    'cvRegistrationState',
    'cvIntegration',
    'cvTelemetry',
    'cvAttention',
    'cvSort',
    'organizationId',
  ];
  const state: Record<string, string> = {};
  for (const k of keys) {
    const v = p.get(k);
    if (v) state[k] = v;
  }
  return state;
}

export function urlToCvQuery(state: Record<string, string>): VehiclesOperationalQuery {
  return {
    page: state.cvPage ? Number(state.cvPage) : 1,
    limit: 25,
    q: state.cvSearch,
    organizationId: state.organizationId,
    registrationState: (state.cvRegistrationState as VehiclesOperationalQuery['registrationState']) ?? 'registered',
    integrationConnectivity: state.cvIntegration as VehiclesOperationalQuery['integrationConnectivity'],
    telemetryFreshness: state.cvTelemetry as VehiclesOperationalQuery['telemetryFreshness'],
    attention: state.cvAttention as VehiclesOperationalQuery['attention'],
    sort: (state.cvSort as VehiclesOperationalQuery['sort']) ?? 'attention',
  };
}

export function queryToCvUrlState(query: VehiclesOperationalQuery): Record<string, string | undefined> {
  return {
    cvPage: query.page && query.page > 1 ? String(query.page) : undefined,
    cvSearch: query.q,
    organizationId: query.organizationId,
    cvRegistrationState: query.registrationState,
    cvIntegration: query.integrationConnectivity,
    cvTelemetry: query.telemetryFreshness,
    cvAttention: query.attention,
    cvSort: query.sort,
  };
}

export function writeCvListStateToUrl(state: Record<string, string | undefined>, replace = false) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'cvSearch',
    'cvPage',
    'cvRegistrationState',
    'cvIntegration',
    'cvTelemetry',
    'cvAttention',
    'cvSort',
    'organizationId',
  ];
  for (const k of keys) p.delete(k);
  for (const [k, v] of Object.entries(state)) {
    if (v && v !== 'all') p.set(k, v);
  }
  const next = `${window.location.pathname}?${p.toString()}`;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}

export function syncCvSectionUrl(
  section: CvSection,
  opts?: { vehicleId?: string | null; dimoVehicleId?: string | null; replace?: boolean },
) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  p.set('view', 'vehicles');
  p.set('cvSection', section);
  if (opts?.vehicleId) {
    p.set('vehicleId', opts.vehicleId);
    p.delete('dimoVehicleId');
  } else if (opts?.dimoVehicleId) {
    p.set('dimoVehicleId', opts.dimoVehicleId);
    p.delete('vehicleId');
  } else {
    p.delete('vehicleId');
    p.delete('dimoVehicleId');
  }
  const next = `${window.location.pathname}?${p.toString()}`;
  if (opts?.replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}
