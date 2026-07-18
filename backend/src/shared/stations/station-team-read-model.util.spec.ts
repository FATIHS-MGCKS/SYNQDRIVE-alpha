import { MembershipRole } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import {
  buildStationTeamMemberDisplayName,
  formatStationTeamMemberScope,
  membershipMatchesStation,
} from './station-team-read-model.util';

describe('station-team-read-model.util', () => {
  it('matches memberships assigned via stationIds or legacy stationScope', () => {
    expect(
      membershipMatchesStation(
        { role: MembershipRole.WORKER, stationScope: null, stationIds: ['station-a'], permissions: null },
        'station-a',
      ),
    ).toBe(true);
    expect(
      membershipMatchesStation(
        { role: MembershipRole.WORKER, stationScope: 'station-a', stationIds: null, permissions: null },
        'station-a',
      ),
    ).toBe(true);
    expect(
      membershipMatchesStation(
        { role: MembershipRole.WORKER, stationScope: null, stationIds: ['station-b'], permissions: null },
        'station-a',
      ),
    ).toBe(false);
  });

  it('formats scope labels without exposing email', () => {
    const scope = formatStationTeamMemberScope(
      {
        role: MembershipRole.WORKER,
        stationScope: null,
        stationIds: ['station-a', 'station-b'],
        permissions: null,
      },
      'station-a',
    );
    expect(scope.scopeMode).toBe('ASSIGNED_STATIONS');
    expect(scope.scopeLabel).toContain('2');
  });

  it('builds display names from names only', () => {
    expect(
      buildStationTeamMemberDisplayName({
        id: 'u1',
        firstName: 'Alex',
        lastName: 'Meyer',
        email: 'alex@example.com',
      }),
    ).toBe('Alex Meyer');
    expect(
      buildStationTeamMemberDisplayName({
        id: 'u2',
        firstName: null,
        lastName: null,
        email: 'worker@example.com',
      }),
    ).toBe('worker');
  });
});
