/**
 * KS MX 2024 refuel — production forensic case (2026-08-28).
 *
 * DIMO detection envelope vs observed fuel-level-rise interval.
 */
export const KS_MX_2024_AUG28_TOKEN_ID = 187336;

export const KS_MX_2024_AUG28_DETECTION = {
  startTime: '2026-08-28T21:00:55.000Z',
  endTime: '2026-08-28T22:21:13.000Z',
  durationSeconds: 4818,
  fuelStartPercent: 5.490196078431373,
  fuelEndPercent: 40,
  fuelDeltaPercent: 34.50980392156863,
  fuelDeltaLiters: 23,
  dimoSegmentId: 'dimo-refuel-187336-1787950855000',
} as const;

export const KS_MX_2024_AUG28_FUEL_RISE = {
  startTime: '2026-08-28T22:10:00.000Z',
  endTime: '2026-08-28T22:14:40.000Z',
  durationSeconds: 280,
} as const;

export const KS_MX_2024_AUG28_STALE_SIBLING = {
  startTime: '2026-08-28T22:09:48.000Z',
  endTime: '2026-08-28T22:21:13.000Z',
  durationSeconds: 685,
  fuelDeltaLiters: 18,
  fuelDeltaPercent: 32.15686274509804,
  dimoSegmentId: 'dimo-refuel-187336-1787954988000',
} as const;

/** 30 s spaced relative fuel samples inside the DIMO detection window. */
export function buildKsMx2024Aug28FuelSamples(): Array<{
  timestamp: string;
  relativePercent: number;
}> {
  const samples: Array<{ timestamp: string; relativePercent: number }> = [];
  const windowStart = new Date('2026-08-28T21:00:55.000Z').getTime();
  const windowEnd = new Date('2026-08-28T22:21:13.000Z').getTime();
  const riseStart = new Date(KS_MX_2024_AUG28_FUEL_RISE.startTime).getTime();
  const riseEnd = new Date(KS_MX_2024_AUG28_FUEL_RISE.endTime).getTime();
  const baseline = KS_MX_2024_AUG28_DETECTION.fuelStartPercent;
  const peak = KS_MX_2024_AUG28_DETECTION.fuelEndPercent;

  for (let t = windowStart; t <= windowEnd; t += 30_000) {
    let level: number = baseline;
    if (t < riseStart) {
      level = baseline;
    } else if (t <= riseEnd) {
      const progress = (t - riseStart) / (riseEnd - riseStart);
      level = baseline + (peak - baseline) * progress;
    } else {
      level = peak;
    }
    samples.push({
      timestamp: new Date(t).toISOString(),
      relativePercent: level,
    });
  }
  return samples;
}

export const KS_MX_2024_AUG28_DIMO_SEGMENT = {
  start: {
    timestamp: KS_MX_2024_AUG28_DETECTION.startTime,
    value: { latitude: 51.3281916, longitude: 9.53018 },
  },
  end: {
    timestamp: KS_MX_2024_AUG28_DETECTION.endTime,
    value: { latitude: 51.3341366, longitude: 9.5042716 },
  },
  duration: KS_MX_2024_AUG28_DETECTION.durationSeconds,
  isOngoing: false,
  startedBeforeRange: false,
  signals: [
    {
      name: 'powertrainFuelSystemRelativeLevel',
      value: KS_MX_2024_AUG28_DETECTION.fuelStartPercent,
    },
    {
      name: 'powertrainFuelSystemRelativeLevel',
      value: KS_MX_2024_AUG28_DETECTION.fuelEndPercent,
    },
    {
      name: 'powertrainFuelSystemAbsoluteLevel',
      value: 3,
    },
    {
      name: 'powertrainFuelSystemAbsoluteLevel',
      value: 26,
    },
  ],
} as const;
