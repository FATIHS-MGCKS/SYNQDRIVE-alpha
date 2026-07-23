import type { RentalVehicleCategoryStatus } from './rental-rules.types';

export const CATEGORY_STATUS_LABELS: Record<RentalVehicleCategoryStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
};

export const CATEGORY_STATUS_TONES: Record<
  RentalVehicleCategoryStatus,
  'neutral' | 'success' | 'watch' | 'warning' | 'critical'
> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  INACTIVE: 'watch',
  ARCHIVED: 'critical',
};

export function labelCategoryStatus(status: RentalVehicleCategoryStatus): string {
  return CATEGORY_STATUS_LABELS[status] ?? status;
}

export function categoryAllowsVehicleAssignment(status: RentalVehicleCategoryStatus): boolean {
  return status === 'ACTIVE' || status === 'DRAFT';
}

export const CATEGORY_LIFECYCLE_ACTIONS: Record<
  RentalVehicleCategoryStatus,
  Array<{ targetStatus: RentalVehicleCategoryStatus; label: string }>
> = {
  DRAFT: [
    { targetStatus: 'ACTIVE', label: 'Activate' },
    { targetStatus: 'ARCHIVED', label: 'Archive draft' },
  ],
  ACTIVE: [
    { targetStatus: 'INACTIVE', label: 'Deactivate' },
    { targetStatus: 'ARCHIVED', label: 'Archive' },
  ],
  INACTIVE: [
    { targetStatus: 'ACTIVE', label: 'Reactivate' },
    { targetStatus: 'ARCHIVED', label: 'Archive' },
  ],
  ARCHIVED: [{ targetStatus: 'ACTIVE', label: 'Restore' }],
};
