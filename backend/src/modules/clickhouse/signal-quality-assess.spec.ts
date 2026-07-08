import type { HfWindowSummary } from './clickhouse-hf.types';
import {
  assessTripSignalQuality,
  signalAvailabilityFromWindows,
} from './signal-quality-assess';
import { deriveVehicleCapabilityProfile } from '@modules/vehicle-intelligence/vehicle-capabilities';

const iceProfile = deriveVehicleCapabilityProfile({
  hardwareType: 'SMART5',
  fuelType: 'petrol',
  hasHfWaypoints: true,
});

function speedWindow(coverage: HfWindowSummary['coverage'], count = 55): HfWindowSummary {
  return {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    windowStart: new Date('2026-06-25T10:00:00.000Z'),
    windowEnd: new Date('2026-06-25T10:01:00.000Z'),
    signalGroup: 'speed',
    pointCount: count,
    gpsPointCount: 0,
    missingGapCount: 0,
    coverage,
    statsJson: {
      signalCounts: { speed: count },
      scalars: { speed: { min: 10, max: 80, avg: 45, count } },
    },
  };
}

describe('assessTripSignalQuality', () => {
  it('returns unavailable with reasons when no HF data', () => {
    const result = assessTripSignalQuality({
      windows: [],
      hfPointCount: 0,
      capabilityProfile: iceProfile,
      signalAvailability: {
        rpmAvailable: false,
        throttleAvailable: false,
        coolantAvailable: false,
        loadAvailable: false,
        tractionBatteryPowerAvailable: false,
      },
    });
    expect(result.overallQuality).toBe('unavailable');
    expect(result.hfAvailability).toBe('missing');
    expect(result.reasons.some((r) => r.includes('No HF points'))).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.internalDebug).toBe(true);
  });

  it('classifies good quality when speed windows are dense', () => {
    const result = assessTripSignalQuality({
      windows: [speedWindow('good'), speedWindow('good')],
      hfPointCount: 120,
      capabilityProfile: iceProfile,
      signalAvailability: {
        rpmAvailable: true,
        throttleAvailable: true,
        coolantAvailable: true,
        loadAvailable: false,
        tractionBatteryPowerAvailable: false,
      },
    });
    expect(result.overallQuality).toBe('good');
    expect(result.hfAvailability).toBe('hf_available');
    expect(result.windowCount).toBe(2);
    expect(result.signalCoverage.length).toBeGreaterThan(0);
  });

  it('marks degraded when ClickHouse is down but still returns reasons', () => {
    const result = assessTripSignalQuality({
      windows: [],
      hfPointCount: 0,
      capabilityProfile: iceProfile,
      signalAvailability: {
        rpmAvailable: false,
        throttleAvailable: false,
        coolantAvailable: false,
        loadAvailable: false,
        tractionBatteryPowerAvailable: false,
      },
      degraded: true,
      degradedReason: 'clickhouse_unavailable',
    });
    expect(result.degraded).toBe(true);
    expect(result.reasons.some((r) => r.includes('ClickHouse'))).toBe(true);
  });

  it('lists missing key engine signals for ICE profile', () => {
    const result = assessTripSignalQuality({
      windows: [speedWindow('medium', 25)],
      hfPointCount: 50,
      capabilityProfile: iceProfile,
      signalAvailability: {
        rpmAvailable: false,
        throttleAvailable: false,
        coolantAvailable: false,
        loadAvailable: false,
        tractionBatteryPowerAvailable: false,
      },
    });
    expect(result.missingKeySignals).toContain('rpm');
    expect(result.detectorFeasibilityHints.length).toBeGreaterThan(0);
  });
});

describe('signalAvailabilityFromWindows', () => {
  it('derives availability from window stats_json', () => {
    const windows: HfWindowSummary[] = [
      {
        orgId: 'o',
        vehicleId: 'v',
        windowStart: new Date(),
        windowEnd: new Date(),
        signalGroup: 'powertrain',
        pointCount: 2,
        gpsPointCount: 0,
        missingGapCount: 0,
        statsJson: {
          signalCounts: {},
          scalars: {
            rpm: { min: 1, max: 2, avg: 1.5, count: 10 },
            throttle: { min: 1, max: 2, avg: 1.5, count: 10 },
          },
        },
      },
    ];
    const avail = signalAvailabilityFromWindows(windows);
    expect(avail.rpmAvailable).toBe(true);
    expect(avail.throttleAvailable).toBe(true);
  });
});
