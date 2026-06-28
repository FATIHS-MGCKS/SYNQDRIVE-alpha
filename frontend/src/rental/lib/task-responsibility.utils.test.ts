import { describe, expect, it } from 'vitest';
import {
  canAssignTasks,
  isOrgLeaderMember,
  isStationManagerMember,
  resolveTaskResponsibility,
} from './task-responsibility.utils';

const members = [
  {
    id: 'admin-1',
    name: 'Anna Admin',
    roleKey: 'ORG_ADMIN',
    membershipRole: 'ORG_ADMIN',
    roleLabel: 'Geschäftsführerin',
    stationIds: [],
  },
  {
    id: 'mgr-berlin',
    name: 'Stefan Stationsleiter',
    roleKey: 'WORKER',
    roleLabel: 'Stationsleiter',
    stationIds: ['station-berlin'],
  },
  {
    id: 'worker-1',
    name: 'Max Mechaniker',
    roleKey: 'WORKER',
    roleLabel: 'Mechaniker',
    stationIds: ['station-berlin'],
  },
];

describe('task-responsibility.utils', () => {
  it('uses assigned user when present', () => {
    const r = resolveTaskResponsibility(
      { assignedUserId: 'worker-1', metadata: null, vehicleId: null },
      members,
    );
    expect(r.kind).toBe('assigned');
    expect(r.displayName).toBe('Max Mechaniker');
  });

  it('routes to station manager when task has station and no assignee', () => {
    const r = resolveTaskResponsibility(
      { assignedUserId: null, metadata: { stationId: 'station-berlin' }, vehicleId: null },
      members,
    );
    expect(r.kind).toBe('routed');
    expect(r.displayName).toBe('Stefan Stationsleiter');
  });

  it('routes to org leader when no station manager matches', () => {
    const r = resolveTaskResponsibility(
      { assignedUserId: null, metadata: { stationId: 'station-hamburg' }, vehicleId: null },
      members,
    );
    expect(r.kind).toBe('routed');
    expect(r.displayName).toBe('Anna Admin');
  });

  it('returns unassigned when no routing target exists', () => {
    const r = resolveTaskResponsibility(
      { assignedUserId: null, metadata: null, vehicleId: null },
      [],
    );
    expect(r.kind).toBe('unassigned');
    expect(r.displayName).toBe('Nicht zugewiesen');
    expect(r.requiresAssignment).toBe(true);
  });

  it('detects station manager and org leader roles', () => {
    expect(isStationManagerMember(members[1])).toBe(true);
    expect(isOrgLeaderMember(members[0])).toBe(true);
  });

  it('allows org admin to assign tasks', () => {
    expect(canAssignTasks('ORG_ADMIN', false, false, null, null)).toBe(true);
    expect(
      canAssignTasks('WORKER', false, false, members[2], 'station-berlin'),
    ).toBe(false);
    expect(
      canAssignTasks('WORKER', false, true, members[2], null),
    ).toBe(true);
  });
});
