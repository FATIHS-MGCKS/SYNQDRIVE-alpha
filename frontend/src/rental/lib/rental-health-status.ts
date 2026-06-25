import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../lib/api';
import type { HealthState, StatusTone } from '../../components/patterns';
import { normalizeHealthState } from '../../components/patterns';

/** Canonical health semantics used across Fleet Condition, drawer, and vehicle health surfaces. */
export type RentalHealthSemantic =
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown'
  | 'n_a'
  | 'blocked'
  | 'stale'
  | 'no_tracking'
  | 'estimated'
  | 'live'
  | 'review';

const SURFACE_BY_TONE: Record<StatusTone, string> = {
  success: 'sq-tone-success',
  watch: 'sq-tone-watch',
  warning: 'sq-tone-warning',
  critical: 'sq-tone-critical',
  info: 'sq-tone-info',
  neutral: 'sq-tone-neutral',
  ai: 'sq-tone-ai',
  noData: 'sq-tone-nodata',
};

const CHIP_BY_TONE: Record<StatusTone, string> = {
  success: 'sq-chip-success',
  watch: 'sq-chip-watch',
  warning: 'sq-chip-warning',
  critical: 'sq-chip-critical',
  info: 'sq-chip-info',
  neutral: 'sq-chip-neutral',
  ai: 'sq-chip-ai',
  noData: 'sq-chip-nodata',
};

export function toneToSurfaceClass(tone: StatusTone): string {
  return SURFACE_BY_TONE[tone] ?? 'sq-tone-neutral';
}

export function toneToChipClass(tone: StatusTone): string {
  return CHIP_BY_TONE[tone] ?? 'sq-chip-neutral';
}

/** RentalHealth module/overall state → semantic StatusTone. Unknown ≠ success. */
export function rentalHealthStateToTone(state: RentalHealthState | undefined): StatusTone {
  switch (state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'success';
    case 'n_a':
      return 'noData';
    case 'unknown':
    default:
      return 'neutral';
  }
}

export function rentalHealthStateToHealthState(
  state: RentalHealthState | undefined,
): HealthState {
  if (!state) return 'unknown';
  if (state === 'n_a') return 'no_data';
  return normalizeHealthState(state);
}

export function rentalHealthStateLabel(state: RentalHealthState | undefined): string {
  switch (state) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'good':
      return 'Good';
    case 'unknown':
      return 'Limited data';
    case 'n_a':
      return 'No tracking';
    default:
      return 'Unavailable';
  }
}

export function rentalGateToTone(
  health: VehicleHealthResponse | null | undefined,
): { label: string; tone: StatusTone } {
  if (!health) return { label: 'Limited data', tone: 'noData' };
  if (health.rental_blocked) return { label: 'Blocked', tone: 'critical' };
  if (health.overall_state === 'unknown') return { label: 'Limited data', tone: 'noData' };
  if (health.overall_state === 'good') return { label: 'Can rent', tone: 'success' };
  return { label: 'Review', tone: 'watch' };
}

export function evidenceTypeToTone(
  evidenceType: RentalHealthModule['evidence_type'] | undefined,
): StatusTone {
  switch (evidenceType) {
    case 'measured':
      return 'success';
    case 'estimated':
      return 'info';
    case 'provider':
      return 'info';
    case 'manual':
    case 'document':
    case 'complaint':
      return 'neutral';
    case 'unknown':
    default:
      return 'noData';
  }
}

export function evidenceTypeLabel(
  evidenceType: RentalHealthModule['evidence_type'] | undefined,
  source?: string,
): string {
  if (evidenceType) {
    const labels: Record<string, string> = {
      measured: 'Measured',
      estimated: 'Estimated',
      provider: 'Provider signal',
      manual: 'Manual entry',
      document: 'Document',
      complaint: 'Complaint',
      unknown: 'Unknown',
    };
    return labels[evidenceType] ?? evidenceType;
  }
  return source ?? '—';
}

