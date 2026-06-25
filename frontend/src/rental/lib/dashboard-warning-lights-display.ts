import type {
  DashboardWarningLight,
  DashboardWarningLightsResponse,
  OilLevelDisplay,
} from '../../lib/api';
import type { StatusTone } from '../../components/patterns/status-utils';

export type TelltaleTone = 'alert' | 'critical' | 'ok' | 'neutral' | 'muted' | 'stale' | 'error';

export interface TelltalePanelPresentation {
  badgeLabel: string;
  badgeTone: StatusTone;
  summaryText: string;
  showConfirmedOff: boolean;
  showActiveSummary: boolean;
  activeCriticalCount: number;
  activeWarningCount: number;
  activeCount: number;
  isConnected: boolean;
  sourceFooter: string;
}

const STATE_SORT_WEIGHT: Record<DashboardWarningLight['state'], number> = {
  active: 0,
  error: 1,
  stale: 2,
  no_event_yet: 3,
  unsupported: 4,
  off_confirmed: 5,
};

const SEVERITY_SORT_WEIGHT: Record<DashboardWarningLight['severity'], number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  info: 3,
};

export function lightStateLabel(state: DashboardWarningLight['state']): string {
  switch (state) {
    case 'active':
      return 'Aktive Warnleuchte';
    case 'off_confirmed':
      return 'Bestätigt aus';
    case 'no_event_yet':
      return 'Noch kein Ereignis empfangen';
    case 'unsupported':
      return 'Nicht unterstützt';
    case 'stale':
      return 'Datenbasis veraltet';
    case 'error':
      return 'Fehler beim Auslesen';
    default:
      return 'Unbekannt';
  }
}

export function telltaleToneFromLight(light: DashboardWarningLight): TelltaleTone {
  if (light.state === 'active') {
    return light.severity === 'critical' ? 'critical' : 'alert';
  }
  switch (light.state) {
    case 'off_confirmed':
      return 'ok';
    case 'stale':
      return 'stale';
    case 'unsupported':
      return 'muted';
    case 'error':
      return 'error';
    case 'no_event_yet':
    default:
      return 'neutral';
  }
}

export function sortDashboardLights(lights: DashboardWarningLight[]): DashboardWarningLight[] {
  return [...lights].sort((a, b) => {
    const stateDiff = STATE_SORT_WEIGHT[a.state] - STATE_SORT_WEIGHT[b.state];
    if (stateDiff !== 0) return stateDiff;
    if (a.state === 'active' && b.state === 'active') {
      const sevDiff = SEVERITY_SORT_WEIGHT[a.severity] - SEVERITY_SORT_WEIGHT[b.severity];
      if (sevDiff !== 0) return sevDiff;
    }
    return a.label.localeCompare(b.label, 'de');
  });
}

export function formatRelativeObservedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = Date.now() - ts;
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
  if (h >= 1) return `vor ${h} Std.`;
  return 'vor <1 Std.';
}

