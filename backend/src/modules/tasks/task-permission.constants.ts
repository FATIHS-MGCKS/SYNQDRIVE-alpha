import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Granular task permission actions for Fleet Health / Service Center RBAC.
 * Mapped to existing `{ module: 'tasks', read|write|manage }` membership JSON.
 */
export const TASK_PERMISSION_ACTIONS = [
  'tasks.read',
  'tasks.create',
  'tasks.update',
  'tasks.assign',
  'tasks.complete',
  'tasks.cancel',
  'tasks.manage_costs',
] as const;

export type TaskPermissionAction = (typeof TASK_PERMISSION_ACTIONS)[number];

export interface TaskPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const TASK_PERMISSION_REQUIREMENTS: Readonly<
  Record<TaskPermissionAction, TaskPermissionRequirement>
> = {
  'tasks.read': { module: 'tasks', level: 'read' },
  'tasks.create': { module: 'tasks', level: 'write' },
  'tasks.update': { module: 'tasks', level: 'write' },
  'tasks.assign': { module: 'tasks', level: 'write' },
  'tasks.complete': { module: 'tasks', level: 'write' },
  'tasks.cancel': { module: 'tasks', level: 'write' },
  'tasks.manage_costs': { module: 'tasks', level: 'manage' },
};

export function isTaskPermissionAction(value: string): value is TaskPermissionAction {
  return (TASK_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
