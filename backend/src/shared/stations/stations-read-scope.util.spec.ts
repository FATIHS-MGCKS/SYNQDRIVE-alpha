import { STATION_SCOPE_MODE } from './station-scope.constants';
import {
  buildScopedStationWhere,
  isStationVisibleInScope,
} from './stations-read-scope.util';
import type { StationScopeContext } from './station-scope.types';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('stations-read-scope.util', () => {
  it('returns org filter for ALL_STATIONS', () => {
    const where = buildScopedStationWhere(ORG, {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ALL_STATIONS,
      allowedStationIds: null,
      bypassScope: true,
    });
    expect(where).toEqual({ organizationId: ORG });
  });

  it('restricts ASSIGNED_STATIONS to allowed ids', () => {
    const scope: StationScopeContext = {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    };
    expect(buildScopedStationWhere(ORG, scope)).toEqual({
      organizationId: ORG,
      id: { in: [STATION_A] },
    });
  });

  it('returns empty set for NO_STATIONS', () => {
    const scope: StationScopeContext = {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.NO_STATIONS,
      allowedStationIds: [],
      bypassScope: false,
    };
    expect(buildScopedStationWhere(ORG, scope)).toEqual({
      organizationId: ORG,
      id: { in: [] },
    });
  });

  it('checks station visibility in scope', () => {
    const scope: StationScopeContext = {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    };
    expect(isStationVisibleInScope(STATION_A, scope)).toBe(true);
    expect(isStationVisibleInScope(STATION_B, scope)).toBe(false);
  });
});
