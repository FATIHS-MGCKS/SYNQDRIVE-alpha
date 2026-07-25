import { DamageStatus } from '@prisma/client';

export const FINAL_DAMAGE_STATUSES: ReadonlySet<DamageStatus> = new Set([
  DamageStatus.REPAIRED,
  DamageStatus.ARCHIVED,
]);

export function isFinalDamageStatus(status: DamageStatus): boolean {
  return FINAL_DAMAGE_STATUSES.has(status);
}

export function assertDamageStatusTransition(
  current: DamageStatus,
  next: DamageStatus,
): void {
  if (current === next) return;
  if (isFinalDamageStatus(current)) {
    throw new Error(`Damage in final status ${current} cannot transition to ${next}`);
  }
}

export function assertDamageMutable(current: DamageStatus): void {
  if (isFinalDamageStatus(current)) {
    throw new Error(`Damage in final status ${current} cannot be modified`);
  }
}
