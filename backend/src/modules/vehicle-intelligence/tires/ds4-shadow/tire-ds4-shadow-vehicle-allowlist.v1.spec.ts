import {
  isVehicleAllowlistedInTireDs4ShadowStateV1,
  parseTireDs4ShadowVehicleAllowlistV1,
  tireDs4ShadowAllowedVehicleIdsForCatchupV1,
} from './tire-ds4-shadow-vehicle-allowlist.v1';

const TESLA = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const TIGUAN = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

describe('tire-ds4-shadow-vehicle-allowlist.v1', () => {
  it('denies all when unset or empty', () => {
    expect(parseTireDs4ShadowVehicleAllowlistV1(undefined)).toEqual({
      kind: 'deny_all',
      reason: 'missing_or_empty',
    });
    expect(parseTireDs4ShadowVehicleAllowlistV1('  ,  ')).toEqual({
      kind: 'deny_all',
      reason: 'missing_or_empty',
    });
  });

  it('denies all on invalid UUID entries', () => {
    expect(parseTireDs4ShadowVehicleAllowlistV1(`${TESLA},not-a-uuid`)).toEqual({
      kind: 'deny_all',
      reason: 'invalid_entries',
    });
  });

  it('parses canary vehicle ids case-insensitively', () => {
    const state = parseTireDs4ShadowVehicleAllowlistV1(`${TESLA},${TIGUAN.toUpperCase()}`);
    expect(state.kind).toBe('allow_set');
    if (state.kind === 'allow_set') {
      expect(isVehicleAllowlistedInTireDs4ShadowStateV1(state, TESLA)).toBe(true);
      expect(isVehicleAllowlistedInTireDs4ShadowStateV1(state, TIGUAN)).toBe(true);
      expect(isVehicleAllowlistedInTireDs4ShadowStateV1(state, '00000000-0000-4000-8000-000000000099')).toBe(
        false,
      );
    }
  });

  it('exposes allowed ids for catch-up only when allow_set', () => {
    expect(tireDs4ShadowAllowedVehicleIdsForCatchupV1({ kind: 'deny_all', reason: 'missing_or_empty' })).toBe(
      null,
    );
    const state = parseTireDs4ShadowVehicleAllowlistV1(TESLA);
    expect(tireDs4ShadowAllowedVehicleIdsForCatchupV1(state)).toEqual([TESLA.toLowerCase()]);
  });
});
