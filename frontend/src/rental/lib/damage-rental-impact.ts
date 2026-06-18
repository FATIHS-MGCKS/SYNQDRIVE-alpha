import type { DamageResponse, DamageRentalImpact } from './damage.types';
import { isActiveDamage } from './damage.types';

/**
 * Aggregated rental gate derived from active damages only.
 *
 * Future hook point: `RentalHealthService.collectBlockingReasons` should consume
 * the same priority rules when vehicle damages are wired into the central
 * rental_blocked aggregator (see backend rental-health.service.ts).
 */
export type DamageRentalGate = 'RENTABLE' | 'WATCH' | 'RENTAL_BLOCKED' | 'SAFETY_CRITICAL';

const IMPACT_RANK: Record<DamageRentalImpact, number> = {
  SAFETY_CRITICAL: 0,
  BLOCK_RENTAL: 1,
  WATCH: 2,
  NONE: 3,
};

export function deriveDamageRentalImpact(damages: DamageResponse[]): DamageRentalGate {
  const active = damages.filter(isActiveDamage);
  if (!active.length) return 'RENTABLE';

  let worst: DamageRentalImpact = 'NONE';
  for (const damage of active) {
    if (IMPACT_RANK[damage.rentalImpact] < IMPACT_RANK[worst]) {
      worst = damage.rentalImpact;
    }
  }

  switch (worst) {
    case 'SAFETY_CRITICAL':
      return 'SAFETY_CRITICAL';
    case 'BLOCK_RENTAL':
      return 'RENTAL_BLOCKED';
    case 'WATCH':
      return 'WATCH';
    default:
      return 'RENTABLE';
  }
}

export function damageRentalGateLabel(gate: DamageRentalGate): string {
  switch (gate) {
    case 'SAFETY_CRITICAL':
      return 'Safety critical';
    case 'RENTAL_BLOCKED':
      return 'Rental blocked';
    case 'WATCH':
      return 'Watch';
    default:
      return 'Vehicle rentable';
  }
}

export function damageRentalGateTone(
  gate: DamageRentalGate,
): 'success' | 'warning' | 'critical' {
  switch (gate) {
    case 'SAFETY_CRITICAL':
    case 'RENTAL_BLOCKED':
      return 'critical';
    case 'WATCH':
      return 'warning';
    default:
      return 'success';
  }
}

export function isDamageRentalBlocked(gate: DamageRentalGate): boolean {
  return gate === 'SAFETY_CRITICAL' || gate === 'RENTAL_BLOCKED';
}
