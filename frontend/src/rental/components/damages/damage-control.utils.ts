import type {
  DamageLocationView,
  DamageResponse,
  DamageStatsResponse,
} from '../../lib/damage.types';
import {
  formatEuroCents,
  hasValidMapPin,
  isActiveDamage,
  isArchivedDamage,
  isSolvedDamage,
  normalizeDamageStatus,
} from '../../lib/damage.types';
import {
  damageRentalGateLabel,
  deriveDamageRentalImpact,
  isDamageRentalBlocked,
  type DamageRentalGate,
} from '../../lib/damage-rental-impact';

export type DamageQueueFilter =
  | 'open'
  | 'blocking'
  | 'missing_evidence'
  | 'unplaced'
  | 'repaired'
  | 'all';

export interface DamageControlStats {
  open: number;
  blockingRental: number;
  safetyCritical: number;
  missingEvidence: number;
  unplaced: number;
  estimatedOpenCostCents: number;
  oldestOpenDamageAt: string | null;
  total: number;
  repaired: number;
  rentalGate: DamageRentalGate;
  isRentable: boolean;
  rentabilityLabel: string;
}

export function deriveControlStats(
  damages: DamageResponse[],
  apiStats: DamageStatsResponse | null,
): DamageControlStats {
  const open = apiStats?.active ?? damages.filter(isActiveDamage).length;
  const blockingRental =
    apiStats?.blockingRental ??
    damages.filter(
      (d) => isActiveDamage(d) && d.rentalImpact === 'BLOCK_RENTAL',
    ).length;
  const safetyCritical =
    apiStats?.safetyCritical ??
    damages.filter(
      (d) => isActiveDamage(d) && d.rentalImpact === 'SAFETY_CRITICAL',
    ).length;
  const missingEvidence =
    apiStats?.missingEvidence ??
    damages.filter(
      (d) => isActiveDamage(d) && d.evidenceStatus === 'MISSING',
    ).length;
  const unplaced =
    apiStats?.unplaced ??
    damages.filter((d) => isActiveDamage(d) && !hasValidMapPin(d)).length;
  const estimatedOpenCostCents =
    apiStats?.estimatedOpenCostCents ??
    damages
      .filter(isActiveDamage)
      .reduce((sum, d) => sum + (d.estimatedCostCents ?? 0), 0);
  const oldestOpenDamageAt =
    apiStats?.oldestOpenDamageAt ??
    (() => {
      const openRows = damages.filter(isActiveDamage);
      if (!openRows.length) return null;
      return openRows.reduce(
        (oldest, d) => (d.reportedAt < oldest ? d.reportedAt : oldest),
        openRows[0].reportedAt,
      );
    })();

  const rentalGate = deriveDamageRentalImpact(damages);
  const blocked = isDamageRentalBlocked(rentalGate);
  return {
    open,
    blockingRental,
    safetyCritical,
    missingEvidence,
    unplaced,
    estimatedOpenCostCents,
    oldestOpenDamageAt,
    total: apiStats?.total ?? damages.length,
    repaired: apiStats?.repaired ?? damages.filter(isSolvedDamage).length,
    rentalGate,
    isRentable: !blocked,
    rentabilityLabel: damageRentalGateLabel(rentalGate),
  };
}

export function filterDamages(
  damages: DamageResponse[],
  filter: DamageQueueFilter,
): DamageResponse[] {
  switch (filter) {
    case 'open':
      return damages.filter(isActiveDamage);
    case 'blocking':
      return damages.filter(
        (d) =>
          isActiveDamage(d) &&
          (d.rentalImpact === 'BLOCK_RENTAL' || d.rentalImpact === 'SAFETY_CRITICAL'),
      );
    case 'missing_evidence':
      return damages.filter(
        (d) => isActiveDamage(d) && d.evidenceStatus === 'MISSING',
      );
    case 'unplaced':
      return damages.filter((d) => isActiveDamage(d) && !hasValidMapPin(d));
    case 'repaired':
      return damages.filter(isSolvedDamage);
    case 'all':
    default:
      return damages.filter((d) => !isArchivedDamage(d));
  }
}

export function sortDamagesForQueue(rows: DamageResponse[]): DamageResponse[] {
  const rank = (d: DamageResponse): number => {
    if (!isActiveDamage(d)) return 100;
    if (d.rentalImpact === 'SAFETY_CRITICAL') return 0;
    if (d.rentalImpact === 'BLOCK_RENTAL') return 1;
    if (d.evidenceStatus === 'MISSING') return 2;
    if (normalizeDamageStatus(d) === 'IN_REPAIR') return 3;
    return 4;
  };
  return [...rows].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (isSolvedDamage(a) && isSolvedDamage(b)) {
      return (b.repairedAt ?? '').localeCompare(a.repairedAt ?? '');
    }
    return b.reportedAt.localeCompare(a.reportedAt);
  });
}

export type PinVisualVariant = 'critical' | 'blocking' | 'warning' | 'in_repair' | 'repaired' | 'neutral';

export function pinVariantForDamage(damage: DamageResponse): PinVisualVariant {
  const status = normalizeDamageStatus(damage);
  if (status === 'REPAIRED') return 'repaired';
  if (status === 'IN_REPAIR') return 'in_repair';
  if (damage.rentalImpact === 'SAFETY_CRITICAL') return 'critical';
  if (damage.rentalImpact === 'BLOCK_RENTAL') return 'blocking';
  if (damage.rentalImpact === 'WATCH' || damage.severity === 'MODERATE' || damage.severity === 'MAJOR') {
    return 'warning';
  }
  return 'neutral';
}

export const PIN_VARIANT_CLASS: Record<PinVisualVariant, string> = {
  critical: 'bg-red-600 border-red-200 shadow-red-500/30',
  blocking: 'bg-orange-600 border-orange-200 shadow-orange-500/30',
  warning: 'bg-amber-500 border-amber-200 shadow-amber-500/25',
  in_repair: 'bg-sky-600 border-sky-200 shadow-sky-500/25',
  repaired: 'bg-emerald-600/70 border-emerald-200/80 shadow-emerald-500/20',
  neutral: 'bg-zinc-600 border-zinc-200 shadow-zinc-500/20',
};

export function imageSourceLabel(
  source: 'vehicle' | 'model' | 'blueprint',
): string {
  if (source === 'vehicle') return 'Vehicle photo';
  if (source === 'model') return 'Model template';
  return 'Blueprint fallback';
}

export function resolveCanvasImageSource(
  hasVehicle: boolean,
  hasModel: boolean,
): 'vehicle' | 'model' | 'blueprint' {
  if (hasVehicle) return 'vehicle';
  if (hasModel) return 'model';
  return 'blueprint';
}

export function formatOldestOpenAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatEstimatedOpenCost(cents: number): string {
  return formatEuroCents(cents) ?? '€0.00';
}

export const DAMAGE_MAP_VIEWS: { key: DamageLocationView; label: string; iconName: string }[] = [
  { key: 'FRONT', label: 'Front', iconName: 'arrow-up' },
  { key: 'LEFT', label: 'Left', iconName: 'arrow-left' },
  { key: 'RIGHT', label: 'Right', iconName: 'arrow-right' },
  { key: 'REAR', label: 'Rear', iconName: 'arrow-down' },
  { key: 'ROOF', label: 'Roof', iconName: 'square' },
];
