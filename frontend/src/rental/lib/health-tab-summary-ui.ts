import type { ServiceComplianceModuleState, VehicleHealthTabSummaryDto } from '../../lib/api';

export type HealthTabSummaryLoadState = 'idle' | 'loading' | 'loaded' | 'endpoint_error';

export type SummaryFindingSeverity = 'critical' | 'warning' | 'info' | 'unknown';

const SEVERITY_ORDER: Record<SummaryFindingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  unknown: 3,
};

export interface OverallVisualConfig {
  bg: string;
  dot: string;
  ping: string;
  text: string;
  sub: string;
  label: string;
  animatePing: boolean;
}

export function sortSummaryFindings(
  findings: VehicleHealthTabSummaryDto['findings'],
): VehicleHealthTabSummaryDto['findings'] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity as SummaryFindingSeverity] ?? 9) -
      (SEVERITY_ORDER[b.severity as SummaryFindingSeverity] ?? 9),
  );
}

export function overallStateVisual(
  state: VehicleHealthTabSummaryDto['overall']['state'] | 'loading' | 'error',
): OverallVisualConfig {
  switch (state) {
    case 'good':
      return {
        bg: 'sq-tone-success border border-border',
        dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]',
        ping: 'bg-green-300',
        text: 'text-[color:var(--status-positive)]',
        sub: 'text-[color:var(--status-positive)]',
        label: 'Gut',
        animatePing: true,
      };
    case 'warning':
      return {
        bg: 'sq-tone-watch border border-border',
        dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
        ping: 'bg-amber-400',
        text: 'text-[color:var(--status-watch)]',
        sub: 'text-[color:var(--status-watch)]',
        label: 'Warnung',
        animatePing: true,
      };
    case 'critical':
      return {
        bg: 'sq-tone-critical border border-border',
        dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
        ping: 'bg-red-400',
        text: 'text-[color:var(--status-critical)]',
        sub: 'text-[color:var(--status-critical)]',
        label: 'Kritisch',
        animatePing: true,
      };
    case 'loading':
      return {
        bg: 'sq-tone-nodata border border-border',
        dot: 'bg-gray-400',
        ping: 'bg-gray-300',
        text: 'text-muted-foreground',
        sub: 'text-muted-foreground',
        label: 'Lädt…',
        animatePing: false,
      };
    case 'error':
      return {
        bg: 'sq-tone-nodata border border-border',
        dot: 'bg-gray-400',
        ping: 'bg-gray-300',
        text: 'text-muted-foreground',
        sub: 'text-muted-foreground',
        label: 'Nicht verfügbar',
        animatePing: false,
      };
    case 'unknown':
    default:
      return {
        bg: 'sq-tone-nodata border border-border',
        dot: 'bg-gray-400',
        ping: 'bg-gray-300',
        text: 'text-muted-foreground',
        sub: 'text-muted-foreground',
        label: 'Begrenzte Daten',
        animatePing: false,
      };
  }
}

export function overallStateChipState(
  state: VehicleHealthTabSummaryDto['overall']['state'] | 'loading' | 'error',
): 'good' | 'critical' | 'watch' | 'no_data' | 'unknown' {
  switch (state) {
    case 'good':
      return 'good';
    case 'critical':
      return 'critical';
    case 'warning':
      return 'watch';
    case 'loading':
      return 'unknown';
    case 'error':
      return 'no_data';
    default:
      return 'no_data';
  }
}

export function overallStateChipLabel(
  state: VehicleHealthTabSummaryDto['overall']['state'] | 'loading' | 'error',
  backendLabel?: string,
): string {
  if (backendLabel && state !== 'loading' && state !== 'error') return backendLabel;
  switch (state) {
    case 'good':
      return 'Good';
    case 'warning':
      return 'Warning';
    case 'critical':
      return 'Critical';
    case 'loading':
      return 'Loading';
    case 'error':
      return 'Unavailable';
    default:
      return 'Limited data';
  }
}

export function dataQualityShortLabel(level: VehicleHealthTabSummaryDto['dataQuality']['level']): string {
  switch (level) {
    case 'high':
      return 'Datenbasis: Hoch';
    case 'medium':
      return 'Datenbasis: Eingeschränkt';
    case 'low':
      return 'Datenbasis: Niedrig';
    default:
      return 'Datenbasis: Unbekannt';
  }
}

export function dataQualityChipTone(
  level: VehicleHealthTabSummaryDto['dataQuality']['level'],
): 'success' | 'watch' | 'critical' | 'neutral' {
  switch (level) {
    case 'high':
      return 'success';
    case 'medium':
      return 'watch';
    case 'low':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function findingSeverityLabel(severity: SummaryFindingSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Kritisch';
    case 'warning':
      return 'Warnung';
    case 'info':
      return 'Info';
    default:
      return 'Unklar';
  }
}

export function findingSeverityTone(
  severity: SummaryFindingSeverity,
): 'critical' | 'watch' | 'info' | 'neutral' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'watch';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}

export function hmSourceStatusLabel(status: string): string {
  switch (status) {
    case 'fresh':
      return 'HM/OEM: Aktuell';
    case 'stale':
      return 'HM/OEM: Veraltet';
    case 'no_data':
      return 'HM/OEM: Keine Daten';
    case 'not_connected':
      return 'HM/OEM: Nicht verbunden';
    case 'sync_error':
      return 'HM/OEM: Sync-Fehler';
    default:
      return 'HM/OEM: Unbekannt';
  }
}

export function dimoSourceStatusLabel(status: string): string {
  switch (status) {
    case 'fresh':
      return 'DIMO: Aktuell';
    case 'stale':
      return 'DIMO: Veraltet';
    case 'no_data':
      return 'DIMO: Keine Daten';
    case 'not_connected':
      return 'DIMO: Nicht verbunden';
    default:
      return 'DIMO: Unbekannt';
  }
}

export function complianceDateStateLabel(state: string | undefined): string {
  switch (state) {
    case 'critical':
      return 'Überfällig';
    case 'warning':
      return 'Bald fällig';
    case 'good':
      return 'OK';
    default:
      return 'Keine Daten';
  }
}

export function serviceComplianceAccentState(
  state: ServiceComplianceModuleState['state'] | undefined,
): 'good' | 'warning' | 'critical' | 'unknown' | 'no_tracking' {
  if (!state || state === 'no_tracking') return 'no_tracking';
  return state;
}

export function nextServiceSummaryTone(
  state: ServiceComplianceModuleState['state'] | undefined,
): 'good' | 'warning' | 'critical' | 'neutral' {
  switch (state) {
    case 'good':
      return 'good';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function formatComplianceDueDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE');
}

export function oemFreshnessLabel(freshness: string): string {
  switch (freshness) {
    case 'fresh':
      return 'OEM-Indikatoren aktuell';
    case 'stale':
      return 'OEM-Indikatoren veraltet';
    case 'no_data':
      return 'Keine OEM-Indikatoren';
    default:
      return 'OEM-Status unbekannt';
  }
}
