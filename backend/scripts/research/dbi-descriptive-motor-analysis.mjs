/** Pure READ_ONLY descriptive stats from multichannel observations (no kernel). */

function nums(values) {
  return values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function distributionHistogram(sorted, bucketSize) {
  if (!sorted.length) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const buckets = new Map();
  for (const v of sorted) {
    const key = Math.floor(v / bucketSize) * bucketSize;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, to: from + bucketSize, count }));
}

export function computeDescriptiveMotorAnalysis(observations, { coldCoolantMaxC = 60, throttleHighPct = 75 } = {}) {
  const rpm = nums(observations.map((o) => o.rpm));
  const load = nums(observations.map((o) => o.loadPct));
  const throttle = nums(observations.map((o) => o.throttlePct));
  const ect = nums(observations.map((o) => o.coolantC));
  const speed = nums(observations.map((o) => o.speedKmh));

  const coldBuckets = observations.filter((o) => o.coolantC != null && o.coolantC < coldCoolantMaxC);
  const coldRpm = nums(coldBuckets.map((o) => o.rpm));
  const coldLoad = nums(coldBuckets.map((o) => o.loadPct));

  const stationaryLike = observations.filter((o) => o.speedKmh != null && o.speedKmh <= 3);
  const stationaryRpm = nums(stationaryLike.map((o) => o.rpm));

  const highThrottle = throttle.filter((t) => t >= throttleHighPct).length;

  return {
    timestampAuthority: 'BUCKET_LABEL_UNVERIFIED',
    note: 'Per-channel bucket labels only; no cross-signal duration or simultaneity claims.',
    rpm: {
      count: rpm.length,
      min: rpm[0] ?? null,
      median: quantile(rpm, 0.5),
      p95: quantile(rpm, 0.95),
      max: rpm[rpm.length - 1] ?? null,
      histogram500: distributionHistogram(rpm, 500),
    },
    engineLoadPct: {
      count: load.length,
      median: quantile(load, 0.5),
      p95: quantile(load, 0.95),
      max: load[load.length - 1] ?? null,
      histogram10: distributionHistogram(load, 10),
    },
    throttlePct: {
      count: throttle.length,
      median: quantile(throttle, 0.5),
      p95: quantile(throttle, 0.95),
      max: throttle[throttle.length - 1] ?? null,
      bucketsAtOrAbove75Pct: highThrottle,
    },
    ectC: {
      count: ect.length,
      min: ect[0] ?? null,
      median: quantile(ect, 0.5),
      max: ect[ect.length - 1] ?? null,
      coldBucketCount: coldBuckets.length,
      warmBucketCount: observations.filter((o) => o.coolantC != null && o.coolantC >= coldCoolantMaxC).length,
      coldThresholdC: coldCoolantMaxC,
    },
    coldEctBucketMotorStats: {
      bucketCount: coldBuckets.length,
      rpmMedian: quantile(coldRpm, 0.5),
      rpmP95: quantile(coldRpm, 0.95),
      loadMedian: quantile(coldLoad, 0.5),
      loadP95: quantile(coldLoad, 0.95),
    },
    speedKmh: {
      count: speed.length,
      median: quantile(speed, 0.5),
      p95: quantile(speed, 0.95),
      max: speed[speed.length - 1] ?? null,
    },
    stationaryLikeBuckets: {
      definition: 'speedKmh <= 3 on merged multichannel row',
      bucketCount: stationaryLike.length,
      rpmMedian: quantile(stationaryRpm, 0.5),
      rpmP95: quantile(stationaryRpm, 0.95),
      rpmMax: stationaryRpm[stationaryRpm.length - 1] ?? null,
    },
  };
}
