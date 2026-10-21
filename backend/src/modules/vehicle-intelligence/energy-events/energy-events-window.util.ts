export interface RecoveryQueryWindow {
  from: Date;
  to: Date;
}

/**
 * Split [rangeFrom, rangeTo) into deterministic non-overlapping windows.
 * Semantics: inclusive start, exclusive end at rangeTo.
 * Adjacent windows share boundary instant (cursor advances to prior window end).
 */
export function splitRecoveryQueryWindows(
  rangeFrom: Date,
  rangeTo: Date,
  windowMs: number,
): RecoveryQueryWindow[] {
  const startMs = rangeFrom.getTime();
  const endMs = rangeTo.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const windows: RecoveryQueryWindow[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const windowEnd = Math.min(cursor + windowMs, endMs);
    windows.push({
      from: new Date(cursor),
      to: new Date(windowEnd),
    });
    cursor = windowEnd;
  }

  return windows;
}
