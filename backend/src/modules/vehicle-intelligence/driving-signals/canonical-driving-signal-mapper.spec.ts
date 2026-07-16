import {
  mapDimoProviderSignalBatch,
  mapDimoProviderSignalToCanonical,
} from './canonical-driving-signal-mapper';
import { CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION } from './canonical-driving-signal-mapper.types';

/** Sanitized ICE LTE_R1 capability set (audit §5.1 + P29 preflight overlap). */
const LTE_R1_ICE_SUPPORTED = new Set([
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'obdEngineLoad',
  'powertrainCombustionEngineECT',
  'obdRunTime',
  'exteriorAirTemperature',
  'currentLocationAltitude',
  'currentLocationHeading',
]);

/** Sanitized Tesla EV capability set (audit §5.3). */
const LTE_R1_EV_SUPPORTED = new Set([
  'powertrainTractionBatteryCurrentPower',
  'exteriorAirTemperature',
  'speed',
  'powertrainTransmissionTravelledDistance',
]);

const OBSERVED = '2026-07-16T14:22:10.000Z';
const RECEIVED = '2026-07-16T14:22:12.500Z';

describe('mapDimoProviderSignalToCanonical', () => {
  it('exports canonical-signal-v1 mapping version', () => {
    expect(CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION).toBe('canonical-signal-v1');
  });

  describe('LTE_R1 ICE — sanitized payloads', () => {
    const baseContext = {
      fuelType: 'PETROL',
      supportedDimoSignals: LTE_R1_ICE_SUPPORTED,
    };

    it('maps engine RPM with separate observedAt and receivedAt', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'powertrainCombustionEngineSpeed',
          value: 2840,
          providerUnit: 'rpm',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        baseContext,
      );

      expect(result.status).toBe('SUPPORTED');
      if (result.status !== 'SUPPORTED') return;
      expect(result.canonicalKey).toBe('engine_rpm');
      expect(result.value).toBe(2840);
      expect(result.unit).toBe('rpm');
      expect(result.observedAt.toISOString()).toBe(OBSERVED);
      expect(result.receivedAt.toISOString()).toBe(RECEIVED);
      expect(result.tripDetectionEligible).toBe(false);
    });

    it('maps throttle, load, coolant, runtime with percent/celsius/second units', () => {
      const samples = [
        { dimoSignalName: 'obdThrottlePosition', value: 42.5, providerUnit: '%' },
        { dimoSignalName: 'obdEngineLoad', value: 38, providerUnit: 'percent' },
        { dimoSignalName: 'powertrainCombustionEngineECT', value: 88, providerUnit: '°C' },
        { dimoSignalName: 'obdRunTime', value: 320, providerUnit: 's' },
      ];

      const results = mapDimoProviderSignalBatch(
        samples.map((s) => ({ ...s, observedAt: OBSERVED, receivedAt: RECEIVED })),
        baseContext,
      );

      expect(results.map((r) => (r.status === 'SUPPORTED' ? r.canonicalKey : r.status))).toEqual([
        'throttle_position',
        'engine_load',
        'coolant_temperature',
        'engine_runtime',
      ]);
      expect(results.every((r) => r.status === 'SUPPORTED' && r.tripDetectionEligible === false)).toBe(
        true,
      );
    });

    it('maps exterior temperature when capability-supported', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'exteriorAirTemperature',
          value: 21.5,
          providerUnit: 'celsius',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        baseContext,
      );

      expect(result.status).toBe('SUPPORTED');
      if (result.status !== 'SUPPORTED') return;
      expect(result.canonicalKey).toBe('exterior_temperature');
      expect(result.usageScope).toBe('DRIVING_ANALYSIS');
    });

    it('marks torque UNSUPPORTED when not in capability preflight set', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'powertrainCombustionEngineTorque',
          value: 180,
          providerUnit: 'Nm',
          observedAt: OBSERVED,
        },
        baseContext,
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'UNSUPPORTED',
          reason: 'capability_not_supported',
          canonicalKey: 'engine_torque',
        }),
      );
    });

    it('rejects unknown provider units without silent conversion', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'obdThrottlePosition',
          value: 50,
          providerUnit: 'volts',
          observedAt: OBSERVED,
        },
        baseContext,
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'UNIT_UNKNOWN',
          reason: 'provider_unit_unknown',
          providerUnit: 'volts',
        }),
      );
    });
  });

  describe('LTE_R1 EV — sanitized payloads', () => {
    const evContext = {
      fuelType: 'ELECTRIC',
      supportedDimoSignals: LTE_R1_EV_SUPPORTED,
    };

    it('maps EV battery power and converts kW to watts explicitly', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'powertrainTractionBatteryCurrentPower',
          value: 12.4,
          providerUnit: 'kW',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        evContext,
      );

      expect(result.status).toBe('SUPPORTED');
      if (result.status !== 'SUPPORTED') return;
      expect(result.canonicalKey).toBe('ev_battery_power');
      expect(result.value).toBe(12400);
      expect(result.unit).toBe('watt');
    });

    it('marks ICE engine RPM as powertrain_not_applicable on EV', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'powertrainCombustionEngineSpeed',
          value: 2000,
          providerUnit: 'rpm',
          observedAt: OBSERVED,
        },
        {
          fuelType: 'ELECTRIC',
          supportedDimoSignals: new Set(['powertrainCombustionEngineSpeed']),
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'UNSUPPORTED',
          reason: 'powertrain_not_applicable',
          canonicalKey: 'engine_rpm',
        }),
      );
    });
  });

  describe('post-trip analysis context only — altitude/heading', () => {
    it('maps altitude and heading with POST_TRIP_ANALYSIS_CONTEXT scope', () => {
      const context = {
        fuelType: 'PETROL',
        supportedDimoSignals: LTE_R1_ICE_SUPPORTED,
      };

      const altitude = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'currentLocationAltitude',
          value: 142.3,
          providerUnit: 'm',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        context,
      );
      const heading = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'currentLocationHeading',
          value: 187,
          providerUnit: 'deg',
          observedAt: OBSERVED,
          receivedAt: RECEIVED,
        },
        context,
      );

      expect(altitude.status).toBe('SUPPORTED');
      expect(heading.status).toBe('SUPPORTED');
      if (altitude.status === 'SUPPORTED' && heading.status === 'SUPPORTED') {
        expect(altitude.usageScope).toBe('POST_TRIP_ANALYSIS_CONTEXT');
        expect(heading.usageScope).toBe('POST_TRIP_ANALYSIS_CONTEXT');
        expect(altitude.tripDetectionEligible).toBe(false);
        expect(heading.tripDetectionEligible).toBe(false);
      }
    });
  });

  describe('unsupported / unknown inputs', () => {
    it('returns UNSUPPORTED for unknown DIMO signal names', () => {
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'isIgnitionOn',
          value: 1,
          observedAt: OBSERVED,
        },
        { supportedDimoSignals: new Set(['isIgnitionOn']) },
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'UNSUPPORTED',
          reason: 'unknown_dimo_signal',
        }),
      );
    });

    it('uses batchReceivedAt when sample receivedAt is absent', () => {
      const batchReceivedAt = new Date(RECEIVED);
      const result = mapDimoProviderSignalToCanonical(
        {
          dimoSignalName: 'obdEngineLoad',
          value: 22,
          providerUnit: '%',
          observedAt: OBSERVED,
        },
        {
          fuelType: 'PETROL',
          supportedDimoSignals: LTE_R1_ICE_SUPPORTED,
          batchReceivedAt,
        },
      );

      expect(result.status).toBe('SUPPORTED');
      if (result.status !== 'SUPPORTED') return;
      expect(result.receivedAt).toEqual(batchReceivedAt);
      expect(result.observedAt.toISOString()).toBe(OBSERVED);
    });
  });
});
