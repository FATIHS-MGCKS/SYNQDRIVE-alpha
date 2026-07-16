import {
  assertNoWheelSpeedTreadDerivation,
  evaluateTireDimoSignalCapability,
  isBlockedTireWearDerivation,
} from './tire-dimo-signal-capability';

const AS_OF = new Date('2026-07-16T12:00:00.000Z');
const FRESH = new Date('2026-07-16T11:00:00.000Z');

describe('evaluateTireDimoSignalCapability', () => {
  it('marks exteriorAirTemperature usable when audit MVP gates pass', () => {
    const result = evaluateTireDimoSignalCapability({
      signalName: 'exteriorAirTemperature',
      documentedInDimoSchema: true,
      listedInAvailableSignals: true,
      latestValueAvailable: true,
      historicalValuesAvailable: true,
      synqDrivePersistsSignal: false,
      synqDriveUsesSignal: true,
      sampleCount14d: 44,
      coveragePercent: 29.8,
      lastSeenAt: FRESH,
      asOf: AS_OF,
    });
    expect(result.usable).toBe(true);
    expect(result.usability).toBe('USABLE');
  });

  it('rejects signal when not listed for vehicle', () => {
    const result = evaluateTireDimoSignalCapability({
      signalName: 'exteriorAirTemperature',
      listedInAvailableSignals: false,
      latestValueAvailable: false,
      historicalValuesAvailable: false,
      asOf: AS_OF,
    });
    expect(result.usable).toBe(false);
    expect(result.reasons.some((r) => r.includes('not listed'))).toBe(true);
  });

  it('rejects signal with insufficient historical coverage', () => {
    const result = evaluateTireDimoSignalCapability({
      signalName: 'exteriorAirTemperature',
      documentedInDimoSchema: true,
      listedInAvailableSignals: true,
      latestValueAvailable: true,
      historicalValuesAvailable: true,
      synqDriveUsesSignal: true,
      sampleCount14d: 3,
      coveragePercent: 1.6,
      lastSeenAt: FRESH,
      asOf: AS_OF,
    });
    expect(result.usable).toBe(false);
    expect(result.usability).toBe('SPORADIC');
  });

  it('marks stale observations unusable', () => {
    const result = evaluateTireDimoSignalCapability({
      signalName: 'exteriorAirTemperature',
      documentedInDimoSchema: true,
      listedInAvailableSignals: true,
      latestValueAvailable: true,
      historicalValuesAvailable: true,
      synqDriveUsesSignal: true,
      sampleCount14d: 40,
      coveragePercent: 20,
      lastSeenAt: new Date('2026-06-01T00:00:00.000Z'),
      asOf: AS_OF,
    });
    expect(result.usable).toBe(false);
    expect(result.stale).toBe(true);
  });

  it('blocks DO_NOT_USE wheel speed signals', () => {
    const result = evaluateTireDimoSignalCapability({
      signalName: 'chassisAxleRow1WheelLeftSpeed',
      documentedInDimoSchema: true,
      listedInAvailableSignals: true,
      latestValueAvailable: true,
      historicalValuesAvailable: true,
      synqDrivePersistsSignal: true,
      synqDriveUsesSignal: true,
      sampleCount14d: 100,
      coveragePercent: 50,
      lastSeenAt: FRESH,
      asOf: AS_OF,
    });
    expect(result.usable).toBe(false);
    expect(result.usability).toBe('BLOCKED');
  });

  it('requires persistence for odometer', () => {
    const withoutPersistence = evaluateTireDimoSignalCapability({
      signalName: 'powertrainTransmissionTravelledDistance',
      documentedInDimoSchema: true,
      listedInAvailableSignals: true,
      latestValueAvailable: true,
      historicalValuesAvailable: true,
      synqDrivePersistsSignal: false,
      synqDriveUsesSignal: true,
      sampleCount14d: 40,
      coveragePercent: 28,
      lastSeenAt: FRESH,
      asOf: AS_OF,
    });
    expect(withoutPersistence.usable).toBe(false);
  });
});

describe('wear derivation guards', () => {
  it('blocks wheel speed tread derivations', () => {
    expect(isBlockedTireWearDerivation('chassisAxleRow1WheelLeftSpeed')).toBe(true);
    expect(() =>
      assertNoWheelSpeedTreadDerivation('chassisAxleRow1WheelLeftSpeed'),
    ).toThrow(/tread-depth proxy/);
  });
});
