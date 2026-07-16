import {
  DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS,
  type DimoRechargeSegmentQueryWindow,
} from './dimo-recharge-segments.types';

/** Split an arbitrary range into DIMO-compliant windows (max 31 days each). */
export function splitDimoRechargeQueryWindows(
  from: Date,
  to: Date,
  maxWindowMs: number = DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS,
): DimoRechargeSegmentQueryWindow[] {
  const startMs = from.getTime();
  const endMs = to.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const windows: DimoRechargeSegmentQueryWindow[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const windowEnd = Math.min(cursor + maxWindowMs, endMs);
    windows.push({
      from: new Date(cursor),
      to: new Date(windowEnd),
    });
    cursor = windowEnd;
  }

  return windows;
}
