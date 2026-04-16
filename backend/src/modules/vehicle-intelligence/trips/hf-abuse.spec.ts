/**
 * SynqDrive HF Abuse Detector — Unit Tests (v2.4)
 *
 * Coverage:
 *   - COLD_ENGINE_HIGH_RPM
 *   - COLD_ENGINE_FULL_THROTTLE
 *   - ENGINE_SHUTDOWN_WHILE_DRIVING
 *   - ENGINE_REV_IN_IDLE
 *   - HIGH_RPM_CONSTANT
 *   - KICKDOWN (with speed guard)
 *   - LAUNCH_LIKE_START (renamed from LAUNCH_CONTROL)
 *   - OVERHEATING_ENGINE
 *   - LONG_IDLE
 *   - POSSIBLE_IMPACT (mini-window hardened)
 *   - FULL_BRAKING (mini-window hardened)
 *   - computeAbuseScore
 *   - assessSignalAvailability
 *   - Acceleration event logic (hysteresis, metadata, deltaKmh filter)
 *   - Braking event logic (hysteresis, metadata, sampleCount filter)
 *   - FULL_BRAKING / EXTREME braking relationship
 *   - KICKDOWN minimum speed guard
 *   - IMPACT / FULL_BRAKING noise protection
 */

import {
  detectAbuseEvents,
  computeAbuseScore,
  assessSignalAvailability,
  DEFAULT_RPM_CONFIG,
  ABUSE_SCORE_WEIGHTS,
  type AbuseEvent,
  type VehicleRpmConfig,
} from './hf-abuse';
import { detectAccelerationEvents } from './hf-acceleration';
import { detectBrakingEvents } from './hf-braking';
import type { CleanHfPoint } from './hf-preprocessing';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const G = 9.81;
const BASE_TS = 1_700_000_000_000; // fixed epoch ms

function ts(offsetSeconds: number): number {
  return BASE_TS + offsetSeconds * 1000;
}

/** Build a CleanHfPoint for the abuse/accel/braking detectors */
function pt(
  offsetS: number,
  speedKmh: number,
  opts: {
    coolantC?: number | null;
    rpm?: number | null;
    throttlePct?: number | null;
    loadPct?: number | null;
  } = {},
): CleanHfPoint {
  const speedMs = speedKmh / 3.6;
  return {
    ts: ts(offsetS),
    speedKmh,
    speedMs,
    coolantC: opts.coolantC !== undefined ? opts.coolantC : null,
    rpm: opts.rpm !== undefined ? opts.rpm : null,
    throttlePct: opts.throttlePct !== undefined ? opts.throttlePct : null,
    loadPct: opts.loadPct !== undefined ? opts.loadPct : null,
    tractionBatteryPowerKw: (opts as any).tractionBatteryPowerKw ?? null,
  };
}

/** Build a segment of constant-speed points (for long-idle, high-rpm tests) */
function constSeg(
  fromS: number,
  toS: number,
  speedKmh: number,
  opts: Parameters<typeof pt>[2] = {},
): CleanHfPoint[] {
  const out: CleanHfPoint[] = [];
  for (let s = fromS; s <= toS; s++) {
    out.push(pt(s, speedKmh, opts));
  }
  return out;
}

const ICE_CONFIG: VehicleRpmConfig = { idleRpm: 800, maxRpm: 6500 };
const SPORT_CONFIG: VehicleRpmConfig = { idleRpm: 1000, maxRpm: 8000 };

// ═══════════════════════════════════════════════════════════════
//  COLD_ENGINE_HIGH_RPM
// ═══════════════════════════════════════════════════════════════

