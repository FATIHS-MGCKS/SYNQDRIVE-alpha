import {
  evaluateStartProxyPilotScopeV1,
  parseStartProxyPilotForwardCutoffV1,
  parseStartProxyPilotVehicleAllowlistV1,
  resolveStartProxyPilotScopeConfigV1,
} from './start-proxy-pilot-scope.v1';

/** VW Tiguan WOB L 7503 — verified pilot vehicle (G5C-N16). */
const TIGUAN = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
/** Audi A4 KS MS 661 */
const AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
/** VW Arteon HMÜ C 215 */
const ARTEON = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const UNKNOWN = '00000000-0000-4000-8000-000000000099';

const CUTOFF_ISO = '2026-10-21T12:00:00.000Z';
const CUTOFF_MS = Date.parse(CUTOFF_ISO);

function activeConfig(allowlist = TIGUAN, cutoff = CUTOFF_ISO) {
  return resolveStartProxyPilotScopeConfigV1({
    pilotScopeEnabled: true,
    allowlistRaw: allowlist,
    cutoffRaw: cutoff,
  });
}

describe('start-proxy-pilot-scope.v1', () => {
  describe('allowlist parsing', () => {
    it('denies all when unset', () => {
      expect(parseStartProxyPilotVehicleAllowlistV1(undefined).kind).toBe('deny_all');
      expect(parseStartProxyPilotVehicleAllowlistV1('').kind).toBe('deny_all');
      expect(parseStartProxyPilotVehicleAllowlistV1('  ,  ').kind).toBe('deny_all');
    });

    it('denies all on invalid uuid', () => {
      expect(parseStartProxyPilotVehicleAllowlistV1('not-a-uuid').kind).toBe('deny_all');
    });

    it('accepts tiguan id case-insensitively', () => {
      const state = parseStartProxyPilotVehicleAllowlistV1(TIGUAN.toUpperCase());
      expect(state.kind).toBe('allow_set');
      if (state.kind === 'allow_set') {
        expect(state.vehicleIds.has(TIGUAN.toLowerCase())).toBe(true);
      }
    });
  });

  describe('cutoff parsing', () => {
    it('denies all when missing', () => {
      expect(parseStartProxyPilotForwardCutoffV1(undefined).kind).toBe('deny_all');
    });

    it('denies all on invalid timestamp', () => {
      expect(parseStartProxyPilotForwardCutoffV1('not-a-date').kind).toBe('deny_all');
    });

    it('parses utc iso', () => {
      const state = parseStartProxyPilotForwardCutoffV1(CUTOFF_ISO);
      expect(state).toEqual({
        kind: 'cutoff',
        cutoffAtMs: CUTOFF_MS,
        cutoffAtIso: CUTOFF_ISO,
      });
    });
  });

  describe('evaluateStartProxyPilotScopeV1', () => {
    it('allows any vehicle when pilot scope disabled', () => {
      const config = resolveStartProxyPilotScopeConfigV1({
        pilotScopeEnabled: false,
        allowlistRaw: undefined,
        cutoffRaw: undefined,
      });
      expect(
        evaluateStartProxyPilotScopeV1(config, {
          vehicleId: UNKNOWN,
          tripStartedAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toEqual({ allowed: true });
    });

    it('denies all when pilot enabled with empty allowlist', () => {
      const config = activeConfig('');
      expect(
        evaluateStartProxyPilotScopeV1(config, {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS + 1),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_scope_misconfigured' });
    });

    it('denies all when pilot enabled with invalid vehicle id in allowlist', () => {
      const config = activeConfig('bad-id');
      expect(
        evaluateStartProxyPilotScopeV1(config, {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS + 1),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_scope_misconfigured' });
    });

    it('denies all when pilot enabled with missing cutoff', () => {
      const config = resolveStartProxyPilotScopeConfigV1({
        pilotScopeEnabled: true,
        allowlistRaw: TIGUAN,
        cutoffRaw: undefined,
      });
      expect(
        evaluateStartProxyPilotScopeV1(config, {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS + 1),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_scope_misconfigured' });
    });

    it('denies all when pilot enabled with invalid cutoff', () => {
      const config = activeConfig(TIGUAN, 'yesterday');
      expect(
        evaluateStartProxyPilotScopeV1(config, {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS + 1),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_scope_misconfigured' });
    });

    it('allows tiguan after cutoff', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS + 1),
        }),
      ).toEqual({ allowed: true });
    });

    it('excludes audi', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: AUDI,
          tripStartedAt: new Date(CUTOFF_MS + 60_000),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_vehicle_not_allowlisted' });
    });

    it('excludes arteon', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: ARTEON,
          tripStartedAt: new Date(CUTOFF_MS + 60_000),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_vehicle_not_allowlisted' });
    });

    it('excludes unknown vehicle', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: UNKNOWN,
          tripStartedAt: new Date(CUTOFF_MS + 60_000),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_vehicle_not_allowlisted' });
    });

    it('rejects trip exactly at cutoff', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_trip_not_after_cutoff' });
    });

    it('rejects trip before cutoff', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: TIGUAN,
          tripStartedAt: new Date(CUTOFF_MS - 1),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_trip_not_after_cutoff' });
    });

    it('requires trip start timestamp', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: TIGUAN,
          tripStartedAt: null,
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_trip_start_required' });
    });

    it('rejects invalid trip start', () => {
      expect(
        evaluateStartProxyPilotScopeV1(activeConfig(), {
          vehicleId: TIGUAN,
          tripStartedAt: new Date('invalid'),
        }),
      ).toEqual({ allowed: false, reasonCode: 'pilot_trip_start_invalid' });
    });
  });
});
