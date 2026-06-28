import type { StatusTone } from '../../../components/patterns';
import type { DamageControlStats } from './damage-control.utils';

/** UI-only copy for the Vehicle Detail → Damages tab summary (not rental readiness). */
export const DAMAGE_SUMMARY_COPY = {
  statusTitle: 'Damage Status',
  kpi: {
    open: 'Open damages',
    blocking: 'Blocking',
    safetyCritical: 'Safety critical',
    missingEvidence: 'Missing evidence',
    unplaced: 'Missing location',
    estimatedCost: 'Estimated cost',
    oldestCase: 'Oldest case',
  },
  kpiHint: {
    open: 'Active cases',
    blocking: 'Blocks bookings',
    safetyCritical: 'Immediate attention',
    missingEvidence: 'No photos yet',
    unplaced: 'No map position',
    estimatedCost: 'Open cases',
    oldestCase: 'Days since report',
  },
} as const;

export function damageStatusSubtitle(stats: DamageControlStats): string {
  if (stats.open === 0) return 'No open damages';

  const parts: string[] = [
    stats.open === 1 ? '1 open damage case' : `${stats.open} open damage cases`,
  ];
  if (stats.blockingRental > 0) {
    parts.push(
      stats.blockingRental === 1 ? '1 blocking' : `${stats.blockingRental} blocking`,
    );
  } else if (stats.safetyCritical > 0) {
    parts.push(
      stats.safetyCritical === 1
        ? '1 safety critical'
        : `${stats.safetyCritical} safety critical`,
    );
  }
  return parts.join(' · ');
}

export function damageStatusBadge(stats: DamageControlStats): {
  label: string;
  tone: StatusTone;
} {
  if (stats.open === 0) {
    return { label: 'Clear', tone: 'success' };
  }
  if (stats.safetyCritical > 0) {
    return { label: 'Safety critical', tone: 'critical' };
  }
  if (stats.blockingRental > 0) {
    return { label: 'Blocking', tone: 'critical' };
  }
  if (stats.missingEvidence > 0 || stats.unplaced > 0) {
    return { label: 'Needs review', tone: 'warning' };
  }
  return { label: 'Open', tone: 'warning' };
}

export function damageStatusSurfaceTone(
  stats: DamageControlStats,
): 'success' | 'warning' | 'critical' {
  if (stats.open === 0) return 'success';
  const badge = damageStatusBadge(stats);
  if (badge.tone === 'critical') return 'critical';
  return 'warning';
}

export function damageRentalContextLine(stats: DamageControlStats): string | null {
  if (stats.open === 0 || !stats.isRentable) {
    if (stats.open > 0 && stats.blockingRental > 0) {
      return 'Rental may be blocked until resolved.';
    }
    return null;
  }
  if (stats.rentalGate === 'WATCH') {
    return 'Open damages under watch — rental still allowed.';
  }
  return null;
}
