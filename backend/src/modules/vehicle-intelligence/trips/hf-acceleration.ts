import type { CleanHfPoint } from './hf-preprocessing';

export interface AccelerationEvent {
  startedAt: Date;
  endedAt: Date;
  startSpeedKmh: number;
  endSpeedKmh: number;
  durationMs: number;
  sampleCount: number;
  peakAccelMs2: number;
  peakAccelG: number;
  deltaKmh: number;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  classification: 'LIGHT' | 'MODERATE' | 'HARD' | 'EXTREME';
}

const G = 9.81;

// ── Thresholds ────────────────────────────────────────────────────────────────
// Classification boundaries (m/s²) — applied to peakAccelMs2
const ENTRY_MS2 = 1.5;         // Event starts when accel >= this
const CONTINUE_MS2 = 1.2;      // Hysteresis: event stays open while accel >= this
const MODERATE_MS2 = 2.5;
const HARD_MS2 = 3.5;
const EXTREME_MS2 = 5.0;

// Acceptance filters (1-second HF data context)
const MIN_SAMPLE_COUNT = 2;    // Minimum distinct 1s steps that contributed to the event
const MIN_DELTA_KMH = 4.0;     // Minimum total speed gain in km/h

// Merge logic: events closer than this are fused into one
const MIN_EVENT_SEPARATION_MS = 2000;

function classify(peakMs2: number): AccelerationEvent['classification'] {
  if (peakMs2 >= EXTREME_MS2) return 'EXTREME';
  if (peakMs2 >= HARD_MS2) return 'HARD';
  if (peakMs2 >= MODERATE_MS2) return 'MODERATE';
  return 'LIGHT';
}

/**
 * Reconstruct acceleration events from a contiguous segment of 1-second HF data.
 *
 * Entry:    accel >= ENTRY_MS2 (1.5 m/s²)
 * Continue: accel >= CONTINUE_MS2 (1.2 m/s²) — explicit hysteresis to prevent fragmentation
 * Accept:   sampleCount >= 2 AND deltaKmh >= 4.0
 *
 * min-duration logic removed — 1s HF buckets are step-based, not time-based.
 */
export function detectAccelerationEvents(
  segment: CleanHfPoint[],
): AccelerationEvent[] {
  if (segment.length < 3) return [];
  const events: AccelerationEvent[] = [];

  let inEvent = false;
  let eventStart = 0;
  let peakAccel = 0;
  let sampleCount = 0;
  let maxThrottle: number | null = null;
  let maxRpm: number | null = null;

  function tryClose(endIdx: number) {
    const dur = segment[endIdx].ts - segment[eventStart].ts;
    const deltaKmh = segment[endIdx].speedKmh - segment[eventStart].speedKmh;

    if (sampleCount >= MIN_SAMPLE_COUNT && deltaKmh >= MIN_DELTA_KMH) {
      events.push({
        startedAt: new Date(segment[eventStart].ts),
        endedAt: new Date(segment[endIdx].ts),
        startSpeedKmh: Math.round(segment[eventStart].speedKmh * 10) / 10,
        endSpeedKmh: Math.round(segment[endIdx].speedKmh * 10) / 10,
        durationMs: dur,
        sampleCount,
        peakAccelMs2: Math.round(peakAccel * 100) / 100,
        peakAccelG: Math.round((peakAccel / G) * 100) / 100,
        deltaKmh: Math.round(deltaKmh * 10) / 10,
        maxThrottlePos: maxThrottle != null ? Math.round(maxThrottle * 10) / 10 : null,
        maxEngineRpm: maxRpm != null ? Math.round(maxRpm) : null,
        classification: classify(peakAccel),
      });
    }
  }

  for (let i = 1; i < segment.length; i++) {
    const dt = (segment[i].ts - segment[i - 1].ts) / 1000;
    if (dt <= 0) continue;

    const accel = (segment[i].speedMs - segment[i - 1].speedMs) / dt;

    if (!inEvent) {
      if (accel >= ENTRY_MS2) {
        inEvent = true;
        eventStart = i - 1;
        peakAccel = accel;
        sampleCount = 1;
        maxThrottle = segment[i].throttlePct;
        maxRpm = segment[i].rpm;
      }
    } else {
      // Hysteresis: keep event open while accel >= CONTINUE threshold
      if (accel >= CONTINUE_MS2) {
        sampleCount++;
        if (accel > peakAccel) peakAccel = accel;
        if (segment[i].throttlePct != null && (maxThrottle == null || segment[i].throttlePct! > maxThrottle)) {
          maxThrottle = segment[i].throttlePct;
        }
        if (segment[i].rpm != null && (maxRpm == null || segment[i].rpm! > maxRpm)) {
          maxRpm = segment[i].rpm;
        }
      } else {
        // Below hysteresis threshold — close event
        tryClose(i - 1);
        inEvent = false;
        peakAccel = 0;
        sampleCount = 0;
        maxThrottle = null;
        maxRpm = null;
      }
    }
  }

  // Close trailing event
  if (inEvent) {
    tryClose(segment.length - 1);
  }

  return mergeNearbyEvents(events);
}

function mergeNearbyEvents(events: AccelerationEvent[]): AccelerationEvent[] {
  if (events.length <= 1) return events;
  const merged: AccelerationEvent[] = [{ ...events[0], _mergedCount: 1 } as any];

  for (let i = 1; i < events.length; i++) {
    const prev = merged[merged.length - 1] as any;
    const gap = events[i].startedAt.getTime() - prev.endedAt.getTime();

    if (gap < MIN_EVENT_SEPARATION_MS) {
      // Merge: extend end, accumulate samples, keep best peak
      prev.endedAt = events[i].endedAt;
      prev.endSpeedKmh = events[i].endSpeedKmh;
      prev.durationMs = prev.endedAt.getTime() - prev.startedAt.getTime();
      prev.sampleCount += events[i].sampleCount;
      prev.deltaKmh = Math.round((prev.endSpeedKmh - prev.startSpeedKmh) * 10) / 10;
      prev._mergedCount = (prev._mergedCount ?? 1) + 1;
      if (events[i].peakAccelMs2 > prev.peakAccelMs2) {
        prev.peakAccelMs2 = events[i].peakAccelMs2;
        prev.peakAccelG = events[i].peakAccelG;
      }
      prev.classification = classify(prev.peakAccelMs2);
      if (events[i].maxThrottlePos != null && (prev.maxThrottlePos == null || events[i].maxThrottlePos! > prev.maxThrottlePos!)) {
        prev.maxThrottlePos = events[i].maxThrottlePos;
      }
      if (events[i].maxEngineRpm != null && (prev.maxEngineRpm == null || events[i].maxEngineRpm! > prev.maxEngineRpm!)) {
        prev.maxEngineRpm = events[i].maxEngineRpm;
      }
    } else {
      merged.push({ ...events[i], _mergedCount: 1 } as any);
    }
  }

  // Strip internal _mergedCount into the public mergedCount field
  return merged.map((e: any) => {
    const { _mergedCount, ...rest } = e;
    return { ...rest, mergedCount: _mergedCount ?? 1 } as AccelerationEvent & { mergedCount: number };
  });
}

export { ENTRY_MS2 as ACCEL_ENTRY_MS2, EXTREME_MS2 as ACCEL_EXTREME_MS2 };
