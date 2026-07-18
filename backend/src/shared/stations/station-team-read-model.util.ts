import { MembershipRole } from '@prisma/client';
import {
  resolveAssignedStationIds,
  resolveStationScopeMode,
} from './station-scope.util';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import type { StationScopeMembershipRecord } from './station-scope.types';

export type StationTeamMemberScopeMode =
  | 'ALL_STATIONS'
  | 'ASSIGNED_STATIONS'
  | 'THIS_STATION'
  | 'NO_STATIONS';

export type StationTeamMemberReadModel = {
  membershipId: string;
  userId: string;
  displayName: string;
  role: string;
  roleLabel: string | null;
  scopeMode: StationTeamMemberScopeMode;
  scopeLabel: string;
  assignedStationCount: number;
};

export function formatStationTeamMemberScope(
  membership: StationScopeMembershipRecord & {
    roleLabel?: string | null;
  },
  stationId: string,
): Pick<StationTeamMemberReadModel, 'scopeMode' | 'scopeLabel' | 'assignedStationCount'> {
  const scopeMode = resolveStationScopeMode(membership);
  const assignedIds = resolveAssignedStationIds(membership);

  if (scopeMode === STATION_SCOPE_MODE.ALL_STATIONS || membership.role === MembershipRole.ORG_ADMIN) {
    return {
      scopeMode: 'ALL_STATIONS',
      scopeLabel: 'All stations',
      assignedStationCount: assignedIds.length,
    };
  }

  if (scopeMode === STATION_SCOPE_MODE.NO_STATIONS) {
    return {
      scopeMode: 'NO_STATIONS',
      scopeLabel: 'No station access',
      assignedStationCount: 0,
    };
  }

  if (assignedIds.length === 1 && assignedIds[0] === stationId) {
    return {
      scopeMode: 'THIS_STATION',
      scopeLabel: 'This station',
      assignedStationCount: 1,
    };
  }

  if (assignedIds.includes(stationId)) {
    return {
      scopeMode: 'ASSIGNED_STATIONS',
      scopeLabel: `Assigned stations (${assignedIds.length})`,
      assignedStationCount: assignedIds.length,
    };
  }

  const legacyScope = membership.stationScope?.trim();
  if (legacyScope === stationId) {
    return {
      scopeMode: 'THIS_STATION',
      scopeLabel: 'This station',
      assignedStationCount: 1,
    };
  }

  return {
    scopeMode: 'ASSIGNED_STATIONS',
    scopeLabel: 'Assigned stations',
    assignedStationCount: assignedIds.length,
  };
}

export function membershipMatchesStation(
  membership: StationScopeMembershipRecord,
  stationId: string,
): boolean {
  const assignedIds = resolveAssignedStationIds(membership);
  if (assignedIds.includes(stationId)) return true;
  const legacyScope = membership.stationScope?.trim();
  return legacyScope === stationId;
}

export function buildStationTeamMemberDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  id: string;
}): string {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName) return fullName;
  if (user.email) {
    const [local] = user.email.split('@');
    return local || 'User';
  }
  return 'User';
}
