import type { RentalHealthState, VehicleHealthResponse } from '../lib/api';
import { isRentalHealthModuleVisibleInHealth } from './lib/operational-issues/operationalIssueTaxonomy';

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
    if (!isRentalHealthModuleVisibleInHealth(name, mod)) continue;
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
): QuickCardAccent {
  const neutral: QuickCardAccent = {
    backdrop: 'bg-muted/20',
    iconBox: 'bg-muted text-muted-foreground',
    countText: 'text-muted-foreground',
    faultBadge: 'sq-chip-neutral',
  };

  if (state === 'critical') {
    return {
      backdrop: 'bg-red-500/10',
      iconBox: 'sq-tone-critical',
      countText: 'text-[color:var(--status-critical)] drop-shadow-[0_0_12px_rgba(239,68,68,0.3)]',
      faultBadge: 'sq-chip-critical',
    };
  }
  if (state === 'warning') {
    return {
      backdrop: 'bg-amber-500/10',
      iconBox: 'sq-tone-watch',
      countText: 'text-[color:var(--status-watch)]',
      faultBadge: 'sq-chip-watch',
    };
  }
  if (state === 'good') {
    return {
      backdrop: 'bg-emerald-500/8',
      iconBox: 'sq-tone-success',
      countText: 'text-foreground',
      faultBadge: 'sq-chip-success',
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
): { card: string; dot: string; codePill: string; label: string } {
  const level = normalizeDtcDisplaySeverity(severity);
  if (level === 'high') {
    return {
      card: 'sq-tone-critical border border-border',
      dot: 'sq-dot-critical',
      codePill: 'sq-chip-critical',
      label: 'Kritisch',
    };
  }
  if (level === 'medium') {
    return {
      card: 'sq-tone-watch border border-border',
      dot: 'sq-dot-watch',
      codePill: 'sq-chip-watch',
      label: 'Warnung',
    };
  }
  return {
    card: 'sq-tone-info border border-border',
    dot: 'sq-dot-info',
    codePill: 'sq-chip-info',
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
): string {
  if (state === 'critical') {
    return 'sq-chip-critical border border-border';
  }
  if (state === 'warning') {
    return 'sq-chip-watch border border-border';
  }
  if (state === 'good') {
    return 'sq-chip-success border border-border';
  }
  return 'sq-chip-neutral border border-border';
}
