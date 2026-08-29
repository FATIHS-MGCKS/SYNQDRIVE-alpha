import type { StatusTone } from '../../../components/patterns';
import type { VehicleDamagesTranslate } from '../../lib/rental-vehicle-damages-i18n';
import type { DamageControlStats } from './damage-control.utils';

export function damageStatusSubtitle(stats: DamageControlStats, t: VehicleDamagesTranslate): string {
  if (stats.open === 0) return t('vehicleDamages.summary.subtitle.noOpen');

  const parts: string[] = [
    stats.open === 1
      ? t('vehicleDamages.summary.subtitle.openCase')
      : t('vehicleDamages.summary.subtitle.openCases', { count: stats.open }),
  ];
  if (stats.blockingRental > 0) {
    parts.push(
      stats.blockingRental === 1
        ? t('vehicleDamages.summary.subtitle.blockingOne')
        : t('vehicleDamages.summary.subtitle.blocking', { count: stats.blockingRental }),
    );
  } else if (stats.safetyCritical > 0) {
    parts.push(
      stats.safetyCritical === 1
        ? t('vehicleDamages.summary.subtitle.safetyCriticalOne')
        : t('vehicleDamages.summary.subtitle.safetyCritical', { count: stats.safetyCritical }),
    );
  }
  return parts.join(' · ');
}

export function damageStatusBadge(
  stats: DamageControlStats,
  t: VehicleDamagesTranslate,
): {
  label: string;
  tone: StatusTone;
} {
  if (stats.open === 0) {
    return { label: t('vehicleDamages.summary.badge.clear'), tone: 'success' };
  }
  if (stats.safetyCritical > 0) {
    return { label: t('vehicleDamages.summary.badge.safetyCritical'), tone: 'critical' };
  }
  if (stats.blockingRental > 0) {
    return { label: t('vehicleDamages.summary.badge.blocking'), tone: 'critical' };
  }
  if (stats.missingEvidence > 0 || stats.unplaced > 0) {
    return { label: t('vehicleDamages.summary.badge.needsReview'), tone: 'warning' };
  }
  return { label: t('vehicleDamages.summary.badge.open'), tone: 'warning' };
}

export function damageStatusSurfaceTone(
  stats: DamageControlStats,
): 'success' | 'warning' | 'critical' {
  if (stats.open === 0) return 'success';
  if (stats.safetyCritical > 0 || stats.blockingRental > 0) return 'critical';
  return 'warning';
}

export function damageRentalContextLine(
  stats: DamageControlStats,
  t: VehicleDamagesTranslate,
): string | null {
  if (stats.open === 0 || !stats.isRentable) {
    if (stats.open > 0 && stats.blockingRental > 0) {
      return t('vehicleDamages.summary.rentalContext.blocked');
    }
    return null;
  }
  if (stats.rentalGate === 'WATCH') {
    return t('vehicleDamages.summary.rentalContext.watch');
  }
  return null;
}
