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
});
