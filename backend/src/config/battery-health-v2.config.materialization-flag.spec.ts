import {
  BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV,
  isBatteryV2LongitudinalProfileMaterializationEnabled,
} from './battery-health-v2.config';

describe('battery-health-v2.config M3.3F D3 materialization flag', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('A — absent => false', () => {
    delete process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV];
    expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
  });

  it.each(['false', 'off', '0', 'no'])('B — explicit %s => false', (value) => {
    process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV] = value;
    expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
  });

  it.each(['true', 'on', '1', 'yes'])('C — explicit %s => true', (value) => {
    process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV] = value;
    expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(true);
  });

  it('D — malformed => default OFF', () => {
    process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV] = 'maybe';
    expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
  });

  it('empty => false', () => {
    process.env[BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED_ENV] = '   ';
    expect(isBatteryV2LongitudinalProfileMaterializationEnabled()).toBe(false);
  });
});
