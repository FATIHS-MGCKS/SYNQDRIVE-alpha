import type {
  DashboardWarningLight,
  DashboardWarningLightsResponse,
  OilLevelDisplay,
} from '../../lib/api';
import type { StatusTone } from '../../components/patterns/status-utils';

export type TelltaleTone = 'alert' | 'critical' | 'ok' | 'neutral' | 'muted' | 'stale' | 'error';

export type TelltaleDisplayCategory =
  | 'active'
  | 'off_confirmed'
  | 'historical'
  | 'stale'
  | 'no_event_yet'
  | 'unsupported'
  | 'error';

export interface TelltalePanelPresentation {
  badgeLabel: string;
  badgeTone: StatusTone;
  summaryText: string;
  showConfirmedOff: boolean;
  showActiveSummary: boolean;
  activeCriticalCount: number;
  activeWarningCount: number;
  activeCount: number;
  historicalCount: number;
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
      return 'Datenstand verzögert';
    case 'error':
      return 'Fehler beim Auslesen';
    default:
      return 'Unbekannt';
  }
}

export function deriveTelltaleDisplayCategory(
  light: DashboardWarningLight,
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): TelltaleDisplayCategory {
  if (light.isCurrentActive === true || isTelltaleCurrentlyActive(light, envelopeFreshness)) {
    return 'active';
  }
  if (light.isHistorical) return 'historical';
  if (light.state === 'stale') return 'stale';
  if (light.state === 'off_confirmed') return 'off_confirmed';
  if (light.state === 'unsupported') return 'unsupported';
  if (light.state === 'error') return 'error';
  return 'no_event_yet';
}

export function countHistoricalTelltales(
  lights: DashboardWarningLight[],
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): number {
  return lights.filter((l) => deriveTelltaleDisplayCategory(l, envelopeFreshness) === 'historical').length;
}

export function telltaleDisplayCategoryLabel(category: TelltaleDisplayCategory): string {
  switch (category) {
    case 'active':
      return 'Aktiv';
    case 'off_confirmed':
      return 'Bestätigt aus';
    case 'historical':
      return 'Historisch';
    case 'stale':
      return 'Veraltet';
    case 'unsupported':
      return 'Nicht unterstützt';
    case 'error':
      return 'Fehler';
    case 'no_event_yet':
    default:
      return 'Keine Daten';
  }
}

export function telltaleDetailExplanation(
  light: DashboardWarningLight,
  category: TelltaleDisplayCategory,
): string {
  switch (category) {
    case 'active':
      return light.reason || 'Aktuell aktiv bestätigt';
    case 'historical':
      return 'Zuletzt gesehen, aktuell nicht als aktiv bestätigt';
    case 'stale':
      return 'Status veraltet, nicht als aktiv gezählt';
    case 'off_confirmed':
      return light.reason || 'Zuletzt bestätigt aus';
    case 'unsupported':
      return 'Nicht von diesem Fahrzeug unterstützt';
    case 'error':
      return light.reason || 'Fehler beim Auslesen';
    case 'no_event_yet':
      return 'Noch keine Meldung vom Fahrzeug empfangen';
    default:
      return light.reason || '';
  }
}

export function telltaleToneFromLight(light: DashboardWarningLight): TelltaleTone {
  if (light.isHistorical) return 'stale';
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

export function isTelltaleCurrentlyActive(
  light: DashboardWarningLight,
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): boolean {
  if (light.state !== 'active') return false;
  if (
    envelopeFreshness === 'stale' ||
    envelopeFreshness === 'error' ||
    envelopeFreshness === 'no_data'
  ) {
    return false;
  }
  return true;
}

export function countActiveTelltales(
  lights: DashboardWarningLight[],
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): number {
  return lights.filter((l) => isTelltaleCurrentlyActive(l, envelopeFreshness)).length;
}

/** User-facing tile status — never raw enums or "UNKNOWN". */
export function telltaleTileStatusLabel(
  light: DashboardWarningLight | undefined,
  connected: boolean,
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): string {
  if (!connected) return '—';
  if (!light) return '—';
  const category = deriveTelltaleDisplayCategory(light, envelopeFreshness);
  if (category === 'active') {
    return light.severity === 'critical' ? 'Kritisch' : 'Aktiv';
  }
  if (category === 'historical') return 'Historisch';
  if (category === 'off_confirmed') return 'Aus';
  if (category === 'stale') return 'Veraltet';
  return '—';
}

export function resolveTelltalePanelPresentation(
  telltales: DashboardWarningLightsResponse | null | undefined,
): TelltalePanelPresentation {
  const envelopeFreshness = telltales?.freshness;
  const activeLights =
    telltales?.lights.filter((l) => isTelltaleCurrentlyActive(l, envelopeFreshness)) ?? [];
  const activeCritical = activeLights.filter((l) => l.severity === 'critical').length;
  const activeWarning = activeLights.filter((l) => l.severity === 'warning').length;
  const activeCount = activeLights.length;
  const historicalCount = countHistoricalTelltales(telltales?.lights ?? [], envelopeFreshness);
  const sourceFooter = resolveSourceFooter(telltales);
  const isConnected = isTelltaleProviderConnected(telltales);

  const base = {
    activeCriticalCount: activeCritical,
    activeWarningCount: activeWarning,
    activeCount,
    historicalCount,
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

  if (historicalCount > 0) {
    return {
      ...base,
      badgeLabel: 'Historisch',
      badgeTone: 'watch',
      summaryText: 'Frühere Warnleuchten ohne aktuelle Aktiv-Bestätigung.',
    };
  }

  if (telltales.freshness === 'stale' && isConnected) {
    return {
      ...base,
      badgeLabel: 'Veraltet',
      badgeTone: 'neutral',
      summaryText: 'Letzter Datenpunkt ist zu alt für eine verlässliche Aktiv-Einschätzung.',
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

export function telltaleShortTextFromLight(
  light: DashboardWarningLight,
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'],
): string {
  return telltaleDisplayCategoryLabel(deriveTelltaleDisplayCategory(light, envelopeFreshness));
}

/** Prefer canonical telltale read model; legacy indicators only as fallback. */
export function isBatteryTelltaleActive(
  telltales: DashboardWarningLightsResponse | null | undefined,
  legacyIndicator: boolean | null | undefined,
): boolean {
  const fromReadModel = telltales?.lights.find((l) => l.key === 'battery_warning_light');
  if (fromReadModel) {
    return isTelltaleCurrentlyActive(fromReadModel, telltales?.freshness);
  }
  return legacyIndicator === true;
}
