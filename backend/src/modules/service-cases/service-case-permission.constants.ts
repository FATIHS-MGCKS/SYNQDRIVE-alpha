import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Granular service-case permission actions.
 * Mapped to existing `{ module: 'vendor-management', read|write|manage }` membership JSON
 * for backward-compatible role templates (Service / Werkstatt domain).
 */
export const SERVICE_CASE_PERMISSION_ACTIONS = [
  'service_cases.read',
  'service_cases.create',
  'service_cases.update',
  'service_cases.schedule',
  'service_cases.complete',
  'service_cases.cancel',
  'service_cases.manage_costs',
] as const;

export type ServiceCasePermissionAction = (typeof SERVICE_CASE_PERMISSION_ACTIONS)[number];

export interface ServiceCasePermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const SERVICE_CASE_PERMISSION_REQUIREMENTS: Readonly<
  Record<ServiceCasePermissionAction, ServiceCasePermissionRequirement>
> = {
  'service_cases.read': { module: 'vendor-management', level: 'read' },
  'service_cases.create': { module: 'vendor-management', level: 'write' },
  'service_cases.update': { module: 'vendor-management', level: 'write' },
  'service_cases.schedule': { module: 'vendor-management', level: 'write' },
  'service_cases.complete': { module: 'vendor-management', level: 'write' },
  'service_cases.cancel': { module: 'vendor-management', level: 'write' },
  'service_cases.manage_costs': { module: 'vendor-management', level: 'manage' },
};

export function isServiceCasePermissionAction(
  value: string,
): value is ServiceCasePermissionAction {
  return (SERVICE_CASE_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
