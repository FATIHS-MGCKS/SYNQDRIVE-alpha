import type { ApiTask } from '../../lib/api';
import { resolveUserName } from './task-list.utils';

export interface OrgMemberForRouting {
  id: string;
  name: string;
  roleKey?: string;
  membershipRole?: string;
  roleLabel?: string;
  position?: string;
  organizationRoleName?: string;
  stationIds?: string[];
}

export type TaskResponsibilityKind = 'assigned' | 'routed' | 'unassigned';

export interface TaskResponsibility {
  kind: TaskResponsibilityKind;
  userId: string | null;
  displayName: string;
  hint?: string;
  requiresAssignment?: boolean;
}

function roleHaystack(member: OrgMemberForRouting): string {
  return [member.roleLabel, member.position, member.organizationRoleName, member.roleKey, member.membershipRole]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isStationManagerMember(member: OrgMemberForRouting): boolean {
  const hay = roleHaystack(member);
  return (
    hay.includes('stationsleiter') ||
    hay.includes('standortleiter') ||
    hay.includes('station manager') ||
    hay.includes('station lead')
  );
}

export function isOrgLeaderMember(member: OrgMemberForRouting): boolean {
  if (member.roleKey === 'ORG_ADMIN' || member.membershipRole === 'ORG_ADMIN') return true;
  if (member.roleKey === 'SUB_ADMIN' || member.membershipRole === 'SUB_ADMIN') return true;
  const hay = roleHaystack(member);
  return (
    hay.includes('geschäftsführer') ||
    hay.includes('geschaeftsfuehrer') ||
    hay.includes('betriebsleiter') ||
    hay.includes('org admin') ||
    hay.includes('organisations-admin')
  );
}

export function resolveTaskStationId(
  task: Pick<ApiTask, 'metadata' | 'vehicleId'>,
  vehicleStationId?: string | null,
): string | null {
  const meta = task.metadata?.stationId;
  if (typeof meta === 'string' && meta.trim()) return meta;
  if (vehicleStationId?.trim()) return vehicleStationId;
  return null;
}

export function resolveTaskResponsibility(
  task: Pick<ApiTask, 'assignedUserId' | 'metadata' | 'vehicleId'>,
  members: OrgMemberForRouting[],
  vehicleStationId?: string | null,
): TaskResponsibility {
  if (task.assignedUserId) {
    return {
      kind: 'assigned',
      userId: task.assignedUserId,
      displayName: resolveUserName(task.assignedUserId, members, 'Unbekannt'),
    };
  }

  const stationId = resolveTaskStationId(task, vehicleStationId);
  if (stationId) {
    const stationManager = members.find(
      (m) => isStationManagerMember(m) && (m.stationIds ?? []).includes(stationId),
    );
    if (stationManager) {
      return {
        kind: 'routed',
        userId: stationManager.id,
        displayName: stationManager.name,
        hint: 'Zuständigkeit: Stationsleiter',
      };
    }
  }

  const leader = members.find(isOrgLeaderMember);
  if (leader) {
    return {
      kind: 'routed',
      userId: leader.id,
      displayName: leader.name,
      hint: 'Zuständigkeit: Geschäftsführung / Org-Admin',
    };
  }

  return {
    kind: 'unassigned',
    userId: null,
    displayName: 'Nicht zugewiesen',
    hint: 'Zuweisung erforderlich',
    requiresAssignment: true,
  };
}

export function canAssignTasks(
  userRole: string | null,
  hasTasksManage: boolean,
  hasTasksWrite: boolean,
  currentMember: OrgMemberForRouting | null,
  taskStationId: string | null,
): boolean {
  if (userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN') return true;
  if (hasTasksManage) return true;
  if (!currentMember) return hasTasksWrite;
  if (isOrgLeaderMember(currentMember)) return true;
  if (
    taskStationId &&
    isStationManagerMember(currentMember) &&
    (currentMember.stationIds ?? []).includes(taskStationId)
  ) {
    return true;
  }
  return hasTasksWrite;
}
