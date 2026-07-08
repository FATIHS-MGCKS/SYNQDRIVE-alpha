import { resolveSignalGroup } from './hf-signal-map';

describe('resolveSignalGroup', () => {
  it('classifies extended mirror signal names', () => {
    expect(resolveSignalGroup('currentLocationLatitude')).toBe('gps');
    expect(resolveSignalGroup('currentLocationLongitude')).toBe('gps');
    expect(resolveSignalGroup('powertrainTractionBatteryStateOfChargeCurrent')).toBe(
      'battery',
    );
    expect(resolveSignalGroup('powertrainTractionBatteryRange')).toBe('battery');
    expect(resolveSignalGroup('chassisAxleRow1WheelLeftTirePressure')).toBe('tire');
    expect(resolveSignalGroup('exteriorAirTemperature')).toBe('environment');
    expect(resolveSignalGroup('isIgnitionOn')).toBe('powertrain');
    expect(resolveSignalGroup('powertrainTractionBatteryChargingIsCharging')).toBe(
      'charging',
    );
  });

  it('returns unknown for unrecognized names', () => {
    expect(resolveSignalGroup('totallyFakeProviderSignal')).toBe('unknown');
    expect(resolveSignalGroup(null)).toBe('unknown');
  });
});