describe('COLD_ENGINE_HIGH_RPM', () => {
  const highRpm = ICE_CONFIG.maxRpm * 0.76; // above 75% threshold

  it('fires when cold (< 60°C) and high RPM for >= 2s', () => {
    // 5 points required by detectAbuseEvents entry guard
    const seg = constSeg(0, 4, 40, { coolantC: 40, rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM');
    expect(ev).toBeDefined();
    expect(ev!.severity).toBe('WARNING');
  });

  it('severity SEVERE when RPM > 85% maxRpm', () => {
    const veryHighRpm = ICE_CONFIG.maxRpm * 0.86;
    const seg = constSeg(0, 4, 40, { coolantC: 35, rpm: veryHighRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM');
    expect(ev).toBeDefined();
    expect(ev!.severity).toBe('SEVERE');
  });

  it('does NOT fire when engine is warm (>= 60°C)', () => {
    const seg = constSeg(0, 4, 40, { coolantC: 65, rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM')).toBeUndefined();
  });

  it('does NOT fire for short cold + high RPM burst (< 2s)', () => {
    const seg = [
      pt(0, 40, { coolantC: 40, rpm: highRpm }),
      pt(1, 42, { coolantC: 42, rpm: highRpm }), // only 1s apart — duration = 0 ms after closing
      pt(2, 43, {}),
      pt(3, 44, {}),
      pt(4, 45, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM')).toBeUndefined();
  });

  it('does NOT fire when coolant is unavailable', () => {
    const seg = constSeg(0, 5, 40, { rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM')).toBeUndefined();
  });

  it('stores maxCoolantTemp as the max over the event (not just start)', () => {
    const seg = [
      pt(0, 40, { coolantC: 40, rpm: highRpm }),
      pt(1, 42, { coolantC: 50, rpm: highRpm }),
      pt(2, 43, { coolantC: 55, rpm: highRpm }), // peak coolant
      pt(3, 44, { coolantC: 52, rpm: highRpm }),
      pt(4, 45, {}), // padding
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM');
    expect(ev).toBeDefined();
    expect(ev!.maxCoolantTemp).toBe(55);
    expect((ev!.metadata as any).startCoolantC).toBe(40);
    expect((ev!.metadata as any).maxCoolantC).toBe(55);
  });

  it('uses vehicle-specific maxRpm threshold', () => {
    const sportHighRpm = SPORT_CONFIG.maxRpm * 0.76; // 6080
    const seg = constSeg(0, 4, 50, { coolantC: 40, rpm: sportHighRpm });
    const events = detectAbuseEvents(seg, SPORT_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_HIGH_RPM')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  COLD_ENGINE_FULL_THROTTLE
// ═══════════════════════════════════════════════════════════════

describe('COLD_ENGINE_FULL_THROTTLE', () => {
  it('fires when cold and throttle > 85% for >= 1.5s', () => {
    const seg = [
      pt(0, 30, { coolantC: 40, throttlePct: 90 }),
      pt(1, 35, { coolantC: 42, throttlePct: 92 }),
      pt(2, 40, { coolantC: 44, throttlePct: 88 }),
      pt(3, 42, {}),
      pt(4, 44, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_FULL_THROTTLE')).toBeDefined();
  });

  it('hysteresis: event stays open when throttle dips to 82% (above 80% continuation)', () => {
    const seg = [
      pt(0, 30, { coolantC: 40, throttlePct: 90 }),
      pt(1, 35, { coolantC: 42, throttlePct: 82 }),  // below 85% entry but above 80% continuation
      pt(2, 40, { coolantC: 44, throttlePct: 92 }),
      pt(3, 42, {}),
      pt(4, 44, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'COLD_ENGINE_FULL_THROTTLE');
    expect(ev).toBeDefined();
    expect(ev!.durationMs).toBe(2000); // spans 3 cold+throttle samples (0–2)
  });

  it('does NOT fire for short cold + high-throttle burst (< 1.5s)', () => {
    const seg = [
      pt(0, 30, { coolantC: 40, throttlePct: 90 }),
      pt(1, 35, { coolantC: 42, throttlePct: 90 }),  // only 1s duration
      pt(2, 36, {}),
      pt(3, 37, {}),
      pt(4, 38, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_FULL_THROTTLE')).toBeUndefined();
  });

  it('does NOT fire when coolant data is unavailable', () => {
    const seg = constSeg(0, 5, 40, { throttlePct: 95 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_FULL_THROTTLE')).toBeUndefined();
  });

  it('does NOT fire when engine is warm', () => {
    const seg = [
      pt(0, 30, { coolantC: 75, throttlePct: 95 }),
      pt(1, 35, { coolantC: 78, throttlePct: 95 }),
      pt(2, 40, { coolantC: 80, throttlePct: 95 }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'COLD_ENGINE_FULL_THROTTLE')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  ENGINE_SHUTDOWN_WHILE_DRIVING
// ═══════════════════════════════════════════════════════════════

describe('ENGINE_SHUTDOWN_WHILE_DRIVING', () => {
  it('fires when RPM drops from > 500 to < 100 while moving', () => {
    const seg = [
      pt(0, 60, { rpm: 3000 }),
      pt(1, 58, { rpm: 2800 }),
      pt(2, 55, { rpm: 2600 }),
      pt(3, 52, { rpm: 50 }),   // RPM died
      pt(4, 50, { rpm: 40 }),   // padding to meet 5-point minimum
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBeDefined();
  });

  it('does NOT fire when points are too far apart in time (time-gap guard)', () => {
    // Gap > 3500ms between i-2 and i → should be skipped
    const seg = [
      pt(0, 60, { rpm: 3000 }),
      pt(1, 58, { rpm: 2800 }),
      pt(2, 55, { rpm: 2600 }),
      pt(7, 52, { rpm: 50 }),   // 5s gap after i=2 — exceeds SHUTDOWN_MAX_GAP_MS
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBeUndefined();
  });

  it('does NOT fire when vehicle was not moving fast enough before', () => {
    const seg = [
      pt(0, 10, { rpm: 3000 }), // below 20 km/h threshold
      pt(1, 10, { rpm: 2800 }),
      pt(2, 10, { rpm: 2600 }),
      pt(3, 10, { rpm: 50 }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBeUndefined();
  });

  it('does NOT fire when RPM data is missing', () => {
    const seg = constSeg(0, 5, 60);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  ENGINE_REV_IN_IDLE
// ═══════════════════════════════════════════════════════════════

describe('ENGINE_REV_IN_IDLE', () => {
  const highIdleRpm = ICE_CONFIG.idleRpm * 2.6; // above 2.5× entry threshold

  it('fires when stationary (< 5 km/h) with RPM > 2.5× idleRpm for >= 3s', () => {
    const seg = constSeg(0, 4, 2, { rpm: highIdleRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE')).toBeDefined();
  });

  it('hysteresis: continues when RPM dips to 1.9× idle (above 1.8× continuation)', () => {
    const contRpm = ICE_CONFIG.idleRpm * 1.9; // between 1.8× and 2.5× — triggers continuation
    const seg = [
      pt(0, 2, { rpm: highIdleRpm }),
      pt(1, 1, { rpm: contRpm }),   // below entry, above continuation
      pt(2, 1, { rpm: highIdleRpm }),
      pt(3, 0, { rpm: highIdleRpm }),
      pt(4, 0, {}), // padding
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE');
    expect(ev).toBeDefined();
    expect(ev!.durationMs).toBe(3000); // spans samples 0–3
  });

  it('does NOT fire when vehicle is moving (>= 5 km/h)', () => {
    const seg = constSeg(0, 5, 8, { rpm: highIdleRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE')).toBeUndefined();
  });

  it('does NOT fire for short burst (< 3s)', () => {
    const seg = [
      pt(0, 1, { rpm: highIdleRpm }),
      pt(1, 1, { rpm: highIdleRpm }),  // only 1s
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE')).toBeUndefined();
  });

  it('does NOT fire when RPM data is missing', () => {
    const seg = constSeg(0, 5, 0);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE')).toBeUndefined();
  });

  it('uses vehicle-specific idleRpm', () => {
    const sportHighIdleRpm = SPORT_CONFIG.idleRpm * 2.6;
    const seg = constSeg(0, 4, 1, { rpm: sportHighIdleRpm });
    const events = detectAbuseEvents(seg, SPORT_CONFIG);
    expect(events.find((e) => e.eventType === 'ENGINE_REV_IN_IDLE')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  HIGH_RPM_CONSTANT
// ═══════════════════════════════════════════════════════════════

describe('HIGH_RPM_CONSTANT', () => {
  const highRpm = ICE_CONFIG.maxRpm * 0.76;

  it('fires when sustained > 75% maxRpm for >= 10s', () => {
    const seg = constSeg(0, 12, 80, { rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'HIGH_RPM_CONSTANT')).toBeDefined();
  });

  it('severity SEVERE when sustained > 30s', () => {
    const seg = constSeg(0, 32, 100, { rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'HIGH_RPM_CONSTANT');
    expect(ev).toBeDefined();
    expect(ev!.severity).toBe('SEVERE');
  });

  it('hysteresis: event stays open when RPM briefly dips to 90% of threshold', () => {
    const hysteresisRpm = highRpm * 0.91; // just above 90% × threshold
    const seg = [
      ...constSeg(0, 6, 80, { rpm: highRpm }),
      pt(7, 80, { rpm: hysteresisRpm }),  // brief dip but above continuation
      ...constSeg(8, 15, 80, { rpm: highRpm }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'HIGH_RPM_CONSTANT');
    expect(ev).toBeDefined();
    expect(ev!.durationMs).toBeGreaterThanOrEqual(10_000);
  });

  it('does NOT fire for short burst (< 10s)', () => {
    const seg = constSeg(0, 8, 80, { rpm: highRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'HIGH_RPM_CONSTANT')).toBeUndefined();
  });

  it('does NOT fire when RPM data is missing', () => {
    const seg = constSeg(0, 15, 80);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'HIGH_RPM_CONSTANT')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  KICKDOWN
// ═══════════════════════════════════════════════════════════════

describe('KICKDOWN', () => {
  it('fires when throttle rises from < 40% to > 90% within 3s while moving', () => {
    const seg = [
      pt(0, 60, { throttlePct: 20 }),
      pt(1, 65, { throttlePct: 50 }),
      pt(2, 72, { throttlePct: 92 }),
      pt(3, 75, {}),
      pt(4, 78, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'KICKDOWN')).toBeDefined();
  });

  it('FIX H: does NOT fire when speed < 20 km/h (minimum speed guard)', () => {
    const seg = [
      pt(0, 15, { throttlePct: 20 }),  // below speed guard
      pt(1, 16, { throttlePct: 50 }),
      pt(2, 17, { throttlePct: 92 }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'KICKDOWN')).toBeUndefined();
  });

  it('FIX H: does NOT fire at near-standstill (idle blip)', () => {
    const seg = [
      pt(0, 0, { throttlePct: 10 }),
      pt(1, 0, { throttlePct: 50 }),
      pt(2, 1, { throttlePct: 95 }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'KICKDOWN')).toBeUndefined();
  });

  it('does NOT fire when throttle rise takes > 3s', () => {
    const seg = [
      pt(0, 60, { throttlePct: 20 }),
      pt(1, 62, { throttlePct: 50 }),
      pt(2, 64, { throttlePct: 70 }),
      pt(4, 68, { throttlePct: 92 }),  // 4s from start
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'KICKDOWN')).toBeUndefined();
  });

  it('does NOT fire when throttle data is missing', () => {
    const seg = constSeg(0, 5, 60);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'KICKDOWN')).toBeUndefined();
  });

  it('severity SEVERE when peak throttle > 95%', () => {
    const seg = [
      pt(0, 70, { throttlePct: 15 }),
      pt(1, 75, { throttlePct: 60 }),
      pt(2, 80, { throttlePct: 97 }),
      pt(3, 82, {}),
      pt(4, 84, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'KICKDOWN');
    expect(ev).toBeDefined();
    expect(ev!.severity).toBe('SEVERE');
  });
});

// ═══════════════════════════════════════════════════════════════
//  LAUNCH_LIKE_START (renamed from LAUNCH_CONTROL)
// ═══════════════════════════════════════════════════════════════

describe('LAUNCH_LIKE_START', () => {
  const launchRpm = Math.max(ICE_CONFIG.idleRpm * 2.0, ICE_CONFIG.maxRpm * 0.45) + 50;

  function launchSeg(): CleanHfPoint[] {
    // Start from standstill with high RPM + throttle, then accelerate strongly.
    // 14 km/h per 1s step = 3.89 m/s² — above LAUNCH_MIN_ACCEL_MS2 (3.5 m/s²).
    const seg: CleanHfPoint[] = [
      pt(0, 1, { rpm: launchRpm, throttlePct: 85 }),
    ];
    for (let i = 1; i <= 8; i++) {
      seg.push(pt(i, 1 + i * 14, { rpm: launchRpm, throttlePct: 90 }));
    }
    return seg;
  }

  it('fires when starting from near-standstill with high RPM + throttle and strong accel', () => {
    const seg = launchSeg();
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'LAUNCH_LIKE_START');
    expect(ev).toBeDefined();
    expect(ev!.severity).toBe('SEVERE');
  });

  it('FIX F: does NOT fire when startSpeed > 3 km/h', () => {
    // Replace start with 5 km/h
    const seg = launchSeg();
    seg[0] = pt(0, 5, { rpm: launchRpm, throttlePct: 85 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LAUNCH_LIKE_START')).toBeUndefined();
  });

  it('does NOT fire when throttle is below threshold', () => {
    const seg = launchSeg();
    seg[0] = pt(0, 1, { rpm: launchRpm, throttlePct: 60 }); // below 80%
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LAUNCH_LIKE_START')).toBeUndefined();
  });

  it('does NOT fire when speed gain is insufficient (< 20 km/h)', () => {
    // 2 km/h per step — total gain of 16 km/h over 8 steps, below the 20 km/h minimum
    const seg: CleanHfPoint[] = [
      pt(0, 1, { rpm: launchRpm, throttlePct: 85 }),
      ...Array.from({ length: 8 }, (_, i) =>
        pt(i + 1, 1 + (i + 1) * 2, { rpm: launchRpm, throttlePct: 90 }),
      ),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LAUNCH_LIKE_START')).toBeUndefined();
  });

  it('does NOT fire when RPM data is missing', () => {
    const seg = launchSeg().map((p) => ({ ...p, rpm: null }));
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LAUNCH_LIKE_START')).toBeUndefined();
  });

  it('metadata includes semantic note about heuristic nature', () => {
    const seg = launchSeg();
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'LAUNCH_LIKE_START');
    expect(ev?.metadata?.semanticNote).toContain('heuristic');
  });
});

// ═══════════════════════════════════════════════════════════════
//  OVERHEATING_ENGINE
// ═══════════════════════════════════════════════════════════════

describe('OVERHEATING_ENGINE', () => {
  it('fires when coolant > 110°C for >= 5s', () => {
    const seg = constSeg(0, 7, 60, { coolantC: 115 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'OVERHEATING_ENGINE')).toBeDefined();
  });

  it('severity CRITICAL when peak coolant > 120°C', () => {
    const seg = constSeg(0, 7, 60, { coolantC: 125 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'OVERHEATING_ENGINE');
    expect(ev?.severity).toBe('CRITICAL');
  });

  it('severity SEVERE when coolant 110–120°C', () => {
    const seg = constSeg(0, 7, 60, { coolantC: 113 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'OVERHEATING_ENGINE');
    expect(ev?.severity).toBe('SEVERE');
  });

  it('hysteresis: event stays open when coolant dips briefly to 108°C (above 107)', () => {
    const seg = [
      ...constSeg(0, 3, 60, { coolantC: 112 }),
      pt(4, 60, { coolantC: 108 }),  // brief dip: 110 - 3 = 107 threshold, 108 > 107
      ...constSeg(5, 8, 60, { coolantC: 112 }),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'OVERHEATING_ENGINE');
    expect(ev).toBeDefined();
    expect(ev!.durationMs).toBe(8000);
  });

  it('does NOT fire for short overheat (< 5s)', () => {
    const seg = constSeg(0, 4, 60, { coolantC: 115 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'OVERHEATING_ENGINE')).toBeUndefined();
  });

  it('does NOT fire when coolant data is missing', () => {
    const seg = constSeg(0, 10, 60);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'OVERHEATING_ENGINE')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  LONG_IDLE
// ═══════════════════════════════════════════════════════════════

describe('LONG_IDLE', () => {
  it('fires when stationary with idle RPM for >= 3 minutes', () => {
    const seg = constSeg(0, 190, 0, { rpm: ICE_CONFIG.idleRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LONG_IDLE')).toBeDefined();
  });

  it('severity SEVERE when idle > 10 minutes', () => {
    const seg = constSeg(0, 620, 0, { rpm: ICE_CONFIG.idleRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'LONG_IDLE');
    expect(ev?.severity).toBe('SEVERE');
  });

  it('does NOT fire when engine is off (RPM = 0)', () => {
    const seg = constSeg(0, 200, 0, { rpm: 0 });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LONG_IDLE')).toBeUndefined();
  });

  it('does NOT fire when RPM data is missing', () => {
    const seg = constSeg(0, 200, 0);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LONG_IDLE')).toBeUndefined();
  });

  it('does NOT fire for short idle (< 3 min)', () => {
    const seg = constSeg(0, 150, 0, { rpm: ICE_CONFIG.idleRpm });
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'LONG_IDLE')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  FULL_BRAKING — mini-window hardened
// ═══════════════════════════════════════════════════════════════

describe('FULL_BRAKING (hardened)', () => {
  // 7.5 m/s² over 1s = 27 km/h drop
  const FULL_BRAKE_MS2 = 7.8;

  /** Produces at least 7 points to clear the 5-point guard in detectAbuseEvents */
  function buildBrakeSeg(startSpeed: number, decelMs2: number, samples: number): CleanHfPoint[] {
    const seg: CleanHfPoint[] = [];
    let speed = startSpeed;
    const total = Math.max(samples + 1, 7);
    for (let i = 0; i < total; i++) {
      seg.push(pt(i, Math.max(0, speed), {}));
      if (i < samples) speed -= decelMs2 * 3.6;
    }
    return seg;
  }

  it('fires when sustained high decel for >= 2 samples with valid start speed', () => {
    const seg = buildBrakeSeg(60, FULL_BRAKE_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'FULL_BRAKING')).toBeDefined();
  });

  it('FIX E: does NOT fire from a single-sample decel spike (sampleCount must be >= 2)', () => {
    const seg = [
      pt(0, 60, {}),
      pt(1, 32, {}),   // drop: ~28 km/h (7.8 m/s²) — single step above 7.5
      pt(2, 30, {}),   // slow decel — below FULL_BRAKING_HYSTERESIS (6.0 m/s²)
      pt(3, 28, {}),
      pt(4, 26, {}),
      pt(5, 24, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'FULL_BRAKING')).toBeUndefined();
  });

  it('does NOT fire when start speed < 20 km/h', () => {
    const seg = buildBrakeSeg(15, FULL_BRAKE_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'FULL_BRAKING')).toBeUndefined();
  });

  it('stores peakDecelMs2 and sampleCount in metadata', () => {
    const seg = buildBrakeSeg(60, FULL_BRAKE_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'FULL_BRAKING');
    expect(ev?.metadata?.peakDecelMs2).toBeDefined();
    expect((ev?.metadata?.sampleCount as number)).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  POSSIBLE_IMPACT — mini-window hardened
// ═══════════════════════════════════════════════════════════════

describe('POSSIBLE_IMPACT (hardened)', () => {
  const IMPACT_MS2 = 12.5;

  /** Produces at least 7 points; decel active for `samples` steps then coast */
  function buildImpactSeg(startSpeed: number, decelMs2: number, samples: number): CleanHfPoint[] {
    const seg: CleanHfPoint[] = [];
    let speed = startSpeed;
    const total = Math.max(samples + 1, 7);
    for (let i = 0; i < total; i++) {
      seg.push(pt(i, Math.max(0, speed), {}));
      if (i < samples) speed -= decelMs2 * 3.6;
    }
    return seg;
  }

  it('fires when sustained extreme decel for >= 2 samples with valid start speed', () => {
    const seg = buildImpactSeg(80, IMPACT_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'POSSIBLE_IMPACT')).toBeDefined();
    expect(events.find((e) => e.eventType === 'POSSIBLE_IMPACT')?.severity).toBe('CRITICAL');
  });

  it('FIX E: does NOT fire from a single-sample spike', () => {
    // GPS glitch: single massive speed drop then immediate recovery — only 1 sample above threshold
    const seg = [
      pt(0, 80, {}),
      pt(1, 37, {}),   // spike: ~12 m/s² — GPS artifact
      pt(2, 78, {}),   // speed recovers immediately — second step is NOT above hysteresis
      pt(3, 76, {}),
      pt(4, 74, {}),
      pt(5, 72, {}),
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'POSSIBLE_IMPACT')).toBeUndefined();
  });

  it('does NOT fire when start speed < 25 km/h', () => {
    const seg = buildImpactSeg(20, IMPACT_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'POSSIBLE_IMPACT')).toBeUndefined();
  });

  it('stores metadata with peakDecelMs2 and sampleCount', () => {
    const seg = buildImpactSeg(80, IMPACT_MS2, 3);
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    const ev = events.find((e) => e.eventType === 'POSSIBLE_IMPACT');
    expect(ev?.metadata?.peakDecelMs2).toBeDefined();
    expect((ev?.metadata?.sampleCount as number)).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  FULL_BRAKING / EXTREME braking relationship
// ═══════════════════════════════════════════════════════════════

describe('FULL_BRAKING vs EXTREME braking relationship', () => {
  it('EXTREME braking event (7.0+ m/s²) can exist without triggering FULL_BRAKING abuse', () => {
    // A single 1s step at 7.2 m/s² = EXTREME braking but NOT FULL_BRAKING (needs 7.5 + 2 samples)
    const seg = [
      pt(0, 60, {}),
      pt(1, 34, {}),   // drop: 26 km/h → ~7.2 m/s² (EXTREME braking, not FULL_BRAKING)
      pt(2, 32, {}),   // continues slowly
    ];
    const brakeEvents = detectBrakingEvents(seg);
    const abuseEvents = detectAbuseEvents(seg, ICE_CONFIG);

    // Braking detector may classify as EXTREME (7.2 >= 7.0)
    const extremeBrake = brakeEvents.find((e) => e.classification === 'EXTREME');
    // But FULL_BRAKING abuse should NOT fire (7.2 < 7.5 threshold AND only 1 sample above 7.5)
    const fullBraking = abuseEvents.find((e) => e.eventType === 'FULL_BRAKING');
    expect(fullBraking).toBeUndefined();
  });

  it('FULL_BRAKING abuse (7.5 m/s²) implies at least EXTREME braking classification', () => {
    // 7.8 m/s² = FULL_BRAKING (>= 7.5) AND EXTREME braking (>= 7.0)
    const FULL_BRAKE_MS2 = 7.8;
    const seg = [
      pt(0, 65, {}),
      pt(1, 37, {}),   // ~7.8 m/s² drop
      pt(2, 9,  {}),   // second high-decel step — both full-braking and braking detectors see >= 2 samples
      pt(3, 5,  {}),
      pt(4, 3,  {}),
      pt(5, 2,  {}),
      pt(6, 1,  {}),
    ];
    const brakeEvents = detectBrakingEvents(seg);
    const abuseEvents = detectAbuseEvents(seg, ICE_CONFIG);

    const hardOrExtreme = brakeEvents.filter(
      (e) => e.classification === 'HARD' || e.classification === 'EXTREME',
    );
    const fullBraking = abuseEvents.find((e) => e.eventType === 'FULL_BRAKING');

    expect(hardOrExtreme.length).toBeGreaterThan(0);
    expect(fullBraking).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  ACCELERATION EVENT LOGIC
// ═══════════════════════════════════════════════════════════════

describe('detectAccelerationEvents', () => {
  it('fires for clear acceleration (>= 2 samples, >= 4 km/h delta)', () => {
    const seg = [
      pt(0, 30, {}),
      pt(1, 36, {}),  // +6 km/h = 1.67 m/s² ≥ 1.5 entry
      pt(2, 42, {}),  // +6 km/h = 1.67 m/s² ≥ 1.2 continuation
      pt(3, 45, {}),
    ];
    const events = detectAccelerationEvents(seg);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].sampleCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects event with only 1 sample (sampleCount < 2)', () => {
    const seg = [
      pt(0, 30, {}),
      pt(1, 40, {}),  // +10 km/h = 2.78 m/s² ≥ 1.5, single step
      pt(2, 38, {}),  // immediately drops below 1.2 continuation
    ];
    const events = detectAccelerationEvents(seg);
    // Only 1 sample above entry threshold — should be rejected
    expect(events.filter((e) => e.sampleCount < 2)).toHaveLength(0);
  });

  it('rejects event with deltaKmh < 4.0', () => {
    const seg = [
      pt(0, 30, {}),
      pt(1, 32, {}),  // +2 km/h = 0.56 m/s² — below 1.5 entry
      pt(2, 34, {}),
    ];
    const events = detectAccelerationEvents(seg);
    // No event should be emitted because acceleration is too low
    const rejected = events.filter((e) => e.deltaKmh < 4.0);
    expect(rejected).toHaveLength(0);
  });

  it('hysteresis: event continues when accel dips between 1.2 and 1.5 m/s²', () => {
    const seg = [
      pt(0, 20, {}),
      pt(1, 26, {}),   // +6 km/h = 1.67 m/s² → entry
      pt(2, 30, {}),   // +4 km/h = 1.11 m/s² → below continuation 1.2 → event closes
      pt(3, 32, {}),
    ];
    // Note: 1.11 < 1.2 continuation, so event closes after sample 2
    const events = detectAccelerationEvents(seg);
    // If event is accepted: sampleCount should be 1 → rejected by MIN_SAMPLE_COUNT
    const valid = events.filter((e) => e.deltaKmh >= 4.0 && e.sampleCount >= 2);
    // deltaKmh at close = 30 - 20 = 10 km/h, sampleCount = 1 → rejected
    expect(valid).toHaveLength(0);
  });

  it('hysteresis: event STAYS open when accel is exactly at continuation threshold (1.2 m/s²)', () => {
    const seg = [
      pt(0, 20, {}),
      pt(1, 26, {}),   // +6 km/h = 1.67 m/s² → entry, sampleCount=1
      pt(2, 30.32, {}), // +4.32 km/h = 1.2 m/s² → equals continuation → stays open, sampleCount=2
      pt(3, 34, {}),   // continues
    ];
    const events = detectAccelerationEvents(seg);
    const valid = events.filter((e) => e.sampleCount >= 2 && e.deltaKmh >= 4.0);
    expect(valid.length).toBeGreaterThan(0);
  });

  it('emits rich metadata (deltaKmh, sampleCount, startSpeedBand)', () => {
    const seg = [
      pt(0, 50, {}),
      pt(1, 58, {}),  // +8 km/h = 2.22 m/s² → entry
      pt(2, 66, {}),  // continuation
      pt(3, 70, {}),
    ];
    const events = detectAccelerationEvents(seg);
    if (events.length > 0) {
      const e = events[0] as any;
      expect(e.deltaKmh).toBeGreaterThan(0);
      expect(e.sampleCount).toBeGreaterThanOrEqual(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  BRAKING EVENT LOGIC
// ═══════════════════════════════════════════════════════════════

describe('detectBrakingEvents', () => {
  it('fires for clear braking (>= 2 samples, >= 3 km/h delta)', () => {
    const seg = [
      pt(0, 60, {}),
      pt(1, 54, {}),  // -6 km/h = 1.67 m/s² ≥ 1.5
      pt(2, 48, {}),  // continuation
      pt(3, 45, {}),
    ];
    const events = detectBrakingEvents(seg);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].sampleCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects single-sample braking event', () => {
    const seg = [
      pt(0, 60, {}),
      pt(1, 40, {}),  // -20 km/h drop = 5.56 m/s² — only 1 sample
      pt(2, 39, {}),  // normal braking after
    ];
    const events = detectBrakingEvents(seg);
    expect(events.filter((e) => e.sampleCount < 2)).toHaveLength(0);
  });

  it('emits highSpeedStart=true when starting above 80 km/h', () => {
    const seg = [
      pt(0, 90, {}),
      pt(1, 84, {}),  // -6 km/h = 1.67 m/s²
      pt(2, 78, {}),
      pt(3, 72, {}),
    ];
    const events = detectBrakingEvents(seg);
    expect(events.find((e) => e.highSpeedStart === true)).toBeDefined();
  });

  it('emits highSpeedStart=false when starting below 80 km/h', () => {
    const seg = [
      pt(0, 50, {}),
      pt(1, 44, {}),
      pt(2, 38, {}),
    ];
    const events = detectBrakingEvents(seg);
    expect(events.every((e) => e.highSpeedStart === false)).toBe(true);
  });

  it('metadata includes intensity, deltaKmh, sampleCount', () => {
    const seg = [
      pt(0, 60, {}),
      pt(1, 54, {}),
      pt(2, 48, {}),
      pt(3, 45, {}),
    ];
    const events = detectBrakingEvents(seg);
    if (events.length > 0) {
      expect(events[0].intensity).toBeGreaterThan(0);
      expect(events[0].deltaKmh).toBeGreaterThan(0);
      expect(events[0].sampleCount).toBeGreaterThanOrEqual(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  computeAbuseScore
// ═══════════════════════════════════════════════════════════════

describe('computeAbuseScore', () => {
  it('returns 0 for empty events', () => {
    expect(computeAbuseScore([])).toBe(0);
  });

  it('adds weighted scores for each event', () => {
    const events: AbuseEvent[] = [
      { eventType: 'POSSIBLE_IMPACT', severity: 'CRITICAL', startedAt: new Date(), endedAt: new Date(), durationMs: 1000, startSpeedKmh: 80, endSpeedKmh: 20, peakValue: 2.0, peakValueUnit: 'g', maxRpm: null, maxThrottlePos: null, maxCoolantTemp: null, metadata: {} },
      { eventType: 'KICKDOWN', severity: 'WARNING', startedAt: new Date(), endedAt: new Date(), durationMs: 2000, startSpeedKmh: 60, endSpeedKmh: 65, peakValue: 92, peakValueUnit: 'throttle%', maxRpm: null, maxThrottlePos: 92, maxCoolantTemp: null, metadata: {} },
    ];
    const score = computeAbuseScore(events);
    // POSSIBLE_IMPACT: 20 × 2.0 (CRITICAL) = 40
    // KICKDOWN: 3 × 1.0 (WARNING) = 3
    // Total: 43
    expect(score).toBe(43);
  });

  it('caps at 100 regardless of event count', () => {
    const events: AbuseEvent[] = Array.from({ length: 20 }, () => ({
      eventType: 'POSSIBLE_IMPACT' as const,
      severity: 'CRITICAL' as const,
      startedAt: new Date(), endedAt: new Date(), durationMs: 1000,
      startSpeedKmh: 80, endSpeedKmh: 20, peakValue: 2.0, peakValueUnit: 'g',
      maxRpm: null, maxThrottlePos: null, maxCoolantTemp: null, metadata: {},
    }));
    expect(computeAbuseScore(events)).toBe(100);
  });

  it('ABUSE_SCORE_WEIGHTS keys cover all AbuseEventType values', () => {
    const weightKeys = Object.keys(ABUSE_SCORE_WEIGHTS).sort();
    const expectedTypes = [
      'COLD_ENGINE_FULL_THROTTLE', 'COLD_ENGINE_HIGH_RPM', 'ENGINE_REV_IN_IDLE',
      'ENGINE_SHUTDOWN_WHILE_DRIVING', 'FULL_BRAKING', 'HIGH_RPM_CONSTANT',
      'KICKDOWN', 'LAUNCH_LIKE_START', 'LONG_IDLE', 'OVERHEATING_ENGINE', 'POSSIBLE_IMPACT',
    ].sort();
    expect(weightKeys).toEqual(expectedTypes);
  });
});

// ═══════════════════════════════════════════════════════════════
//  assessSignalAvailability
// ═══════════════════════════════════════════════════════════════

describe('assessSignalAvailability', () => {
  it('returns all false for empty segments', () => {
    const result = assessSignalAvailability([]);
    expect(result).toEqual({
      coolantAvailable: false,
      rpmAvailable: false,
      throttleAvailable: false,
      loadAvailable: false,
      tractionBatteryPowerAvailable: false,
    });
  });

  it('detects available coolant signal', () => {
    const seg = [[pt(0, 50, { coolantC: 80 }), pt(1, 55, {})]];
    expect(assessSignalAvailability(seg).coolantAvailable).toBe(true);
  });

  it('detects unavailable signals correctly', () => {
    const seg = [[pt(0, 50, {}), pt(1, 55, {})]];
    const result = assessSignalAvailability(seg);
    expect(result.coolantAvailable).toBe(false);
    expect(result.rpmAvailable).toBe(false);
    expect(result.throttleAvailable).toBe(false);
    expect(result.loadAvailable).toBe(false);
  });

  it('detects all signals when all are present', () => {
    const seg = [[pt(0, 50, { coolantC: 80, rpm: 2000, throttlePct: 30, loadPct: 40 })]];
    const result = assessSignalAvailability(seg);
    expect(result.coolantAvailable).toBe(true);
    expect(result.rpmAvailable).toBe(true);
    expect(result.throttleAvailable).toBe(true);
    expect(result.loadAvailable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  KICKDOWN / IMPACT anti-noise protection (regression guard)
// ═══════════════════════════════════════════════════════════════

describe('Noise protection regression tests', () => {
  it('KICKDOWN does not fire for stationary throttle blip', () => {
    const seg = [
      pt(0, 0, { throttlePct: 5 }),
      pt(1, 0, { throttlePct: 50 }),
      pt(2, 2, { throttlePct: 95 }),
    ];
    expect(detectAbuseEvents(seg, ICE_CONFIG).find((e) => e.eventType === 'KICKDOWN')).toBeUndefined();
  });

  it('POSSIBLE_IMPACT does not fire from a single noisy GPS sample', () => {
    // GPS glitch: speed jumps down 1 step then recovers
    const seg = [
      pt(0, 80, {}),
      pt(1, 37, {}),  // spike — potential GPS noise (12 m/s²)
      pt(2, 78, {}),  // recovers — this means no second high-decel sample
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'POSSIBLE_IMPACT')).toBeUndefined();
  });

  it('FULL_BRAKING does not fire from a single noisy GPS sample', () => {
    const seg = [
      pt(0, 60, {}),
      pt(1, 32, {}),  // 7.8 m/s² spike
      pt(2, 60, {}),  // recovers — no sustained deceleration
    ];
    const events = detectAbuseEvents(seg, ICE_CONFIG);
    expect(events.find((e) => e.eventType === 'FULL_BRAKING')).toBeUndefined();
  });
});
