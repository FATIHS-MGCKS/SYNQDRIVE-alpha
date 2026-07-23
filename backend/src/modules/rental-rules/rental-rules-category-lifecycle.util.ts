import { BadRequestException, ConflictException } from '@nestjs/common';
import type { RentalVehicleCategoryStatus } from '@prisma/client';

export const RENTAL_CATEGORY_INVALID_LIFECYCLE_TRANSITION_CODE =
  'RENTAL_CATEGORY_INVALID_LIFECYCLE_TRANSITION';
export const RENTAL_CATEGORY_HARD_DELETE_BLOCKED_CODE = 'RENTAL_CATEGORY_HARD_DELETE_BLOCKED';

export const RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS: Record<
  RentalVehicleCategoryStatus,
  RentalVehicleCategoryStatus[]
> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['INACTIVE', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export function syncIsActiveFromCategoryStatus(status: RentalVehicleCategoryStatus): boolean {
  return status === 'ACTIVE';
}

export function isCategoryRulesEnforced(status: RentalVehicleCategoryStatus): boolean {
  return status === 'ACTIVE';
}

export function canAssignVehiclesToCategory(status: RentalVehicleCategoryStatus): boolean {
  return status === 'ACTIVE' || status === 'DRAFT';
}

export function canEditCategoryContent(status: RentalVehicleCategoryStatus): boolean {
  return status !== 'ARCHIVED';
}

export function assertCategoryLifecycleTransition(
  current: RentalVehicleCategoryStatus,
  target: RentalVehicleCategoryStatus,
): void {
  if (current === target) return;
  const allowed = RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    throw new BadRequestException({
      message: `Category cannot transition from ${current} to ${target}`,
      code: RENTAL_CATEGORY_INVALID_LIFECYCLE_TRANSITION_CODE,
      fromStatus: current,
      toStatus: target,
      allowedTargets: allowed,
    });
  }
}

export function resolveCategoryStatusDisplayName(
  name: string,
  status: RentalVehicleCategoryStatus,
): string {
  switch (status) {
    case 'INACTIVE':
      return `${name} (inactive)`;
    case 'ARCHIVED':
      return `${name} (archived)`;
    case 'DRAFT':
      return `${name} (draft)`;
    default:
      return name;
  }
}

export function throwCategoryHardDeleteBlocked(input: {
  categoryId: string;
  references: {
    assignedVehicles: number;
    bookings: number;
    eligibilitySnapshots: number;
  };
}): never {
  throw new ConflictException({
    message: 'Category cannot be hard-deleted while historical bookings or eligibility snapshots reference it',
    code: RENTAL_CATEGORY_HARD_DELETE_BLOCKED_CODE,
    categoryId: input.categoryId,
    references: input.references,
  });
}
