import type { RentalHealthModule, VehicleHealthResponse } from '../../../lib/api';
import { collectRentalHealthReasons } from '../../rental-health-ui';

/**
 * Vehicle overview display — separates Health Severity from Data Coverage.
 *
 * Rules:
 * - Limited Data is Data Coverage, not Health Severity.
 * - RentalHealth `unknown` / `n_a` must not become the dominant health label when
 *   no active issues exist and at least one core module is usable.
 * - Critical / Warning take priority over Good.
 * - Data Coverage never overrides Critical / Warning severity.
 */

export type HealthSeverityDisplay =
  | 'loading'
  | 'unavailable'
  | 'critical'
  | 'warning'
  | 'good'
  | 'no_data';

export type DataCoverageDisplay = 'complete' | 'limited' | 'no_tracking' | 'stale';

const CORE_MODULES = ['brakes', 'tires', 'battery'] as const;

export function isCoreModuleTracked(mod?: RentalHealthModule): boolean {
  if (!mod) return false;
  if (mod.state === 'good' || mod.state === 'warning' || mod.state === 'critical') return true;
  if (mod.state === 'unknown' || mod.state === 'n_a') {
    return !!mod.last_updated_at;
  }
  return false;
}

export function countTrackedCoreModulesFromRental(health: VehicleHealthResponse | null | undefined): {
  tracked: number;
  untracked: number;
  hasStale: boolean;
} {
  if (!health) return { tracked: 0, untracked: 3, hasStale: false };
  let tracked = 0;
  let hasStale = false;
  for (const key of CORE_MODULES) {
    const mod = health.modules[key];
    if (isCoreModuleTracked(mod)) tracked += 1;
    if (mod?.data_stale) hasStale = true;
  }
  return { tracked, untracked: 3 - tracked, hasStale };
}

function buildSeverityTitle(health: VehicleHealthResponse): string | undefined {
  const reasons = collectRentalHealthReasons(health);
  const titleParts: string[] = [];
  if (health.rental_blocked && health.blocking_reasons.length > 0) {
    titleParts.push(`Blocked: ${health.blocking_reasons.join(' · ')}`);
  }
  for (const r of reasons) {
    titleParts.push(`${r.label}: ${r.reason}`);
  }
  return titleParts.join(' · ') || undefined;
}

export function mapHealthSeverityDisplay(params: {
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
  /** Local box tracking (brakes/tires/battery) when available — more accurate than rental modules. */
  trackedCount?: number;
  statCriticalCount?: number;
  statWarningCount?: number;
}): { severity: HealthSeverityDisplay; label: string; title?: string } {
  const {
    rentalHealth,
    rentalHealthLoading,
    healthError,
    trackedCount,
    statCriticalCount,
    statWarningCount,
  } = params;

  if (rentalHealthLoading && !rentalHealth) {
    return { severity: 'loading', label: 'Loading…' };
  }
  if (healthError && !rentalHealth) {
    return { severity: 'unavailable', label: 'No Data', title: healthError };
  }
  if (!rentalHealth) {
    return { severity: 'no_data', label: 'No Data' };
  }

  const title = buildSeverityTitle(rentalHealth);
  const reasons = collectRentalHealthReasons(rentalHealth);
  const criticalCount = statCriticalCount ?? reasons.filter((r) => r.state === 'critical').length;
  const warningCount = statWarningCount ?? reasons.filter((r) => r.state === 'warning').length;

  if (criticalCount > 0 || rentalHealth.overall_state === 'critical') {
    return { severity: 'critical', label: 'Critical', title };
  }
  if (warningCount > 0 || rentalHealth.overall_state === 'warning') {
    return { severity: 'warning', label: 'Warning', title };
  }

  const effectiveTracked = trackedCount ?? countTrackedCoreModulesFromRental(rentalHealth).tracked;
  if (effectiveTracked > 0 || rentalHealth.overall_state === 'good') {
    return { severity: 'good', label: 'Good', title };
  }

  return { severity: 'no_data', label: 'No Data', title };
}

export function mapDataCoverageDisplay(params: {
  rentalHealth: VehicleHealthResponse | null;
  trackedCount?: number;
  untrackedCount?: number;
}): { coverage: DataCoverageDisplay; label: string } | null {
  const { rentalHealth, trackedCount, untrackedCount } = params;
  if (!rentalHealth) return null;

  const rentalCounts = countTrackedCoreModulesFromRental(rentalHealth);
  const tracked = trackedCount ?? rentalCounts.tracked;
  const untracked = untrackedCount ?? rentalCounts.untracked;
  const hasStale =
    rentalCounts.hasStale || CORE_MODULES.some((key) => rentalHealth.modules[key]?.data_stale);

  if (tracked === 0) {
    return { coverage: 'no_tracking', label: 'No Tracking' };
  }
  if (hasStale) {
    return { coverage: 'stale', label: 'Stale Data' };
  }
  if (untracked > 0) {
    return { coverage: 'limited', label: 'Limited Data' };
  }
  return null;
}
