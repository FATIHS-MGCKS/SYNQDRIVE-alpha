import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import {
  HF_MIRROR_GPS_MIN_INTERVAL_MS,
  buildHfMirrorPoints,
} from './hf-mirror-signals';

const ctx = {
  orgId: 'org-1',
  vehicleId: 'veh-1',
  tokenId: 7,
  tripId: 'trip-1',
  bookingId: 'book-1',
  source: 'dimo',
};

function reading(
  offsetSec: number,
  over: Partial<HighFrequencyReading> = {},
): HighFrequencyReading {
  const base = new Date('2026-06-25T10:00:00.000Z');
  base.setSeconds(base.getSeconds() + offsetSec);
  return {
    timestamp: base.toISOString(),
    speedKmh: 40,
    engineCoolantTempC: null,
    rpm: null,
    throttlePosition: null,
    engineLoad: null,
    tractionBatteryPowerKw: null,
    ...over,
  };
}

describe('buildHfMirrorPoints', () => {
  it('mirrors extended signals when present', () => {
    const points = buildHfMirrorPoints(ctx, [
      reading(0, {
        latitude: 52.52,
        longitude: 13.405,
        socPercent: 72,
        odometerKm: 12050,
        exteriorAirTempC: 18,
        ignitionOn: true,
        tirePressureFrontLeftBar: 2.4,
      }),
    ]);

    const names = points.map((p) => p.signalName);
    expect(names).toContain('currentLocationLatitude');
    expect(names).toContain('currentLocationLongitude');
    expect(names).toContain('powertrainTractionBatteryStateOfChargeCurrent');
    expect(names).toContain('powertrainTransmissionTravelledDistance');
    expect(names).toContain('exteriorAirTemperature');
    expect(names).toContain('isIgnitionOn');
    expect(names).toContain('chassisAxleRow1WheelLeftTirePressure');

    const soc = points.find(
      (p) => p.signalName === 'powertrainTractionBatteryStateOfChargeCurrent',
    );
    expect(soc?.signalGroup).toBe('battery');
    expect(soc?.valueFloat).toBe(72);
    expect(soc?.tripId).toBe('trip-1');
    expect(soc?.bookingId).toBe('book-1');

    const ign = points.find((p) => p.signalName === 'isIgnitionOn');
    expect(ign?.valueBool).toBe(true);
    expect(ign?.signalGroup).toBe('powertrain');
  });

  it('skips missing optional signals without error', () => {
    const points = buildHfMirrorPoints(ctx, [reading(0)]);
    expect(points.some((p) => p.signalName === 'speed')).toBe(true);
    expect(points.some((p) => p.signalName === 'currentLocationLatitude')).toBe(
      false,
    );
  });

  it('downsamples GPS to avoid per-second flood', () => {
    const readings: HighFrequencyReading[] = [];
    for (let i = 0; i < 120; i++) {
      readings.push(
        reading(i, {
          latitude: 52.5 + i * 0.0001,
          longitude: 13.4 + i * 0.0001,
        }),
      );
    }
    const points = buildHfMirrorPoints(ctx, readings, {
      gpsMinIntervalMs: HF_MIRROR_GPS_MIN_INTERVAL_MS,
    });
    const lat = points.filter((p) => p.signalName === 'currentLocationLatitude');
    expect(lat.length).toBeLessThan(readings.length);
    expect(lat.length).toBeGreaterThanOrEqual(1);
  });

  it('dedupes identical tire pressure samples', () => {
    const points = buildHfMirrorPoints(ctx, [
      reading(0, { tirePressureFrontLeftBar: 2.5 }),
      reading(1, { tirePressureFrontLeftBar: 2.5 }),
      reading(2, { tirePressureFrontLeftBar: 2.6 }),
    ]);
    const fl = points.filter(
      (p) => p.signalName === 'chassisAxleRow1WheelLeftTirePressure',
    );
    expect(fl).toHaveLength(2);
  });
});
