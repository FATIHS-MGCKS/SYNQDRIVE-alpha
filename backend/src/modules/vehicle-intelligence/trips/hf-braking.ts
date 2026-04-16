import type { CleanHfPoint } from './hf-preprocessing';

export interface BrakingEvent {
  startedAt: Date;
  endedAt: Date;
  startSpeedKmh: number;
  endSpeedKmh: number;
  durationMs: number;
  sampleCount: number;
  peakDecelMs2: number;
  peakDecelG: number;
  deltaKmh: number;
  intensity: number;
  highSpeedStart: boolean;
  classification: 'LIGHT' | 'MODERATE' | 'HARD' | 'EXTREME';
}

const G = 9.81;

// ── Thresholds ────────────────────────────────────────────────────────────────
const ENTRY_MS2 = 1.5;         // Event starts when decel >= this
const CONTINUE_MS2 = 1.2;      // Hysteresis: event stays open while decel >= this
const MODERATE_MS2 = 2.8;
const HARD_MS2 = 4.5;
const EXTREME_MS2 = 7.0;

// Acceptance filters (1-second HF data context)
const MIN_SAMPLE_COUNT = 2;
const MIN_DELTA_KMH = 3.0;

// HIGH_SPEED boundary for metadata
const HIGH_SPEED_KMH = 80;

// Merge logic
const MIN_EVENT_SEPARATION_MS = 1500;

function classify(peakMs2: number): BrakingEvent['classification'] {
  if (peakMs2 >= EXTREME_MS2) return 'EXTREME';
  if (peakMs2 >= HARD_MS2) return 'HARD';
  if (peakMs2 >= MODERATE_MS2) return 'MODERATE';
  return 'LIGHT';
}

/**
 * Intensity score [0..1] normalized against the EXTREME threshold (7.0 m/s²).
 */
function computeIntensity(peakMs2: number): number {
  return Math.min(1, Math.round((peakMs2 / EXTREME_MS2) * 100) / 100);
}

/**
 * Reconstruct braking events from a contiguous segment of 1-second HF data.
 *
 * Entry:    decel >= ENTRY_MS2 (1.5 m/s²)
 * Continue: decel >= CONTINUE_MS2 (1.2 m/s²) — hysteresis to avoid fragmentation
 * Accept:   sampleCount >= 2 AND deltaKmh >= 3.0
 *
 * Classification:
 *   LIGHT:    1.5 – < 2.8 m/s²
 *   MODERATE: 2.8 – < 4.5 m/s²
 *   HARD:     4.5 – < 7.0 m/s²
 *   EXTREME:  >= 7.0 m/s²
 *
 * EXTREME braking (>= 7.0 m/s²) is a braking-class intensity label.
 * FULL_BRAKING abuse events (>= 7.5 m/s²) are a separate, stricter abuse category.
 * POSSIBLE_IMPACT (>= 12.0 m/s²) is an independent abrupt-deceleration abuse event.
 */
export function detectBrakingEvents(
  segment: CleanHfPoint[],
): BrakingEvent[] {
  if (segment.length < 3) return [];
  const events: BrakingEvent[] = [];

  let inEvent = false;
  let eventStart = 0;
  let peakDecel = 0;
  let sampleCount = 0;

  function tryClose(endIdx: number) {
    const dur = segment[endIdx].ts - segment[eventStart].ts;
    const deltaKmh = segment[eventStart].speedKmh - segment[endIdx].speedKmh;

    if (sampleCount >= MIN_SAMPLE_COUNT && deltaKmh >= MIN_DELTA_KMH) {
      events.push(buildEvent(segment, eventStart, endIdx, peakDecel, sampleCount));
    }
  }

  for (let i = 1; i < segment.length; i++) {
    const dt = (segment[i].ts - segment[i - 1].ts) / 1000;
    if (dt <= 0) continue;

    const decel = (segment[i - 1].speedMs - segment[i].speedMs) / dt;

    if (!inEvent) {
      if (decel >= ENTRY_MS2) {
        inEvent = true;
        eventStart = i - 1;
        peakDecel = decel;
        sampleCount = 1;
      }
    } else {
      if (decel >= CONTINUE_MS2) {
        sampleCount++;
        if (decel > peakDecel) peakDecel = decel;
      } else {
        tryClose(i - 1);
        inEvent = false;
        peakDecel = 0;
        sampleCount = 0;
      }
    }
  }

  if (inEvent) {
    tryClose(segment.length - 1);
  }

  return mergeNearbyEvents(events);
}

function buildEvent(
  segment: CleanHfPoint[],
  startIdx: number,
  endIdx: number,
  peakDecel: number,
  sampleCount: number,
): BrakingEvent {
  const deltaKmh = segment[startIdx].speedKmh - segment[endIdx].speedKmh;
  return {
    startedAt: new Date(segment[startIdx].ts),
    endedAt: new Date(segment[endIdx].ts),
    startSpeedKmh: Math.round(segment[startIdx].speedKmh * 10) / 10,
    endSpeedKmh: Math.round(segment[endIdx].speedKmh * 10) / 10,
    durationMs: segment[endIdx].ts - segment[startIdx].ts,
    sampleCount,
    peakDecelMs2: Math.round(peakDecel * 100) / 100,
    peakDecelG: Math.round((peakDecel / G) * 100) / 100,
    deltaKmh: Math.round(deltaKmh * 10) / 10,
    intensity: computeIntensity(peakDecel),
    highSpeedStart: segment[startIdx].speedKmh >= HIGH_SPEED_KMH,
    classification: classify(peakDecel),
  };
}

function mergeNearbyEvents(events: BrakingEvent[]): BrakingEvent[] {
  if (events.length <= 1) return events;
  const merged: BrakingEvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const prev = merged[merged.length - 1];
    const gap = events[i].startedAt.getTime() - prev.endedAt.getTime();

    if (gap < MIN_EVENT_SEPARATION_MS) {
      prev.endedAt = events[i].endedAt;
      prev.endSpeedKmh = events[i].endSpeedKmh;
      prev.durationMs = prev.endedAt.getTime() - prev.startedAt.getTime();
      prev.sampleCount += events[i].sampleCount;
      prev.deltaKmh = Math.round((prev.startSpeedKmh - prev.endSpeedKmh) * 10) / 10;
      if (events[i].peakDecelMs2 > prev.peakDecelMs2) {
        prev.peakDecelMs2 = events[i].peakDecelMs2;
        prev.peakDecelG = events[i].peakDecelG;
      }
      prev.highSpeedStart = prev.highSpeedStart || events[i].highSpeedStart;
      prev.intensity = computeIntensity(prev.peakDecelMs2);
      prev.classification = classify(prev.peakDecelMs2);
    } else {
      merged.push(events[i]);
    }
  }

  return merged;
}

export {
  ENTRY_MS2 as BRAKE_ENTRY_MS2,
  EXTREME_MS2 as BRAKE_EXTREME_MS2,
  HIGH_SPEED_KMH as BRAKE_HIGH_SPEED_KMH,
};