export function formatObservedAtAbsolute(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function telltaleShortLabel(key: string): string {
  switch (key) {
    case 'engine_oil_level':
      return 'Motoröl';
    case 'engine_limp_mode':
    case 'check_engine_light':
      return 'Notlauf';
    case 'brake_lining_wear_pre_warning':
      return 'Bremsbelag';
    case 'tire_pressure_warning':
      return 'Reifendruck';
    case 'battery_warning_light':
      return 'Batterie';
    default:
      return key.replace(/_/g, ' ');
  }
}

export function isTelltaleProviderConnected(
  telltales: DashboardWarningLightsResponse | null | undefined,
): boolean {
  if (!telltales) return false;
  return (
    telltales.connectionStatus === 'connected' &&
    telltales.supportStatus !== 'not_connected'
  );
}

export function resolveSourceFooter(
  telltales: DashboardWarningLightsResponse | null | undefined,
): string {
  if (!telltales) return 'Quelle: HM/OEM Health';
  if (
    telltales.connectionStatus === 'not_connected' ||
    telltales.supportStatus === 'not_connected'
  ) {
    return 'Keine HM/OEM-Verbindung';
  }
  if (telltales.provider === 'HIGH_MOBILITY' || telltales.provider === 'DIMO') {
    return 'Quelle: HM/OEM Health';
  }
  return 'Quelle: HM/OEM Health';
}

export function countActiveTelltales(lights: DashboardWarningLight[]): number {
  return lights.filter((l) => l.state === 'active').length;
}

/** User-facing tile status — never raw enums or "UNKNOWN". */
export function telltaleTileStatusLabel(
  light: DashboardWarningLight | undefined,
  connected: boolean,
): string {
  if (!connected) return '—';
  if (!light) return '—';
  if (light.state === 'active') {
    return light.severity === 'critical' ? 'Kritisch' : 'Aktiv';
  }
  if (light.state === 'off_confirmed') return 'Aus';
  return '—';
}

export function resolveTelltalePanelPresentation(
  telltales: DashboardWarningLightsResponse | null | undefined,
): TelltalePanelPresentation {
  const activeCritical =
    telltales?.lights.filter((l) => l.state === 'active' && l.severity === 'critical').length ?? 0;
  const activeWarning =
    telltales?.lights.filter((l) => l.state === 'active' && l.severity === 'warning').length ?? 0;
  const activeCount = countActiveTelltales(telltales?.lights ?? []);
  const sourceFooter = resolveSourceFooter(telltales);
  const isConnected = isTelltaleProviderConnected(telltales);

  const base = {
    activeCriticalCount: activeCritical,
    activeWarningCount: activeWarning,
    activeCount,
    isConnected,
    sourceFooter,
    showConfirmedOff: false,
    showActiveSummary: false,
  };

  if (!telltales) {
    return {
      ...base,
      badgeLabel: 'Unbekannt',
      badgeTone: 'neutral',
      summaryText: 'Warnleuchtenstatus wird geladen …',
    };
  }

  if (
    telltales.connectionStatus === 'not_connected' ||
    telltales.supportStatus === 'not_connected'
  ) {
    return {
      ...base,
      badgeLabel: 'Nicht verbunden',
      badgeTone: 'neutral',
      summaryText: 'Fahrzeug nicht mit HM/OEM Health verbunden.',
    };
  }

  if (telltales.connectionStatus === 'provider_error' || telltales.freshness === 'error') {
    return {
      ...base,
      badgeLabel: 'Unbekannt',
      badgeTone: 'neutral',
      summaryText: 'Warnleuchtenstatus aktuell nicht verfügbar.',
    };
  }

  if (activeCount > 0) {
    return {
      ...base,
      badgeLabel: 'Warnung aktiv',
      badgeTone: activeCritical > 0 ? 'critical' : 'watch',
      summaryText: 'Mindestens eine Warnleuchte erfordert Aufmerksamkeit.',
      showActiveSummary: true,
    };
  }

  if (telltales.overallStatus === 'good') {
    return {
      ...base,
      badgeLabel: 'Alles klar',
      badgeTone: 'success',
      summaryText: 'Keine aktiven Warnleuchten erkannt.',
      showConfirmedOff: true,
    };
  }

  if (
    telltales.freshness === 'stale' ||
    telltales.supportStatus === 'not_supported' ||
    telltales.supportStatus === 'no_data' ||
    telltales.freshness === 'no_data' ||
    telltales.overallStatus === 'unknown'
  ) {
    return {
      ...base,
      badgeLabel: 'Unbekannt',
      badgeTone: 'neutral',
      summaryText: 'Warnleuchtenstatus aktuell nicht verfügbar.',
    };
  }

  return {
    ...base,
    badgeLabel: 'Alles klar',
    badgeTone: 'success',
    summaryText: 'Keine aktiven Warnleuchten erkannt.',
    showConfirmedOff: true,
  };
}

export function telltaleRowPrimaryText(light: DashboardWarningLight): string {
  if (light.state === 'active') return light.reason;
  return lightStateLabel(light.state);
}

export function telltaleRowSecondaryText(light: DashboardWarningLight): string | null {
  if (light.state === 'active') return light.action || null;
  if (light.state === 'no_event_yet') {
    return 'Noch keine Meldung vom Fahrzeug — nicht als „aus“ werten.';
  }
  if (light.state === 'stale') {
    return 'Die letzte Modulmeldung ist zu alt für eine verlässliche Einschätzung.';
  }
  if (light.state === 'unsupported' || light.state === 'error' || light.state === 'off_confirmed') {
    return light.reason || null;
  }
  return light.reason || null;
}

export const DASHBOARD_TELLTALE_KEYS = [
  'engine_oil_level',
  'engine_limp_mode',
  'brake_lining_wear_pre_warning',
  'tire_pressure_warning',
  'battery_warning_light',
] as const;

export function shouldShowOilLevelBar(
  light: DashboardWarningLight,
  oilLevelDisplay: OilLevelDisplay | null | undefined,
): boolean {
  return light.key === 'engine_oil_level' && !!oilLevelDisplay && oilLevelDisplay.mode !== 'no_data';
}

export function telltaleShortTextFromLight(light: DashboardWarningLight): string {
  if (light.state === 'active') {
    return light.severity === 'critical' ? 'Kritisch' : 'Aktiv';
  }
  if (light.state === 'off_confirmed') return 'Aus';
  return '—';
}

/** Prefer canonical telltale read model; legacy indicators only as fallback. */
export function isBatteryTelltaleActive(
  telltales: DashboardWarningLightsResponse | null | undefined,
  legacyIndicator: boolean | null | undefined,
): boolean {
  const fromReadModel = telltales?.lights.find((l) => l.key === 'battery_warning_light');
  if (fromReadModel) return fromReadModel.state === 'active';
  return legacyIndicator === true;
}
