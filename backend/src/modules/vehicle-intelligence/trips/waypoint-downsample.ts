export interface TimestampedPoint {
  recordedAt: Date;
}

/** Keep one point per interval (default 30s) plus the final point for route end. */
export function downsampleWaypoints<T extends TimestampedPoint>(
  points: T[],
  intervalMs = 30_000,
): T[] {
  if (points.length <= 1) return points;

  const sorted = [...points].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  const out: T[] = [];
  let lastKeptMs = -Infinity;

  for (const point of sorted) {
    const t = point.recordedAt.getTime();
    if (out.length === 0 || t - lastKeptMs >= intervalMs) {
      out.push(point);
      lastKeptMs = t;
    }
  }

  const last = sorted[sorted.length - 1];
  if (out[out.length - 1] !== last) {
    out.push(last);
  }

  return out;
}
