import type { DiV0SpeedQcEvaluateInput, DiV0SpeedQcPositionSample } from '../../di-v0-speed-qc.types';

/** Synthetic origin — not production GPS. */
const BASE = '2020-06-01T12:00:00Z';

function label(offsetSec: number): string {
  const ms = Date.parse(BASE) + offsetSec * 1000;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function linePositions(
  offsets: number[],
  stepMetersEast: number,
  lat = 50,
  lon0 = 10,
): DiV0SpeedQcPositionSample[] {
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return offsets.map((off) => {
    const lon = lon0 + (stepMetersEast * off) / mPerDegLon;
    return {
      bucketLabel: label(off),
      availability: 'PRESENT',
      latitude: lat,
      longitude: lon,
      positionState: 'FRESH',
    };
  });
}

export function syntheticPostGapSpikeInput(): DiV0SpeedQcEvaluateInput {
  const center = label(4);
  const positions: DiV0SpeedQcPositionSample[] = [
    { bucketLabel: label(1), availability: 'ROW_ABSENT' },
    { bucketLabel: label(2), availability: 'ROW_ABSENT' },
    // erroneous off-track fix (≈900 m east of corridor)
    {
      bucketLabel: label(3),
      availability: 'PRESENT',
      latitude: 50,
      longitude: 10.012,
      positionState: 'FRESH',
    },
    {
      bucketLabel: label(4),
      availability: 'PRESENT',
      latitude: 50,
      longitude: 10.0003,
      positionState: 'FRESH',
    },
    {
      bucketLabel: label(5),
      availability: 'PRESENT',
      latitude: 50,
      longitude: 10.00035,
      positionState: 'FRESH',
    },
    // corridor before gap
    {
      bucketLabel: label(0),
      availability: 'PRESENT',
      latitude: 50,
      longitude: 9.9998,
      positionState: 'FRESH',
    },
  ];

  return {
    centerBucketLabel: center,
    evidenceIdentity: { pinnedSnapshotHash: 'SYNTHETIC:POST_GAP_SPIKE' },
    positions,
    shadow: {
      intervalStart: center,
      intervalEnd: label(5),
      referenceTime: center,
      estimatedSpeedKmh: 1652,
      speedEvidenceState: 'NUMERIC_HIGH',
      valueConfidence: 'HIGH',
      sourceRelation: 'SUPPORTED',
      motionState: 'MOVING_SPEED_ESTIMATED',
      positionState: 'FRESH',
      abstentionReason: null,
      sourceQualityFlags: [],
      evidenceSources: ['L3'],
    },
  };
}

/** 1 Hz legs with a 66 m / 1 s eastward leg (uncorroborated) — API_SYNTHETIC class issue. */
export function syntheticHighLegSpeedInput(): DiV0SpeedQcEvaluateInput {
  const center = label(10);
  const lat = 50;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const lon0 = 10;
  const positions: DiV0SpeedQcPositionSample[] = [8, 9, 10, 11].map((off, i) => ({
    bucketLabel: label(off),
    availability: 'PRESENT' as const,
    latitude: lat,
    longitude: lon0 + (i * 36) / mPerDegLon,
    positionState: 'FRESH' as const,
  }));
  // 66 m jump on the center→next leg (~237 km/h implied)
  const nextIdx = positions.findIndex((p) => p.bucketLabel === label(11));
  positions[nextIdx] = {
    ...positions[nextIdx],
    longitude: positions[nextIdx].longitude! + 66 / mPerDegLon,
  };

  return {
    centerBucketLabel: center,
    evidenceIdentity: { pinnedSnapshotHash: 'SYNTHETIC:HIGH_LEG_SPEED' },
    positions,
    shadow: {
      intervalStart: center,
      intervalEnd: label(11),
      referenceTime: center,
      estimatedSpeedKmh: 179,
      speedEvidenceState: 'NUMERIC_HIGH',
      valueConfidence: 'HIGH',
      sourceRelation: 'SUPPORTED',
      motionState: 'MOVING_SPEED_ESTIMATED',
      positionState: 'FRESH',
      abstentionReason: null,
      sourceQualityFlags: [],
      evidenceSources: ['L3'],
    },
  };
}

/** ~130 km/h consistent 1 s legs (~36.1 m/s). */
export function syntheticHighway130Input(): DiV0SpeedQcEvaluateInput {
  const center = label(20);
  const step = 36.1;
  const positions = linePositions([18, 19, 20, 21], step, 48, 8);

  return {
    centerBucketLabel: center,
    evidenceIdentity: { pinnedSnapshotHash: 'SYNTHETIC:HIGHWAY_130' },
    positions,
    shadow: {
      intervalStart: center,
      intervalEnd: label(21),
      referenceTime: center,
      estimatedSpeedKmh: 130,
      speedEvidenceState: 'NUMERIC_HIGH',
      valueConfidence: 'HIGH',
      sourceRelation: 'SUPPORTED',
      motionState: 'MOVING_SPEED_ESTIMATED',
      positionState: 'FRESH',
      abstentionReason: null,
      sourceQualityFlags: [],
      evidenceSources: ['L3'],
    },
  };
}
