import { parseHvChargingCounterPilotAdmissionStateV1 } from './hv-charging-counter-evidence.pilot-admission.v1';

const SESSION = '795c7dcb-0000-4000-8000-000000000001';

describe('hv-charging-counter-evidence.pilot-admission.v1', () => {
  it('defaults to disabled when pilot flag unset', () => {
    expect(parseHvChargingCounterPilotAdmissionStateV1({})).toEqual({ kind: 'disabled' });
  });

  it('denies all when pilot enabled but configuration incomplete', () => {
    expect(
      parseHvChargingCounterPilotAdmissionStateV1({
        pilotModeEnabled: 'true',
        pilotEpoch: '',
        pilotHvChargeSessionId: SESSION,
      }),
    ).toEqual({ kind: 'deny_all', reason: 'invalid_configuration' });
  });

  it('activates with epoch and session id', () => {
    expect(
      parseHvChargingCounterPilotAdmissionStateV1({
        pilotModeEnabled: '1',
        pilotEpoch: 'tesla-hv-r22-pilot-2026-10-19',
        pilotHvChargeSessionId: SESSION,
      }),
    ).toEqual({
      kind: 'active',
      pilotEpoch: 'tesla-hv-r22-pilot-2026-10-19',
      sourceHvChargeSessionId: SESSION,
    });
  });
});
