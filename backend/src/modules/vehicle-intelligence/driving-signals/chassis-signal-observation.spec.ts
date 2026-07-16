import { mapDimoProviderSignalToCanonical } from './canonical-driving-signal-mapper';
import { resolveChassisSignalObservation } from './chassis-signal-observation';
import { CHASSIS_SIGNAL_DOMAIN_VERSION } from './chassis-signal-observation.types';

/** Production LTE_R1 fleet: engine signals only — chassis family NOT_LISTED (audit §5.2). */
const LTE_R1_FLEET_UNSUPPORTED = new Set([
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
]);

/** Hypothetical SMART5 / future provider with full chassis telemetry. */
const SMART5_CHASSIS_SUPPORTED = new Set([
  'powertrainTransmissionCurrentGear',
  'powertrainTransmissionSelectedGear',
  'powertrainTransmissionTemperature',
  'powertrainTransmissionIsClutchSwitchOperated',
  'chassisBrakeIsPedalPressed',
  'chassisBrakePedalPosition',
  'chassisBrakeCircuit1PressurePrimary',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'angularVelocityYaw',
]);

const OBSERVED = '2026-07-16T14:22:10.000Z';
const RECEIVED = '2026-07-16T14:22:12.500Z';
const STALE_REFERENCE = new Date('2026-07-16T15:00:00.000Z');

describe('chassis signal domain (P31)', () => {
  it('exports chassis-signal-v1 domain version', () => {
    expect(CHASSIS_SIGNAL_DOMAIN_VERSION).toBe('chassis-signal-v1');
  });

  describe('unsupported — fleet without chassis capability', () => {
    it('marks yaw rate unsupported when absent from capability preflight', () => {
      const result = resolveChassisSignalObservation(
        {
          dimoSignalName: 'angularVelocityYaw',
          value: 4.2,
          providerUnit: '°/s',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: LTE_R1_FLEET_UNSUPPORTED,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          state: 'unsupported',
          reason: 'capability_not_supported',
          canonicalKey: 'yaw_rate',
          detectorEligible: false,
          healthEvaluationEligible: false,
        }),
      );
    });

    it('marks brake pedal unsupported on production LTE_R1 capability set', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'chassisBrakeIsPedalPressed',
          value: 1,
          observedAt: OBSERVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: LTE_R1_FLEET_UNSUPPORTED,
        },
      );

      expect(result.status).toBe('UNSUPPORTED');
      if (result.status === 'UNSUPPORTED') {
        expect(result.reason).toBe('capability_not_supported');
        expect(result.canonicalKey).toBe('brake_pedal_pressed');
      }
    });
  });

  describe('null_sample — provider null is not a real observation', () => {
    it('returns null_sample for null value even when capability-supported', () => {
      const result = resolveChassisSignalObservation(
        {
          dimoSignalName: 'powertrainTransmissionCurrentGear',
          value: null,
          observedAt: OBSERVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: SMART5_CHASSIS_SUPPORTED,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          state: 'null_sample',
          reason: 'provider_null_not_observation',
          canonicalKey: 'transmission_current_gear',
        }),
      );
      expect(result && 'value' in result).toBe(false);
    });

    it('does not fabricate defaults for undefined wheel speed', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'chassisAxleRow1WheelLeftSpeed',
          value: undefined,
          observedAt: OBSERVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: SMART5_CHASSIS_SUPPORTED,
        },
      );

      expect(result.status).toBe('NULL_SAMPLE');
      if (result.status === 'NULL_SAMPLE') {
        expect(result.reason).toBe('provider_null_not_observation');
      }
    });
  });

  describe('stale — aged observations are not treated as available', () => {
    it('marks stale yaw observation when older than staleAfterMs', () => {
      const result = resolveChassisSignalObservation(
        {
          dimoSignalName: 'angularVelocityYaw',
          value: 2.1,
          providerUnit: '°/s',
          observedAt: '2026-07-16T12:00:00.000Z',
          receivedAt: RECEIVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: SMART5_CHASSIS_SUPPORTED,
          referenceTime: STALE_REFERENCE,
          staleAfterMs: 30 * 60 * 1000,
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          state: 'stale',
          reason: 'observation_stale',
          canonicalKey: 'yaw_rate',
          ageMs: expect.any(Number),
        }),
      );
      if (result?.state === 'stale') {
        expect(result.ageMs).toBeGreaterThan(30 * 60 * 1000);
      }
    });
  });

  describe('available — capability-supported with valid payload', () => {
    const context = {
      fuelType: 'PETROL' as const,
      supportedDimoSignals: SMART5_CHASSIS_SUPPORTED,
      batchReceivedAt: new Date(RECEIVED),
    };

    it('maps transmission, brake, wheel, and yaw signals when supported', () => {
      const samples = [
        {
          dimoSignalName: 'powertrainTransmissionCurrentGear',
          value: 4,
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'powertrainTransmissionSelectedGear',
          value: 4,
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'powertrainTransmissionTemperature',
          value: 72,
          providerUnit: '°C',
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'powertrainTransmissionIsClutchSwitchOperated',
          value: 0,
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'chassisBrakeIsPedalPressed',
          value: 1,
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'chassisBrakePedalPosition',
          value: 35,
          providerUnit: '%',
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'chassisBrakeCircuit1PressurePrimary',
          value: 4200,
          providerUnit: 'kPa',
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'chassisAxleRow1WheelLeftSpeed',
          value: 52,
          providerUnit: 'km/h',
          observedAt: OBSERVED,
        },
        {
          dimoSignalName: 'angularVelocityYaw',
          value: -1.8,
          providerUnit: '°/s',
          observedAt: OBSERVED,
        },
      ];

      const results = samples.map((sample) =>
        resolveChassisSignalObservation(sample, context),
      );

      expect(results.every((r) => r?.state === 'available')).toBe(true);
      expect(results.map((r) => r?.canonicalKey)).toEqual([
        'transmission_current_gear',
        'transmission_selected_gear',
        'transmission_temperature',
        'transmission_clutch_switch',
        'brake_pedal_pressed',
        'brake_pedal_position',
        'brake_pressure',
        'wheel_speed_front_left',
        'yaw_rate',
      ]);

      for (const row of results) {
        if (row?.state === 'available') {
          expect(row.detectorEligible).toBe(false);
          expect(row.healthEvaluationEligible).toBe(false);
          expect(row.receivedAt).toEqual(context.batchReceivedAt);
          expect(row.observedAt.toISOString()).toBe(OBSERVED);
        }
      }
    });

    it('maps oil-temperature alias to transmission_temperature canonical key', () => {
      const result = resolveChassisSignalObservation(
        {
          dimoSignalName: 'powertrainTransmissionOilTemperature',
          value: 68,
          providerUnit: 'celsius',
          observedAt: OBSERVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: new Set(['powertrainTransmissionOilTemperature']),
        },
      );

      expect(result?.state).toBe('available');
      expect(result?.canonicalKey).toBe('transmission_temperature');
    });
  });
});
