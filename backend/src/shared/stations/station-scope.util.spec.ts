import { MembershipRole } from '@prisma/client';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import {
  isHistoricalReadHttpMethod,
  isStationIdAllowed,
  parseStationIds,
  resolveAssignedStationIds,
  resolveAllowedStationIds,
  resolveStationIdFromRequest,
  resolveStationScopeMode,
  stationIdsIntersectScope,
} from './station-scope.util';

describe('station-scope.util', () => {
  describe('resolveStationIdFromRequest', () => {
    it('reads route param id', () => {
      expect(
        resolveStationIdFromRequest({
          method: 'GET',
          params: { id: 'station-a' },
        }),
      ).toBe('station-a');
    });

    it('prefers stationId param over id', () => {
      expect(
        resolveStationIdFromRequest({
          method: 'GET',
          params: { id: 'station-a', stationId: 'station-b' },
        }),
      ).toBe('station-b');
    });

    it('reads body.stationId and query.stationId', () => {
      expect(
        resolveStationIdFromRequest({
          method: 'PATCH',
          body: { stationId: 'body-station' },
        }),
      ).toBe('body-station');

      expect(
        resolveStationIdFromRequest({
          method: 'GET',
          query: { stationId: 'query-station' },
        }),
      ).toBe('query-station');
    });
  });

  describe('resolveStationScopeMode', () => {
    const stationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('maps org admin to ALL_STATIONS', () => {
      expect(
        resolveStationScopeMode({
          role: MembershipRole.ORG_ADMIN,
          stationScope: null,
          stationIds: null,
          permissions: null,
        }),
      ).toBe(STATION_SCOPE_MODE.ALL_STATIONS);
    });

    it('maps driver to NO_STATIONS', () => {
      expect(
        resolveStationScopeMode({
          role: MembershipRole.DRIVER,
          stationScope: 'ALL',
          stationIds: [stationA],
          permissions: null,
        }),
      ).toBe(STATION_SCOPE_MODE.NO_STATIONS);
    });

    it('maps legacy ALL to ALL_STATIONS', () => {
      expect(
        resolveStationScopeMode({
          role: MembershipRole.SUB_ADMIN,
          stationScope: 'ALL',
          stationIds: null,
          permissions: null,
        }),
      ).toBe(STATION_SCOPE_MODE.ALL_STATIONS);
    });

    it('maps stationIds to ASSIGNED_STATIONS', () => {
      expect(
        resolveStationScopeMode({
          role: MembershipRole.WORKER,
          stationScope: null,
          stationIds: [stationA],
          permissions: null,
        }),
      ).toBe(STATION_SCOPE_MODE.ASSIGNED_STATIONS);
    });

    it('defaults scoped roles without assignments to ASSIGNED_STATIONS', () => {
      expect(
        resolveStationScopeMode({
          role: MembershipRole.WORKER,
          stationScope: null,
          stationIds: null,
          permissions: null,
        }),
      ).toBe(STATION_SCOPE_MODE.ASSIGNED_STATIONS);
    });
  });

  describe('resolveAllowedStationIds', () => {
    const stationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('returns null for ALL_STATIONS', () => {
      expect(
        resolveAllowedStationIds(STATION_SCOPE_MODE.ALL_STATIONS, {
          role: MembershipRole.ORG_ADMIN,
          stationScope: 'ALL',
          stationIds: null,
          permissions: null,
        }),
      ).toBeNull();
    });

    it('returns empty array for NO_STATIONS', () => {
      expect(
        resolveAllowedStationIds(STATION_SCOPE_MODE.NO_STATIONS, {
          role: MembershipRole.DRIVER,
          stationScope: null,
          stationIds: null,
          permissions: null,
        }),
      ).toEqual([]);
    });

    it('returns assigned ids for ASSIGNED_STATIONS', () => {
      expect(
        resolveAllowedStationIds(STATION_SCOPE_MODE.ASSIGNED_STATIONS, {
          role: MembershipRole.WORKER,
          stationScope: stationA,
          stationIds: null,
          permissions: null,
        }),
      ).toEqual([stationA]);
    });
  });

  describe('isStationIdAllowed', () => {
    const stationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('denies all ids for NO_STATIONS', () => {
      expect(
        isStationIdAllowed(stationA, STATION_SCOPE_MODE.NO_STATIONS, []),
      ).toBe(false);
    });

    it('allows any id for ALL_STATIONS', () => {
      expect(
        isStationIdAllowed(stationA, STATION_SCOPE_MODE.ALL_STATIONS, null),
      ).toBe(true);
    });

    it('allows only assigned ids', () => {
      expect(
        isStationIdAllowed(stationA, STATION_SCOPE_MODE.ASSIGNED_STATIONS, [stationA]),
      ).toBe(true);
      expect(
        isStationIdAllowed(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          STATION_SCOPE_MODE.ASSIGNED_STATIONS,
          [stationA],
        ),
      ).toBe(false);
    });
  });

  it('parseStationIds filters invalid entries', () => {
    expect(parseStationIds(['a', '', 1, 'b'])).toEqual(['a', 'b']);
  });

  it('stationIdsIntersectScope checks any linked station', () => {
    const stationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const stationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    expect(
      stationIdsIntersectScope(
        [null, stationB],
        STATION_SCOPE_MODE.ASSIGNED_STATIONS,
        [stationB],
      ),
    ).toBe(true);

    expect(
      stationIdsIntersectScope(
        [stationA],
        STATION_SCOPE_MODE.ASSIGNED_STATIONS,
        [stationB],
      ),
    ).toBe(false);
  });

  it('detects historical read HTTP methods', () => {
    expect(isHistoricalReadHttpMethod('get')).toBe(true);
    expect(isHistoricalReadHttpMethod('HEAD')).toBe(true);
    expect(isHistoricalReadHttpMethod('POST')).toBe(false);
  });
});
