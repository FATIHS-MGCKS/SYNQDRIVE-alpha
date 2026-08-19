import type { DamageRentalImpact, Prisma } from '@prisma/client';

/** Canonical rental-blocking damage impacts — shared by RentalHealth and notifications. */
export const RENTAL_BLOCKING_DAMAGE_IMPACTS = ['BLOCK_RENTAL', 'SAFETY_CRITICAL'] as const;

export type RentalBlockingDamageImpact = (typeof RENTAL_BLOCKING_DAMAGE_IMPACTS)[number];

export interface RentalBlockingDamageRow {
  id: string;
  description: string | null;
  rentalImpact: DamageRentalImpact | string;
  status?: string;
}

export function isDamageRentalBlockingImpact(
  impact: DamageRentalImpact | string | null | undefined,
): impact is RentalBlockingDamageImpact {
  return (
    impact === 'BLOCK_RENTAL' ||
    impact === 'SAFETY_CRITICAL'
  );
}

/** Matches RentalHealth blocking query — OPEN damages with blocking rental impact. */
export function buildRentalBlockingDamagesWhere(
  organizationId: string,
  vehicleId: string,
): Prisma.VehicleDamageWhereInput {
  return {
    organizationId,
    vehicleId,
    status: 'OPEN',
    rentalImpact: { in: [...RENTAL_BLOCKING_DAMAGE_IMPACTS] },
  };
}

export function isRentalBlockingDamageRow(
  row: Pick<RentalBlockingDamageRow, 'status' | 'rentalImpact'>,
): boolean {
  if (row.status && row.status !== 'OPEN') return false;
  return isDamageRentalBlockingImpact(row.rentalImpact);
}

export function buildDamageRentalBlockingReasons(
  damages: Array<Pick<RentalBlockingDamageRow, 'description' | 'rentalImpact'>>,
): string[] {
  if (!damages.some((d) => isDamageRentalBlockingImpact(d.rentalImpact))) return [];
  return ['Schaden blockiert Vermietung'];
}

export function damageNotificationSeverity(
  rentalImpact: DamageRentalImpact | string,
): 'warning' | 'critical' {
  return rentalImpact === 'SAFETY_CRITICAL' ? 'critical' : 'warning';
}
