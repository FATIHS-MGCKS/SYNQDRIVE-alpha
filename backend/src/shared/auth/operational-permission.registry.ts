import {
  BOOKING_PERMISSION_ACTIONS,
  BOOKING_PERMISSION_REQUIREMENTS,
  type BookingPermissionAction,
  type BookingPermissionRequirement,
} from '@modules/bookings/booking-permission.constants';
import {
  SERVICE_CASE_PERMISSION_ACTIONS,
  SERVICE_CASE_PERMISSION_REQUIREMENTS,
  type ServiceCasePermissionAction,
  type ServiceCasePermissionRequirement,
} from '@modules/service-cases/service-case-permission.constants';
import {
  TASK_PERMISSION_ACTIONS,
  TASK_PERMISSION_REQUIREMENTS,
  type TaskPermissionAction,
  type TaskPermissionRequirement,
} from '@modules/tasks/task-permission.constants';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from './permission.constants';

/**
 * Canonical registry of granular operational permission actions (bookings + tasks + service cases).
 * Controllers and UI gates should reference these keys — not ad-hoc module aliases.
 */
export const OPERATIONAL_PERMISSION_ACTIONS = [
  ...BOOKING_PERMISSION_ACTIONS,
  ...TASK_PERMISSION_ACTIONS,
  ...SERVICE_CASE_PERMISSION_ACTIONS,
] as const;

export type OperationalPermissionAction =
  | BookingPermissionAction
  | TaskPermissionAction
  | ServiceCasePermissionAction;

export type OperationalPermissionRequirement =
  | BookingPermissionRequirement
  | TaskPermissionRequirement
  | ServiceCasePermissionRequirement;

export interface OperationalPermissionRequirementMap {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const OPERATIONAL_PERMISSION_REQUIREMENTS: Readonly<
  Record<OperationalPermissionAction, OperationalPermissionRequirementMap>
> = {
  ...BOOKING_PERMISSION_REQUIREMENTS,
  ...TASK_PERMISSION_REQUIREMENTS,
  ...SERVICE_CASE_PERMISSION_REQUIREMENTS,
};

export function isOperationalPermissionAction(
  value: string,
): value is OperationalPermissionAction {
  return (OPERATIONAL_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
