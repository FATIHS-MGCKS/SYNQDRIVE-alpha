import { extractProfileSignalEmpirical } from './vsi-profile-empirical-extractor';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiLatestStateSnapshot } from './vsi-readonly-composer.types';

function vls(raw: object, sourceTimestamp: Date): VsiLatestStateSnapshot {
  return {
    vehicleId: 'v1',
    providerBindingId: 'link-1',
    providerSource: 'DIMO',
    lvBatteryVoltage: null,
    evSoc: null,
    online: true,
    sourceTimestamp,
    providerFetchedAt: sourceTimestamp,
    updatedAt: sourceTimestamp,
    rawPayloadJson: raw,
  };
}

describe('vsi-profile-empirical-extractor', () => {
  const projectionAsOf = new Date('2026-10-15T12:00:00.000Z');

  it('observes position_coordinates from currentLocationCoordinates native field', () => {
    const ts = '2026-10-15T11:59:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'position_coordinates',
      latestState: vls(
        {
          currentLocationCoordinates: {
            value: { latitude: 52.52, longitude: 13.405 },
            timestamp: ts,
          },
        },
        new Date(ts),
      ),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.providerNativeSignalName).toBe('currentLocationCoordinates');
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result?.lastSourceTimestamp?.toISOString()).toBe(ts);
  });

  it('treats accelerator pedal zero as a valid observation', () => {
    const ts = '2026-10-15T11:58:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'accelerator_pedal_position',
      latestState: vls(
        {
          powertrainCombustionEngineAcceleratorPedalPosition: { value: 0, timestamp: ts },
        },
        new Date(ts),
      ),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result?.lastValidObservationAt?.toISOString()).toBe(ts);
  });

  it('missing accelerator key is NEVER_OBSERVED not zero', () => {
    const result = extractProfileSignalEmpirical({
      key: 'accelerator_pedal_position',
      latestState: vls({ speed: { value: 10, timestamp: '2026-10-15T11:00:00.000Z' } }, projectionAsOf),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result?.lastSourceTimestamp).toBeNull();
  });

  it('rejects fabricated future signal timestamps', () => {
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls(
        { speed: { value: 40, timestamp: '2030-01-01T00:00:00.000Z' } } as Record<string, unknown>,
        projectionAsOf,
      ),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.limitations).toContain('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('observes vehicle_speed zero as a valid stationary measurement', () => {
    const ts = '2026-10-15T11:55:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: 0, timestamp: ts } }, new Date(ts)),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result?.lastSourceTimestamp?.toISOString()).toBe(ts);
    expect(result?.limitations).not.toContain('RAW_SNAPSHOT_KEY_NULL_VALUE_NOT_PHYSICAL_OBSERVATION');
  });

  it('treats present speed key with null value as not observed', () => {
    const ts = '2026-10-15T11:55:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: null, timestamp: ts } }, new Date(ts)),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result?.limitations).toContain('RAW_SNAPSHOT_KEY_NULL_VALUE_NOT_PHYSICAL_OBSERVATION');
  });

  it('missing speed key is NEVER_OBSERVED without inventing zero', () => {
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({}, projectionAsOf),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(result?.lastSourceTimestamp).toBeNull();
  });

  it('observes positive vehicle_speed', () => {
    const ts = '2026-10-15T11:54:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: 42.5, timestamp: ts } }, new Date(ts)),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result?.lastValidObservationAt?.toISOString()).toBe(ts);
  });

  it('rejects non-finite speed values', () => {
    const ts = '2026-10-15T11:54:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: Number.NaN, timestamp: ts } }, new Date(ts)),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('classifies stale speed source timestamps without rejecting the numeric value', () => {
    const ts = '2026-10-01T00:00:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: 10, timestamp: ts } }, new Date(ts)),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result?.freshnessClassification).toBe('STALE');
  });

  it('does not attribute speed when latest state is not bound to the link', () => {
    const ts = '2026-10-15T11:54:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'vehicle_speed',
      latestState: vls({ speed: { value: 10, timestamp: ts } }, new Date(ts)),
      stateAttributed: false,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('observes fuel_level_relative zero as a valid empty-tank measurement', () => {
    const ts = '2026-10-15T11:53:00.000Z';
    const result = extractProfileSignalEmpirical({
      key: 'fuel_level_relative',
      latestState: vls(
        { powertrainFuelSystemRelativeLevel: { value: 0, timestamp: ts } },
        new Date(ts),
      ),
      stateAttributed: true,
      projectionAsOf,
    });
    expect(result?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
  });
});
