import {
  buildFleetDataCoverage,
  mapCoverageStateToLegacyReadinessLevel,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveSignalCapabilityMatrix,
  SignalCapabilityExpectation,
  SignalRuntimeStatus,
} from './fleet-data-coverage';

const baseObservation = {
  latitude: 52.5,
  longitude: 13.4,
  odometerKm: 12000,
  speedKmh: 40,
  fuelLevelRelative: 0.6,
  fuelLevelAbsolute: null,
  evSoc: null,
  obdDtcList: [],
  lastDtcPollAt: new Date('2026-07-18T11:00:00.000Z'),
  obdIsPluggedIn: true,
  jammingDetectedCount: 0,
  hasTelemetry: true,
  rawSignals: {},
};

function iceContext(overrides: Partial<Parameters<typeof buildFleetDataCoverage>[0]['context']> = {}) {
  return {
    provider: 'DIMO' as const,
    deviceClass: 'PHYSICAL_OBD' as const,
    powertrain: 'ICE' as const,
    physicalObdCapable: true,
    hasProviderLink: true,
    hasTelemetrySnapshot: true,
    ...overrides,
  };
}

describe('fleet-data-coverage', () => {
  describe('resolveFleetPowertrainClass', () => {
    it('classifies ICE and EV', () => {
      expect(resolveFleetPowertrainClass('GASOLINE')).toBe('ICE');
      expect(resolveFleetPowertrainClass('ELECTRIC')).toBe('EV');
      expect(resolveFleetPowertrainClass('PLUGIN_HYBRID')).toBe('PHEV');
    });
  });

  describe('resolveFleetDeviceClass', () => {
    it('classifies R1 LTE as physical OBD', () => {
      expect(
        resolveFleetDeviceClass({
          hardwareType: 'LTE_R1',
          hasAftermarketDevice: false,
          hasSyntheticDevice: false,
          hasProviderLink: true,
        }),
      ).toBe('PHYSICAL_OBD');
    });

    it('classifies synthetic device', () => {
      expect(
        resolveFleetDeviceClass({
          hardwareType: null,
          hasAftermarketDevice: false,
          hasSyntheticDevice: true,
          hasProviderLink: true,
        }),
      ).toBe('SYNTHETIC');
    });
  });

  describe('capability matrix', () => {
    it('ICE: evSoc NOT_APPLICABLE, fuel EXPECTED', () => {
      const matrix = resolveSignalCapabilityMatrix(iceContext());
      expect(matrix.evSoc).toBe(SignalCapabilityExpectation.NOT_APPLICABLE);
      expect(matrix.fuel).toBe(SignalCapabilityExpectation.EXPECTED);
      expect(matrix.obdPlug).toBe(SignalCapabilityExpectation.EXPECTED);
    });

    it('EV: fuel NOT_APPLICABLE, evSoc EXPECTED', () => {
      const matrix = resolveSignalCapabilityMatrix(
        iceContext({ powertrain: 'EV' }),
      );
      expect(matrix.fuel).toBe(SignalCapabilityExpectation.NOT_APPLICABLE);
      expect(matrix.evSoc).toBe(SignalCapabilityExpectation.EXPECTED);
    });

    it('OEM: obdPlug NOT_APPLICABLE', () => {
      const matrix = resolveSignalCapabilityMatrix(
        iceContext({ deviceClass: 'OEM', physicalObdCapable: false }),
      );
      expect(matrix.obdPlug).toBe(SignalCapabilityExpectation.NOT_APPLICABLE);
      expect(matrix.jamming).toBe(SignalCapabilityExpectation.NOT_APPLICABLE);
    });

    it('Synthetic: obdPlug NOT_APPLICABLE', () => {
      const matrix = resolveSignalCapabilityMatrix(
        iceContext({ deviceClass: 'SYNTHETIC', physicalObdCapable: false }),
      );
      expect(matrix.obdPlug).toBe(SignalCapabilityExpectation.NOT_APPLICABLE);
    });
  });

  describe('buildFleetDataCoverage', () => {
    it('ICE with full fresh signals → GOOD 100%', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: baseObservation,
        telemetryFreshness: 'live',
      });
      expect(result.coverageState).toBe('GOOD');
      expect(result.coveragePercent).toBe(100);
      expect(result.freshSignalCount).toBe(result.expectedSignalCount);
      const evSoc = result.signals.find((s) => s.key === 'evSoc');
      expect(evSoc?.status).toBe(SignalRuntimeStatus.NOT_APPLICABLE);
    });

    it('ICE: missing evSoc does not reduce coverage', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: { ...baseObservation, evSoc: null },
        telemetryFreshness: 'live',
      });
      expect(result.coveragePercent).toBe(100);
      expect(result.signals.find((s) => s.key === 'evSoc')?.capability).toBe(
        SignalCapabilityExpectation.NOT_APPLICABLE,
      );
    });

    it('EV without fuel: fuel NOT_APPLICABLE', () => {
      const result = buildFleetDataCoverage({
        context: iceContext({ powertrain: 'EV' }),
        observation: {
          ...baseObservation,
          fuelLevelRelative: null,
          evSoc: 0.72,
        },
        telemetryFreshness: 'live',
      });
      expect(result.signals.find((s) => s.key === 'fuel')?.capability).toBe(
        SignalCapabilityExpectation.NOT_APPLICABLE,
      );
      expect(result.signals.find((s) => s.key === 'evSoc')?.status).toBe(
        SignalRuntimeStatus.AVAILABLE_FRESH,
      );
    });

    it('empty DTC list with poll timestamp counts as available', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: {
          ...baseObservation,
          obdDtcList: [],
          lastDtcPollAt: new Date('2026-07-18T11:00:00.000Z'),
        },
        telemetryFreshness: 'live',
      });
      expect(result.signals.find((s) => s.key === 'dtc')?.status).toBe(
        SignalRuntimeStatus.AVAILABLE_FRESH,
      );
    });

    it('speed 0 is a valid fresh value', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: { ...baseObservation, speedKmh: 0 },
        telemetryFreshness: 'live',
      });
      expect(result.signals.find((s) => s.key === 'speed')?.status).toBe(
        SignalRuntimeStatus.AVAILABLE_FRESH,
      );
    });

    it('stale telemetry marks available signals as AVAILABLE_STALE', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: baseObservation,
        telemetryFreshness: 'signal_delayed',
      });
      expect(result.reasonCodes).toContain('TELEMETRY_STALE');
      expect(result.freshSignalCount).toBe(0);
      expect(result.staleSignalCount).toBeGreaterThan(0);
      expect(result.coveragePercent).toBe(0);
      expect(result.coverageState).toBe('INSUFFICIENT');
    });

    it('partial signals → PARTIAL', () => {
      const result = buildFleetDataCoverage({
        context: iceContext(),
        observation: {
          ...baseObservation,
          latitude: null,
          longitude: null,
          odometerKm: null,
          speedKmh: null,
          fuelLevelRelative: null,
          obdIsPluggedIn: null,
          rawSignals: {},
        },
        telemetryFreshness: 'live',
      });
      expect(result.coverageState).toBe('INSUFFICIENT');
      expect(result.missingSignalCount).toBeGreaterThan(0);
    });

    it('unknown powertrain adds CAPABILITY_UNKNOWN reason', () => {
      const result = buildFleetDataCoverage({
        context: iceContext({ powertrain: 'UNKNOWN' }),
        observation: baseObservation,
        telemetryFreshness: 'live',
      });
      expect(result.reasonCodes).toContain('CAPABILITY_UNKNOWN');
    });

    it('no provider link → NOT_APPLICABLE', () => {
      const result = buildFleetDataCoverage({
        context: iceContext({ hasProviderLink: false, hasTelemetrySnapshot: false }),
        observation: { ...baseObservation, hasTelemetry: false },
        telemetryFreshness: 'no_signal',
      });
      expect(result.coverageState).toBe('NOT_APPLICABLE');
    });

    it('OEM synthetic paths exclude obdPlug from denominator', () => {
      const result = buildFleetDataCoverage({
        context: iceContext({ deviceClass: 'SYNTHETIC', physicalObdCapable: false }),
        observation: {
          ...baseObservation,
          obdIsPluggedIn: null,
        },
        telemetryFreshness: 'live',
      });
      expect(result.signals.find((s) => s.key === 'obdPlug')?.capability).toBe(
        SignalCapabilityExpectation.NOT_APPLICABLE,
      );
    });

    it('provider class affects capability matrix without changing linked telemetry', () => {
      const dimoMatrix = resolveSignalCapabilityMatrix(
        iceContext({ provider: 'DIMO' }),
      );
      const noneMatrix = resolveSignalCapabilityMatrix(
        iceContext({ provider: 'NONE', hasProviderLink: false }),
      );
      expect(dimoMatrix.gps).toBe(SignalCapabilityExpectation.EXPECTED);
      expect(noneMatrix.gps).toBe(SignalCapabilityExpectation.UNSUPPORTED);

      const dimoCoverage = buildFleetDataCoverage({
        context: iceContext({ provider: 'DIMO' }),
        observation: baseObservation,
        telemetryFreshness: 'live',
      });
      const unlinkedCoverage = buildFleetDataCoverage({
        context: iceContext({ provider: 'NONE', hasProviderLink: false }),
        observation: baseObservation,
        telemetryFreshness: 'no_signal',
      });
      expect(dimoCoverage.coverageState).toBe('GOOD');
      expect(unlinkedCoverage.coverageState).toBe('NOT_APPLICABLE');
    });
  });

  describe('mapCoverageStateToLegacyReadinessLevel', () => {
    it('maps GOOD to good', () => {
      expect(mapCoverageStateToLegacyReadinessLevel('GOOD')).toBe('good');
    });
  });
});
