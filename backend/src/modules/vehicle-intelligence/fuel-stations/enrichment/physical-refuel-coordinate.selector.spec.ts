import * as fs from 'fs';
import * as path from 'path';
import {
  derivePhysicalRefuelCoordinate,
  PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2,
  PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION,
} from './physical-refuel-coordinate.selector';
import {
  KS_MX_2024_SEPT04_EVENT_A,
  ESSO_YSENBURG_CENTROID,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

const fixturePath = path.join(
  __dirname,
  '../../../dimo/fixtures/ks-mx-2024-sept04-route-fuel.fixture.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  routePoints: Array<{
    timestamp: string;
    latitude: number | null;
    longitude: number | null;
    speedKmh: number | null;
  }>;
  fuelSamples: Array<{ timestamp: string; fuelLiters: number | null }>;
};

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('physical refuel coordinate selector (G1.2)', () => {
  const routeSamples = fixture.routePoints.map((p) => ({
    timestamp: p.timestamp,
    latitude: p.latitude,
    longitude: p.longitude,
    speedKmh: p.speedKmh,
  }));

  beforeAll(() => {
    expect(PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION).toBe('g1.2-v2');
    expect(fixture.routePoints.length).toBeGreaterThan(100);
  });

  it('selector input contract has no station ground-truth fields', () => {
    const input = {
      routeSamples,
      fuelRiseOnsetAt: KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart,
      eventStartAt: KS_MX_2024_SEPT04_EVENT_A.startTime,
    };
    const keys = JSON.stringify(input);
    expect(keys).not.toMatch(/esso|osm|station|260122108/i);
    expect(keys).not.toContain(String(ESSO_YSENBURG_CENTROID.latitude));
  });

  it('selects Sept04 forecourt dwell cluster adjacent to rise onset', () => {
    const riseMs = new Date(KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart).getTime();
    const lookbackMs = Math.max(
      new Date(KS_MX_2024_SEPT04_EVENT_A.startTime).getTime(),
      riseMs - 30 * 60 * 1000,
    );
    const gpsInWindow = routeSamples.filter(
      (s) =>
        s.latitude != null &&
        new Date(s.timestamp).getTime() <= riseMs &&
        new Date(s.timestamp).getTime() >= lookbackMs,
    );
    expect(gpsInWindow.length).toBeGreaterThan(20);

    const result = derivePhysicalRefuelCoordinate({
      routeSamples,
      fuelRiseOnsetAt: KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart,
      eventStartAt: KS_MX_2024_SEPT04_EVENT_A.startTime,
      policyVersion: PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2,
    });

    expect(result.status).toBe('SELECTED');
    expect(result.coordinate).toBeDefined();
    expect(result.provenance.policyVersion).toBe(PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2);
    expect(result.provenance.temporalOffsetToRiseSec).toBeLessThanOrEqual(30);
    expect(result.provenance.sampleCount).toBeGreaterThanOrEqual(2);

    const distEsso = haversineM(
      result.coordinate!.latitude,
      result.coordinate!.longitude,
      ESSO_YSENBURG_CENTROID.latitude,
      ESSO_YSENBURG_CENTROID.longitude,
    );
    expect(distEsso).toBeGreaterThanOrEqual(5);
    expect(distEsso).toBeLessThanOrEqual(25);

    expect(result.provenance.clusterStart).toMatch(/2026-09-04T03:47:1/);
  });

  it('prefers forecourt dwell adjacent to rise over unrelated earlier stop', () => {
    const result = derivePhysicalRefuelCoordinate({
      routeSamples,
      fuelRiseOnsetAt: KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart,
    });

    expect(result.status).toBe('SELECTED');
    expect(result.provenance.temporalOffsetToRiseSec).toBeLessThanOrEqual(60);

    const earlyCluster = routeSamples.filter((p) => p.timestamp.startsWith('2026-09-04T03:37'));
    const earlyMedoid = earlyCluster.find((p) => p.latitude === 51.3353366);
    expect(earlyMedoid).toBeDefined();
    const earlyDist = haversineM(
      earlyMedoid!.latitude!,
      earlyMedoid!.longitude!,
      ESSO_YSENBURG_CENTROID.latitude,
      ESSO_YSENBURG_CENTROID.longitude,
    );
    expect(earlyDist).toBeGreaterThan(1500);

    const selectedDistEsso = haversineM(
      result.coordinate!.latitude,
      result.coordinate!.longitude,
      ESSO_YSENBURG_CENTROID.latitude,
      ESSO_YSENBURG_CENTROID.longitude,
    );
    expect(selectedDistEsso).toBeLessThan(30);
  });

  it('returns INSUFFICIENT_EVIDENCE when no GPS samples', () => {
    const result = derivePhysicalRefuelCoordinate({
      routeSamples: [],
      fuelRiseOnsetAt: KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart,
    });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns NO_DWELL_FOUND when only high-speed samples precede rise', () => {
    const movingOnly = routeSamples
      .filter((p) => p.speedKmh != null && p.speedKmh > 40)
      .slice(0, 20);
    const result = derivePhysicalRefuelCoordinate({
      routeSamples: movingOnly,
      fuelRiseOnsetAt: movingOnly[movingOnly.length - 1].timestamp,
    });
    expect(result.status).toBe('NO_DWELL_FOUND');
  });

  it('returns AMBIGUOUS when two spatially separated clusters tie on temporal adjacency', () => {
    const riseAt = '2026-09-04T04:00:00.000Z';
    const clusterA = [
      { timestamp: '2026-09-04T03:59:05.000Z', latitude: 51.32126, longitude: 9.51455, speedKmh: 0 },
      { timestamp: '2026-09-04T03:59:18.000Z', latitude: 51.32127, longitude: 9.51456, speedKmh: 0 },
    ];
    const clusterB = [
      { timestamp: '2026-09-04T03:59:40.000Z', latitude: 51.305, longitude: 9.513, speedKmh: 0 },
      { timestamp: '2026-09-04T03:59:55.000Z', latitude: 51.3051, longitude: 9.5131, speedKmh: 0 },
    ];
    const result = derivePhysicalRefuelCoordinate(
      { routeSamples: [...clusterA, ...clusterB], fuelRiseOnsetAt: riseAt },
      {
        speedThresholdKmh: 10,
        minClusterPoints: 2,
        maxGapSec: 15,
        lookbackMaxSec: 3600,
        maxClusterEndToRiseSec: 900,
        maxSpatialSpreadMeters: 80,
        ambiguityMarginSec: 60,
      },
    );
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('returns NO_DWELL_FOUND when only a single low-speed sample precedes rise', () => {
    const result = derivePhysicalRefuelCoordinate({
      routeSamples: [
        {
          timestamp: '2026-09-04T03:44:00.000Z',
          latitude: 51.321265,
          longitude: 9.5145616,
          speedKmh: 0,
        },
      ],
      fuelRiseOnsetAt: '2026-09-04T03:47:45.000Z',
      eventStartAt: '2026-09-04T03:40:45.000Z',
    });
    expect(['NO_DWELL_FOUND', 'INSUFFICIENT_EVIDENCE']).toContain(result.status);
    expect(result.coordinate).toBeUndefined();
  });
});
