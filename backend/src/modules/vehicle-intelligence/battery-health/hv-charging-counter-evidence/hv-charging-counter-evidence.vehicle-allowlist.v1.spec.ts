import {
  isVehicleAllowlistedInHvChargingCounterStateV1,
  parseHvChargingCounterVehicleAllowlistV1,
} from './hv-charging-counter-evidence.vehicle-allowlist.v1';

const TESLA =
  '68868291-5478-42cd-b0c4-cc77b2a78e21';

describe('hv-charging-counter-evidence.vehicle-allowlist.v1', () => {
  it('denies all when env missing or empty', () => {
    expect(parseHvChargingCounterVehicleAllowlistV1(undefined)).toEqual({
      kind: 'deny_all',
      reason: 'missing_or_empty',
    });
    expect(parseHvChargingCounterVehicleAllowlistV1('  ,  ')).toEqual({
      kind: 'deny_all',
      reason: 'missing_or_empty',
    });
  });

  it('parses explicit Tesla UUID allowlist', () => {
    const state = parseHvChargingCounterVehicleAllowlistV1(TESLA);
    expect(state.kind).toBe('allow_set');
    if (state.kind === 'allow_set') {
      expect(isVehicleAllowlistedInHvChargingCounterStateV1(state, TESLA)).toBe(true);
      expect(
        isVehicleAllowlistedInHvChargingCounterStateV1(
          state,
          '22222222-2222-4222-8222-222222222222',
        ),
      ).toBe(false);
    }
  });

  it('invalid token fails entire allowlist', () => {
    const state = parseHvChargingCounterVehicleAllowlistV1(`${TESLA},not-a-uuid`);
    expect(state).toEqual({ kind: 'deny_all', reason: 'invalid_entries' });
  });
});
