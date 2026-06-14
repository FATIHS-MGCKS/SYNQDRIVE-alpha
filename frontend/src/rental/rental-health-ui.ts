import type { RentalHealthState, VehicleHealthResponse } from '../lib/api';

export const RENTAL_HEALTH_MODULE_LABELS: Record<string, string> = {
  battery: 'Battery',
  tires: 'Tires',
  brakes: 'Brakes',
  error_codes: 'Error codes',
  service_compliance: 'Service / TÜV',
  complaints: 'Complaints',
  vehicle_alerts: 'Vehicle alerts',
};

export interface RentalHealthReason {
  module: string;
  label: string;
  state: RentalHealthState;
  reason: string;
}

/** Warning/critical module rows from the canonical Rental-Health-V1 payload. */
export function collectRentalHealthReasons(
  health: VehicleHealthResponse | null | undefined,
): RentalHealthReason[] {
  if (!health) return [];
  const out: RentalHealthReason[] = [];
  for (const [name, mod] of Object.entries(health.modules)) {
    if (mod.state === 'critical' || mod.state === 'warning') {
      out.push({
        module: name,
        label: RENTAL_HEALTH_MODULE_LABELS[name] ?? name.replace(/_/g, ' '),
        state: mod.state,
        reason: mod.reason,
      });
    }
  }
  out.sort(
    (a, b) =>
      (a.state === 'critical' ? -1 : 1) - (b.state === 'critical' ? -1 : 1),
  );
  return out;
}

export type VhcDisplayStatus =
  | 'LOADING'
  | 'GOOD'
  | 'ATTENTION_NEEDED'
  | 'CRITICAL'
  | 'NO_RECENT_DATA';

/** Map Rental-Health `overall_state` to the VHC status keys used in HealthErrorsView. */
export function rentalOverallToVhcStatus(
  overall: RentalHealthState | undefined,
  loading: boolean,
): VhcDisplayStatus {
  if (loading && !overall) return 'LOADING';
  switch (overall) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'ATTENTION_NEEDED';
    case 'good':
      return 'GOOD';
    default:
      return 'NO_RECENT_DATA';
  }
}

export interface QuickCardAccent {
  backdrop: string;
  iconBox: string;
  countText: string;
  faultBadge: string;
}

/** Tone classes for quick-view module cards — driven by Rental-Health module state. */
export function quickCardAccentFromRentalState(
  state: RentalHealthState | undefined,
  isDarkMode: boolean,
): QuickCardAccent {
  const neutral: QuickCardAccent = {
    backdrop: 'bg-muted/20',
    iconBox: isDarkMode
      ? 'bg-muted text-muted-foreground'
      : 'bg-muted text-muted-foreground',
    countText: 'text-muted-foreground',
    faultBadge: isDarkMode
      ? 'bg-muted text-muted-foreground'
      : 'bg-muted text-muted-foreground',
  };

  if (state === 'critical') {
    return {
      backdrop: 'bg-red-500/10',
      iconBox: isDarkMode
        ? 'bg-red-500/15 text-red-400'
        : 'bg-red-50 text-red-600',
      countText: 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.3)]',
      faultBadge: isDarkMode
        ? 'bg-red-500/10 text-red-400'
        : 'bg-red-50 text-red-700',
    };
  }
  if (state === 'warning') {
    return {
      backdrop: 'bg-amber-500/10',
      iconBox: isDarkMode
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-amber-50 text-amber-600',
      countText: isDarkMode ? 'text-amber-400' : 'text-amber-600',
      faultBadge: isDarkMode
        ? 'bg-amber-500/10 text-amber-400'
        : 'bg-amber-50 text-amber-700',
    };
  }
  if (state === 'good') {
    return {
      backdrop: 'bg-emerald-500/8',
      iconBox: isDarkMode
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-emerald-50 text-emerald-600',
      countText: isDarkMode ? 'text-foreground' : 'text-foreground',
      faultBadge: isDarkMode
        ? 'bg-emerald-500/10 text-emerald-400'
        : 'bg-emerald-50 text-emerald-700',
    };
  }
  return neutral;
}

export function serviceCardBorderFromRentalState(
  state: RentalHealthState | undefined,
): string {
  if (state === 'critical') {
    return 'border-red-500/50 dark:border-red-500/40 ring-1 ring-red-500/20';
  }
  if (state === 'warning') {
    return 'border-amber-500/50 dark:border-amber-500/40 ring-1 ring-amber-500/20';
  }
  return '';
}

export type DtcDisplaySeverity = 'high' | 'medium' | 'low';

export function normalizeDtcDisplaySeverity(
  severity: string | null | undefined,
): DtcDisplaySeverity {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high' || s === 'critical') return 'high';
  if (s === 'low' || s === 'info') return 'low';
  return 'medium';
}

/** Per-fault card chrome in the DTC modal — severity-aware, not binary red. */
export function dtcFaultCardTone(
  severity: string | null | undefined,
  isDarkMode: boolean,
): { card: string; dot: string; codePill: string; label: string } {
  const level = normalizeDtcDisplaySeverity(severity);
  if (level === 'high') {
    return {
      card: isDarkMode
        ? 'bg-red-500/5 border-red-500/20'
        : 'bg-red-50 border-red-200/60',
      dot: 'bg-red-500',
      codePill: isDarkMode
        ? 'bg-red-500/20 text-red-400'
        : 'bg-red-100 text-red-700',
      label: 'Kritisch',
    };
  }
  if (level === 'medium') {
    return {
      card: isDarkMode
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-amber-50 border-amber-200/60',
      dot: 'bg-amber-500',
      codePill: isDarkMode
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-amber-100 text-amber-700',
      label: 'Warnung',
    };
  }
  return {
    card: isDarkMode
      ? 'bg-blue-500/5 border-blue-500/20'
      : 'bg-blue-50 border-blue-200/60',
    dot: 'bg-blue-500',
    codePill: isDarkMode
      ? 'bg-blue-500/15 text-blue-400'
      : 'bg-blue-100 text-blue-700',
    label: 'Info',
  };
}

export function rentalStateLabelDe(state: RentalHealthState | undefined): string {
  switch (state) {
    case 'critical':
      return 'Kritisch';
    case 'warning':
      return 'Warnung';
    case 'good':
      return 'OK';
    case 'unknown':
      return 'Unbekannt';
    case 'n_a':
      return 'N/A';
    default:
      return '—';
  }
}

export function rentalStatePillClasses(
  state: RentalHealthState | undefined,
  isDarkMode: boolean,
): string {
  if (state === 'critical') {
    return isDarkMode
      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
      : 'bg-red-50 text-red-700 border border-red-200';
  }
  if (state === 'warning') {
    return isDarkMode
      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
      : 'bg-amber-50 text-amber-700 border border-amber-200';
  }
  if (state === 'good') {
    return isDarkMode
      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
      : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }
  return isDarkMode
    ? 'bg-muted text-muted-foreground border border-border'
    : 'bg-muted text-muted-foreground border border-border';
}
