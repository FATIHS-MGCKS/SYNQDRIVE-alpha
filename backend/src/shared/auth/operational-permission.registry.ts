import {
  SERVICE_CASE_PERMISSION_ACTIONS,
  SERVICE_CASE_PERMISSION_REQUIREMENTS,
  type ServiceCasePermissionAction,
  type ServiceCasePermissionRequirement,
} from '@modules/service-cases/service-case-permission.constants';
import {
  DATA_PROCESSING_PERMISSION_ACTIONS,
  DATA_PROCESSING_PERMISSION_REQUIREMENTS,
  type DataProcessingPermissionAction,
  type DataProcessingPermissionRequirement,
} from '@modules/data-authorizations/privacy-domain/review-workflow/data-processing-permission.constants';
import {
  TASK_PERMISSION_ACTIONS,
  TASK_PERMISSION_REQUIREMENTS,
  type TaskPermissionAction,
  type TaskPermissionRequirement,
} from '@modules/tasks/task-permission.constants';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from './permission.constants';

/**
 * Canonical registry of granular operational permission actions (tasks + service cases).
 * Controllers and UI gates should reference these keys — not ad-hoc module aliases.
 */
export const OPERATIONAL_PERMISSION_ACTIONS = [
  ...TASK_PERMISSION_ACTIONS,
  ...SERVICE_CASE_PERMISSION_ACTIONS,
  ...DATA_PROCESSING_PERMISSION_ACTIONS,
] as const;

export type OperationalPermissionAction =
  | TaskPermissionAction
  | ServiceCasePermissionAction
  | DataProcessingPermissionAction;

export type OperationalPermissionRequirement =
  | TaskPermissionRequirement
  | ServiceCasePermissionRequirement
  | DataProcessingPermissionRequirement;

export interface OperationalPermissionRequirementMap {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const OPERATIONAL_PERMISSION_REQUIREMENTS: Readonly<
  Record<OperationalPermissionAction, OperationalPermissionRequirementMap>
> = {
  ...TASK_PERMISSION_REQUIREMENTS,
  ...SERVICE_CASE_PERMISSION_REQUIREMENTS,
  ...DATA_PROCESSING_PERMISSION_REQUIREMENTS,
};

export function isOperationalPermissionAction(
  value: string,
): value is OperationalPermissionAction {
  return (OPERATIONAL_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