export function dataFreshnessForModule(
  mod: RentalHealthModule,
): { label: string; tone: StatusTone; semantic: RentalHealthSemantic } {
  if (mod.state === 'n_a' || (mod.state === 'unknown' && !mod.last_updated_at)) {
    return { label: 'No tracking', tone: 'noData', semantic: 'no_tracking' };
  }
  if (mod.data_stale) {
    return { label: 'Delayed data', tone: 'watch', semantic: 'stale' };
  }
  if (mod.evidence_type === 'estimated') {
    return { label: 'Estimated', tone: 'info', semantic: 'estimated' };
  }
  if (!mod.last_updated_at) {
    return { label: 'No tracking', tone: 'noData', semantic: 'no_tracking' };
  }
  return { label: 'Fresh', tone: 'success', semantic: 'live' };
}

export function operatorGroupTone(
  group: 'action_required' | 'needs_review' | 'limited_data' | 'good',
): StatusTone {
  switch (group) {
    case 'action_required':
      return 'critical';
    case 'needs_review':
      return 'warning';
    case 'limited_data':
      return 'noData';
    case 'good':
      return 'success';
    default:
      return 'neutral';
  }
}

export interface QuickCardAccent {
  backdrop: string;
  iconBox: string;
  countText: string;
  faultBadge: string;
}

/** Module quick-card chrome — token-only, no raw Tailwind status colors. */
export function quickCardAccentFromRentalState(
  state: RentalHealthState | undefined,
): QuickCardAccent {
  const neutral: QuickCardAccent = {
    backdrop: 'bg-muted/20',
    iconBox: 'sq-tone-neutral',
    countText: 'text-muted-foreground',
    faultBadge: 'sq-chip-neutral',
  };

  const tone = rentalHealthStateToTone(state);
  if (tone === 'critical') {
    return {
      backdrop: 'bg-[color:color-mix(in_srgb,var(--status-critical)_8%,transparent)]',
      iconBox: toneToSurfaceClass('critical'),
      countText: 'text-[color:var(--status-critical)]',
      faultBadge: toneToChipClass('critical'),
    };
  }
  if (tone === 'warning' || tone === 'watch') {
    return {
      backdrop: 'bg-[color:color-mix(in_srgb,var(--status-attention)_8%,transparent)]',
      iconBox: toneToSurfaceClass('watch'),
      countText: 'text-[color:var(--status-attention)]',
      faultBadge: toneToChipClass('watch'),
    };
  }
  if (tone === 'success') {
    return {
      backdrop: 'bg-[color:color-mix(in_srgb,var(--status-positive)_6%,transparent)]',
      iconBox: toneToSurfaceClass('success'),
      countText: 'text-foreground',
      faultBadge: toneToChipClass('success'),
    };
  }
  return neutral;
}

export function serviceCardBorderFromRentalState(
  state: RentalHealthState | undefined,
): string {
  const tone = rentalHealthStateToTone(state);
  if (tone === 'critical') {
    return 'ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_22%,transparent)] border-[color:color-mix(in_srgb,var(--status-critical)_35%,transparent)]';
  }
  if (tone === 'warning' || tone === 'watch') {
    return 'ring-1 ring-[color:color-mix(in_srgb,var(--status-attention)_18%,transparent)] border-[color:color-mix(in_srgb,var(--status-attention)_30%,transparent)]';
  }
  return '';
}

/** Percent bar fill — semantic tokens only; use when a wear/SOH bar is justified. */
export function healthPercentBarFillClass(
  percent: number | null | undefined,
  options?: { estimated?: boolean },
): string {
  if (percent == null || !Number.isFinite(percent)) {
    return 'bg-muted-foreground/30';
  }
  if (options?.estimated) {
    return 'bg-[color:var(--status-info)]';
  }
  if (percent >= 70) return 'bg-[color:var(--status-positive)]';
  if (percent >= 40) return 'bg-[color:var(--status-attention)]';
  return 'bg-[color:var(--status-critical)]';
}

export function healthPercentTextClass(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return 'text-muted-foreground';
  if (percent >= 70) return 'text-[color:var(--status-positive)]';
  if (percent >= 40) return 'text-[color:var(--status-attention)]';
  return 'text-[color:var(--status-critical)]';
}

export function severityToTone(severity: string | null | undefined): StatusTone {
  const s = (severity ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'warning' || s === 'medium') return 'warning';
  if (s === 'watch') return 'watch';
  return 'neutral';
}

export function tireCanonicalStatusToTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'GOOD':
      return 'success';
    case 'WATCH':
      return 'watch';
    case 'WARNING':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    case 'UNKNOWN':
    default:
      return 'noData';
  }
}
