export interface MapboxChunkTimestampResolution {
  include: boolean;
  timestamps?: number[];
  reason?: string;
}

/**
 * Mapbox Matching requires strictly increasing Unix timestamps when provided.
 * Omit timestamps for the whole chunk when any point is invalid or non-monotonic.
 */
export function resolveChunkTimestamps(
  coordinates: { timestamp?: string }[],
): MapboxChunkTimestampResolution {
  if (!coordinates.every((coord) => coord.timestamp)) {
    return { include: false, reason: 'missing_timestamp' };
  }

  const timestamps: number[] = [];
  for (const coord of coordinates) {
    const parsed = Date.parse(coord.timestamp!);
    if (Number.isNaN(parsed)) {
      return { include: false, reason: 'invalid_timestamp' };
    }
    timestamps.push(Math.floor(parsed / 1000));
  }

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] <= timestamps[i - 1]) {
      return { include: false, reason: timestamps[i] === timestamps[i - 1] ? 'equal_timestamp' : 'out_of_order_timestamp' };
    }
  }

  return { include: true, timestamps };
}
