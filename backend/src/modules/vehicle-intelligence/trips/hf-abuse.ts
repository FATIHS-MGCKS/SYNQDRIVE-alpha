import type { CleanHfPoint } from './hf-preprocessing';

// ═══════════════════════════════════════════════════════════════
//  PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════

export type AbuseEventType =
  | 'COLD_ENGINE_HIGH_RPM'
  | 'COLD_ENGINE_FULL_THROTTLE'
  | 'ENGINE_SHUTDOWN_WHILE_DRIVING'
  | 'ENGINE_REV_IN_IDLE'
  | 'HIGH_RPM_CONSTANT'
  | 'KICKDOWN'
  | 'LAUNCH_LIKE_START'   // renamed from LAUNCH_CONTROL for semantic accuracy
  | 'OVERHEATING_ENGINE'
  | 'LONG_IDLE'
  | 'POSSIBLE_IMPACT'
  | 'FULL_BRAKING';

/**
 * @deprecated Kept for backward compatibility. Use 'LAUNCH_LIKE_START' in all new code.
 * LAUNCH_CONTROL was the V1 name. It was renamed to LAUNCH_LIKE_START (v2.4) to reflect
 * that this is a heuristic start-from-standstill detector, NOT proof that OEM launch-control
 * mode was engaged.
 */
export const LAUNCH_CONTROL_LEGACY_TYPE = 'LAUNCH_CONTROL' as const;

export type AbuseSeverity = 'WARNING' | 'SEVERE' | 'CRITICAL';

export interface AbuseEvent {
  eventType: AbuseEventType;
  severity: AbuseSeverity;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  maxRpm: number | null;
  maxThrottlePos: number | null;
  maxCoolantTemp: number | null;
  metadata: Record<string, unknown>;
}

export interface VehicleRpmConfig {
  idleRpm: number;
  maxRpm: number;
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_RPM_CONFIG: VehicleRpmConfig = { idleRpm: 800, maxRpm: 6500 };

const COLD_TEMP_C = 60;
const OVERHEAT_TEMP_C = 110;
const OVERHEAT_HYSTERESIS_C = 3;   // engine stays "hot" while above 107°C

const LONG_IDLE_THRESHOLD_MS = 180_000;    // 3 min
const HIGH_RPM_SUSTAINED_MS = 10_000;      // 10 s

// FULL_BRAKING / POSSIBLE_IMPACT thresholds (m/s²)
// IMPORTANT: These are stricter ABUSE thresholds — different from braking classification.
//   EXTREME braking (hf-braking.ts):  >= 7.0 m/s²  — braking intensity label
//   FULL_BRAKING abuse:               >= 7.5 m/s²  — severe braking event (sampleCount >=2)
//   POSSIBLE_IMPACT abuse:            >= 12.0 m/s² — abrupt deceleration event (sampleCount >= 2)
const FULL_BRAKING_MS2 = 7.5;
const FULL_BRAKING_HYSTERESIS_MS2 = 6.0;
const FULL_BRAKING_MIN_START_SPEED_KMH = 20;
const FULL_BRAKING_MIN_SAMPLE_COUNT = 2;
const FULL_BRAKING_MIN_DELTA_KMH = 6.0;

const IMPACT_MS2 = 12.0;
const IMPACT_HYSTERESIS_MS2 = 9.0;
const IMPACT_MIN_START_SPEED_KMH = 25;
const IMPACT_MIN_SAMPLE_COUNT = 2;
const IMPACT_MIN_DELTA_KMH = 3.0;   // at this decel level, even 3 km/h collapse is severe

const G = 9.81;

// KICKDOWN
const KICKDOWN_PREV_THROTTLE_MAX = 40;    // < 40% before
const KICKDOWN_ENTRY_THROTTLE_MIN = 90;   // > 90% after
const KICKDOWN_TIME_WINDOW_S = 3;
const KICKDOWN_MIN_SPEED_KMH = 20;        // must be in motion — no idle blips (Fix H)

// LAUNCH_LIKE_START
const LAUNCH_MAX_START_SPEED_KMH = 3;     // near standstill only (Fix F — was < 8)
const LAUNCH_MIN_THROTTLE_PCT = 80;
const LAUNCH_MIN_ACCEL_MS2 = 3.5;         // minimum peak acceleration in the window
const LAUNCH_MIN_SPEED_GAIN_KMH = 20;

// ENGINE_SHUTDOWN_WHILE_DRIVING — temporal safety guard
const SHUTDOWN_MAX_GAP_MS = 3500;         // max allowed gap between reference points (Fix G)
const SHUTDOWN_PREV_RPM_MIN = 500;
const SHUTDOWN_AFTER_RPM_MAX = 100;
const SHUTDOWN_BEFORE_SPEED_KMH = 20;
const SHUTDOWN_AFTER_SPEED_KMH = 10;

// ═══════════════════════════════════════════════════════════════
//  HELPER: derived RPM thresholds
// ═══════════════════════════════════════════════════════════════

function rpm(cfg: VehicleRpmConfig) {
  return {
    highRpmThreshold: cfg.maxRpm * 0.75,
    veryHighRpmThreshold: cfg.maxRpm * 0.85,
    highRpmContinuation: cfg.maxRpm * 0.75, // same as entry for HIGH_RPM_CONSTANT
    highRpmConstantHysteresis: cfg.maxRpm * 0.75 * 0.9, // 90% — stay open during brief dips
    aboveIdleRevEntry: cfg.idleRpm * 2.5,
    aboveIdleRevContinuation: cfg.idleRpm * 1.8, // intentional hysteresis
    launchRpmEntry: Math.max(cfg.idleRpm * 2.0, cfg.maxRpm * 0.45),
  };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Detect all abuse events from a cleaned, contiguous HF time-series segment.
 *
 * NOTE on signal availability:
 *   - COLD_ENGINE_HIGH_RPM / COLD_ENGINE_FULL_THROTTLE: require coolant ECT data.
 *     If coolant is unavailable, these detectors are NOT evaluable and silently produce
 *     no events — this is documented in the behaviorSummaryJson.
 *   - ENGINE_REV_IN_IDLE / HIGH_RPM_CONSTANT / LAUNCH_LIKE_START: require RPM data.
 *   - KICKDOWN: requires throttle data.
 *   - OVERHEATING_ENGINE: requires coolant ECT data.
 *   - LONG_IDLE: requires RPM data.
 *   - ENGINE_SHUTDOWN_WHILE_DRIVING: requires RPM data.
 *
 * FULL_BRAKING and POSSIBLE_IMPACT only require speed data (always present).
 */
export function detectAbuseEvents(
  segment: CleanHfPoint[],
  rpmConfig?: Partial<VehicleRpmConfig>,
): AbuseEvent[] {
  if (segment.length < 5) return [];

  const cfg: VehicleRpmConfig = {
    idleRpm: rpmConfig?.idleRpm ?? DEFAULT_RPM_CONFIG.idleRpm,
    maxRpm: rpmConfig?.maxRpm ?? DEFAULT_RPM_CONFIG.maxRpm,
  };
  const t = rpm(cfg);

  const events: AbuseEvent[] = [];

  events.push(...detectColdEngineHighRpm(segment, cfg, t));
  events.push(...detectColdEngineFullThrottle(segment));
  events.push(...detectEngineShutdownWhileDriving(segment));
  events.push(...detectEngineRevInIdle(segment, cfg, t));
  events.push(...detectHighRpmConstant(segment, t));
  events.push(...detectKickdown(segment));
  events.push(...detectLaunchLikeStart(segment, cfg, t));
  events.push(...detectOverheatingEngine(segment));
  events.push(...detectLongIdle(segment, cfg));
  events.push(...deduplicateBrakingAndImpact(detectFullBrakingAndImpact(segment)));

  return events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: COLD_ENGINE_HIGH_RPM
// ═══════════════════════════════════════════════════════════════

/**
 * High RPM (> 75% maxRpm) while coolant temperature is below the warm threshold (60°C).
 *
 * Entry:    rpm > highRpmThreshold (75% maxRpm) AND coolant < 60°C
 * Continue: rpm > highRpmThreshold AND coolant < 60°C
 * Accept:   duration >= 2s
 *
 * maxCoolantTemp stores the MAXIMUM coolant temp observed over the event window
 * (not just the start value — fixed from V1 which stored only the start).
 *
 * Silently produces no events if coolant data is unavailable (check coolantAvailable).
 */
function detectColdEngineHighRpm(
  seg: CleanHfPoint[], cfg: VehicleRpmConfig,
  t: ReturnType<typeof rpm>,
): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (
      seg[i].coolantC != null && seg[i].coolantC! < COLD_TEMP_C &&
      seg[i].rpm != null && seg[i].rpm! > t.highRpmThreshold
    ) {
      const start = i;
      while (
        i < seg.length - 1 &&
        seg[i + 1].coolantC != null && seg[i + 1].coolantC! < COLD_TEMP_C &&
        seg[i + 1].rpm != null && seg[i + 1].rpm! > t.highRpmThreshold
      ) { i++; }

      const dur = seg[i].ts - seg[start].ts;
      if (dur >= 2000) {
        const slice = seg.slice(start, i + 1);
        const maxR = Math.max(...slice.map((p) => p.rpm ?? 0));
        const maxC = Math.max(...slice.filter((p) => p.coolantC != null).map((p) => p.coolantC!));
        events.push({
          eventType: 'COLD_ENGINE_HIGH_RPM',
          severity: maxR > t.veryHighRpmThreshold ? 'SEVERE' : 'WARNING',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: seg[start].speedKmh, endSpeedKmh: seg[i].speedKmh,
          peakValue: maxR, peakValueUnit: 'rpm',
          maxRpm: maxR, maxThrottlePos: null,
          maxCoolantTemp: maxC,  // max over event, not just start value
          metadata: {
            startCoolantC: seg[start].coolantC,
            maxCoolantC: maxC,
            maxRpmPct: Math.round(maxR / cfg.maxRpm * 100),
          },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: COLD_ENGINE_FULL_THROTTLE
// ═══════════════════════════════════════════════════════════════

/**
 * Full throttle application while the engine is cold (coolant < 60°C).
 *
 * Entry threshold:    throttle > 85% (strict entry)
 * Continue threshold: throttle > 80% (intentional hysteresis — prevents fragmentation
 *                     when throttle briefly dips to ~82% mid-event)
 * Accept: duration >= 1.5s
 *
 * Silently produces no events if coolant data is unavailable.
 */
function detectColdEngineFullThrottle(seg: CleanHfPoint[]): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (
      seg[i].coolantC != null && seg[i].coolantC! < COLD_TEMP_C &&
      seg[i].throttlePct != null && seg[i].throttlePct! > 85
    ) {
      const start = i;
      while (
        i < seg.length - 1 &&
        seg[i + 1].coolantC != null && seg[i + 1].coolantC! < COLD_TEMP_C &&
        seg[i + 1].throttlePct != null && seg[i + 1].throttlePct! > 80  // hysteresis
      ) { i++; }

      const dur = seg[i].ts - seg[start].ts;
      if (dur >= 1500) {
        const slice = seg.slice(start, i + 1);
        const maxThr = Math.max(...slice.map((p) => p.throttlePct ?? 0));
        const maxC = Math.max(...slice.filter((p) => p.coolantC != null).map((p) => p.coolantC!));
        events.push({
          eventType: 'COLD_ENGINE_FULL_THROTTLE',
          severity: maxThr > 95 ? 'SEVERE' : 'WARNING',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: seg[start].speedKmh, endSpeedKmh: seg[i].speedKmh,
          peakValue: maxThr, peakValueUnit: 'throttle%',
          maxRpm: null, maxThrottlePos: maxThr,
          maxCoolantTemp: maxC,
          metadata: { startCoolantC: seg[start].coolantC, maxCoolantC: maxC },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: ENGINE_SHUTDOWN_WHILE_DRIVING
// ═══════════════════════════════════════════════════════════════

/**
 * Detects an RPM drop from > 500 to < 100 while the vehicle is still moving at speed.
 *
 * Fix G: index-based lookup replaced with explicit temporal proximity guard.
 * The two reference points must be within SHUTDOWN_MAX_GAP_MS (3.5s) of each other
 * to prevent false positives from sparse or gapped HF windows.
 *
 * Requires RPM data — silently produces no events otherwise.
 */
function detectEngineShutdownWhileDriving(seg: CleanHfPoint[]): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 3; i < seg.length; i++) {
    // Temporal safety: the two comparison points must be close in time
    const gapMs = seg[i].ts - seg[i - 2].ts;
    if (gapMs > SHUTDOWN_MAX_GAP_MS) continue;

    const wasMoving =
      seg[i - 3].speedKmh > SHUTDOWN_BEFORE_SPEED_KMH &&
      seg[i - 2].speedKmh > SHUTDOWN_BEFORE_SPEED_KMH;
    const rpmDied =
      seg[i - 2].rpm != null && seg[i - 2].rpm! > SHUTDOWN_PREV_RPM_MIN &&
      seg[i].rpm != null && seg[i].rpm! < SHUTDOWN_AFTER_RPM_MAX;
    const stillSpeed = seg[i].speedKmh > SHUTDOWN_AFTER_SPEED_KMH;

    if (wasMoving && rpmDied && stillSpeed) {
      events.push({
        eventType: 'ENGINE_SHUTDOWN_WHILE_DRIVING',
        severity: 'CRITICAL',
        startedAt: new Date(seg[i - 2].ts), endedAt: new Date(seg[i].ts),
        durationMs: seg[i].ts - seg[i - 2].ts,
        startSpeedKmh: seg[i - 2].speedKmh, endSpeedKmh: seg[i].speedKmh,
        peakValue: seg[i - 2].rpm, peakValueUnit: 'rpm_before',
        maxRpm: seg[i - 2].rpm, maxThrottlePos: null, maxCoolantTemp: null,
        metadata: {
          speedAtShutdown: seg[i].speedKmh,
          rpmBefore: seg[i - 2].rpm,
          gapMs,
        },
      });
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: ENGINE_REV_IN_IDLE
// ═══════════════════════════════════════════════════════════════

/**
 * High RPM while effectively stationary (speed < 5 km/h).
 *
 * Entry:    rpm > 2.5 × idleRpm  (aboveIdleRevEntry)
 * Continue: rpm > 1.8 × idleRpm  (intentional hysteresis — allows brief dips without
 *           fragmenting an event where the driver is bouncing the throttle)
 * Accept:   duration >= 3s
 *
 * Requires RPM data — silently produces no events otherwise.
 */
function detectEngineRevInIdle(
  seg: CleanHfPoint[], cfg: VehicleRpmConfig,
  t: ReturnType<typeof rpm>,
): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i].speedKmh < 5 && seg[i].rpm != null && seg[i].rpm! > t.aboveIdleRevEntry) {
      const start = i;
      while (
        i < seg.length - 1 &&
        seg[i + 1].speedKmh < 5 &&
        seg[i + 1].rpm != null && seg[i + 1].rpm! > t.aboveIdleRevContinuation
      ) { i++; }

      const dur = seg[i].ts - seg[start].ts;
      if (dur >= 3000) {
        const maxR = Math.max(...seg.slice(start, i + 1).map((p) => p.rpm ?? 0));
        events.push({
          eventType: 'ENGINE_REV_IN_IDLE',
          severity: maxR > t.veryHighRpmThreshold ? 'SEVERE' : 'WARNING',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: seg[start].speedKmh, endSpeedKmh: seg[i].speedKmh,
          peakValue: maxR, peakValueUnit: 'rpm',
          maxRpm: maxR, maxThrottlePos: null, maxCoolantTemp: null,
          metadata: {
            idleRpmVehicle: cfg.idleRpm,
            entryThreshold: t.aboveIdleRevEntry,
            continuationThreshold: t.aboveIdleRevContinuation,
          },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: HIGH_RPM_CONSTANT
// ═══════════════════════════════════════════════════════════════

/**
 * Sustained high RPM (> 75% maxRpm) for >= 10 seconds.
 *
 * Entry:    rpm > 75% maxRpm
 * Continue: rpm > 67.5% maxRpm (75% × 0.9 — intentional hysteresis)
 * Accept:   duration >= HIGH_RPM_SUSTAINED_MS (10s)
 *
 * Requires RPM data — silently produces no events otherwise.
 */
function detectHighRpmConstant(
  seg: CleanHfPoint[],
  t: ReturnType<typeof rpm>,
): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i].rpm != null && seg[i].rpm! > t.highRpmThreshold) {
      const start = i;
      while (
        i < seg.length - 1 &&
        seg[i + 1].rpm != null &&
        seg[i + 1].rpm! > t.highRpmConstantHysteresis  // 90% of highRpmThreshold
      ) { i++; }

      const dur = seg[i].ts - seg[start].ts;
      if (dur >= HIGH_RPM_SUSTAINED_MS) {
        const maxR = Math.max(...seg.slice(start, i + 1).map((p) => p.rpm ?? 0));
        events.push({
          eventType: 'HIGH_RPM_CONSTANT',
          severity: dur > 30_000 ? 'SEVERE' : 'WARNING',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: seg[start].speedKmh, endSpeedKmh: seg[i].speedKmh,
          peakValue: maxR, peakValueUnit: 'rpm',
          maxRpm: maxR, maxThrottlePos: null, maxCoolantTemp: null,
          metadata: {
            sustainedSeconds: Math.round(dur / 1000),
            entryThreshold: t.highRpmThreshold,
            continuationThreshold: t.highRpmConstantHysteresis,
          },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: KICKDOWN
// ═══════════════════════════════════════════════════════════════

/**
 * Rapid full-pedal demand: throttle rises from < 40% to > 90% within 3 seconds.
 *
 * Fix H: minimum speed guard added (speed > 20 km/h).
 * Throttle blips while stationary or creeping are NOT kickdown — they are
 * irrelevant idle behavior. Kickdown specifically reflects in-motion
 * aggressive power demand.
 *
 * Requires throttle data — silently produces no events otherwise.
 */
function detectKickdown(seg: CleanHfPoint[]): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 2; i < seg.length; i++) {
    const prevThr = seg[i - 2].throttlePct;
    const curThr = seg[i].throttlePct;
    if (prevThr == null || curThr == null) continue;
    if (prevThr >= KICKDOWN_PREV_THROTTLE_MAX) continue;
    if (curThr <= KICKDOWN_ENTRY_THROTTLE_MIN) continue;

    const dt = (seg[i].ts - seg[i - 2].ts) / 1000;
    if (dt > KICKDOWN_TIME_WINDOW_S) continue;

    // Minimum speed guard — must be in motion
    if (seg[i - 2].speedKmh <= KICKDOWN_MIN_SPEED_KMH) continue;

    const peakR = Math.max(seg[i - 1].rpm ?? 0, seg[i].rpm ?? 0);
    events.push({
      eventType: 'KICKDOWN',
      severity: curThr > 95 ? 'SEVERE' : 'WARNING',
      startedAt: new Date(seg[i - 2].ts), endedAt: new Date(seg[i].ts),
      durationMs: seg[i].ts - seg[i - 2].ts,
      startSpeedKmh: seg[i - 2].speedKmh, endSpeedKmh: seg[i].speedKmh,
      peakValue: curThr, peakValueUnit: 'throttle%',
      maxRpm: peakR > 0 ? peakR : null, maxThrottlePos: curThr, maxCoolantTemp: null,
      metadata: {
        throttleRisePct: Math.round(curThr - prevThr),
        speedAtKickdown: seg[i - 2].speedKmh,
      },
    });
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: LAUNCH_LIKE_START
// ═══════════════════════════════════════════════════════════════

/**
 * Launch-like start: aggressive acceleration from near-standstill.
 *
 * IMPORTANT SEMANTIC NOTE:
 * This detector identifies a "launch-like start heuristic" — it does NOT confirm
 * that the driver used OEM launch-control mode. Many vehicles do not have launch
 * control at all. The eventType LAUNCH_LIKE_START reflects this accurately.
 *
 * Fix F changes from V1:
 *   - startSpeed now must be <= 3 km/h (was < 8 km/h). Events starting above 3 km/h
 *     are aggressive acceleration events, not launch-like starts.
 *   - peakAccel requirement added: the subsequent acceleration window must achieve
 *     >= LAUNCH_MIN_ACCEL_MS2 (3.5 m/s²) as peak accel, not just a speed gain.
 *   - If startSpeed > 3 km/h: treat as aggressive acceleration only (not flagged here).
 *
 * Requires RPM data — silently produces no events otherwise.
 */
function detectLaunchLikeStart(
  seg: CleanHfPoint[],
  cfg: VehicleRpmConfig,
  t: ReturnType<typeof rpm>,
): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length - 5; i++) {
    // Near-standstill + aggressive throttle + high RPM
    if (
      seg[i].speedKmh > LAUNCH_MAX_START_SPEED_KMH
    ) continue;

    if (seg[i].rpm == null || seg[i].rpm! < t.launchRpmEntry) continue;
    if (seg[i].throttlePct == null || seg[i].throttlePct! < LAUNCH_MIN_THROTTLE_PCT) continue;

    // Look forward for the acceleration window
    let j = i + 1;
    while (j < Math.min(i + 10, seg.length) && seg[j].speedKmh < 100) j++;

    const accelWindow = seg.slice(i, j + 1);
    if (accelWindow.length < 3) continue;

    const endSpeed = accelWindow[accelWindow.length - 1].speedKmh;
    const speedGain = endSpeed - seg[i].speedKmh;
    if (speedGain < LAUNCH_MIN_SPEED_GAIN_KMH) continue;

    // Verify strong acceleration actually occurred in the window
    let peakAccelMs2 = 0;
    for (let k = 1; k < accelWindow.length; k++) {
      const dt = (accelWindow[k].ts - accelWindow[k - 1].ts) / 1000;
      if (dt <= 0) continue;
      const a = (accelWindow[k].speedMs - accelWindow[k - 1].speedMs) / dt;
      if (a > peakAccelMs2) peakAccelMs2 = a;
    }
    if (peakAccelMs2 < LAUNCH_MIN_ACCEL_MS2) continue;

    events.push({
      eventType: 'LAUNCH_LIKE_START',
      severity: 'SEVERE',
      startedAt: new Date(seg[i].ts),
      endedAt: new Date(accelWindow[accelWindow.length - 1].ts),
      durationMs: accelWindow[accelWindow.length - 1].ts - seg[i].ts,
      startSpeedKmh: seg[i].speedKmh,
      endSpeedKmh: endSpeed,
      peakValue: Math.round(peakAccelMs2 * 100) / 100,
      peakValueUnit: 'm/s²',
      maxRpm: seg[i].rpm, maxThrottlePos: seg[i].throttlePct, maxCoolantTemp: null,
      metadata: {
        speedGainKmh: Math.round(speedGain * 10) / 10,
        launchRpmThreshold: Math.round(t.launchRpmEntry),
        rpmAtLaunch: seg[i].rpm,
        peakAccelMs2: Math.round(peakAccelMs2 * 100) / 100,
        semanticNote: 'launch-like start heuristic — not confirmed OEM launch-control mode',
      },
    });
    i = j;
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: OVERHEATING_ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Coolant temperature above 110°C for >= 5 seconds.
 *
 * Entry:    coolant > 110°C
 * Continue: coolant > 107°C (hysteresis: stays open during brief dips by 3°C)
 * Accept:   duration >= 5s
 *
 * Silently produces no events if coolant data is unavailable.
 */
function detectOverheatingEngine(seg: CleanHfPoint[]): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i].coolantC != null && seg[i].coolantC! > OVERHEAT_TEMP_C) {
      const start = i;
      while (
        i < seg.length - 1 &&
        seg[i + 1].coolantC != null &&
        seg[i + 1].coolantC! > OVERHEAT_TEMP_C - OVERHEAT_HYSTERESIS_C
      ) { i++; }

      const dur = seg[i].ts - seg[start].ts;
      if (dur >= 5000) {
        const slice = seg.slice(start, i + 1);
        const maxC = Math.max(...slice.filter((p) => p.coolantC != null).map((p) => p.coolantC!));
        events.push({
          eventType: 'OVERHEATING_ENGINE',
          severity: maxC > 120 ? 'CRITICAL' : 'SEVERE',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: seg[start].speedKmh, endSpeedKmh: seg[i].speedKmh,
          peakValue: maxC, peakValueUnit: 'tempC',
          maxRpm: null, maxThrottlePos: null, maxCoolantTemp: maxC,
          metadata: { durationAbove110s: Math.round(dur / 1000) },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: LONG_IDLE
// ═══════════════════════════════════════════════════════════════

/**
 * Vehicle stationary with engine running at idle RPM for >= 3 minutes.
 *
 * Entry:    speed < 3 km/h AND rpm in [0.5 × idleRpm … 1.5 × idleRpm]
 * Continue: speed < 3 km/h AND rpm > 0.4 × idleRpm (more relaxed continuation)
 * Accept:   duration >= LONG_IDLE_THRESHOLD_MS (3 min)
 *
 * Requires RPM data — silently produces no events otherwise.
 */
function detectLongIdle(seg: CleanHfPoint[], cfg: VehicleRpmConfig): AbuseEvent[] {
  const events: AbuseEvent[] = [];
  for (let i = 0; i < seg.length; i++) {
    const isIdleEntry =
      seg[i].speedKmh < 3 &&
      seg[i].rpm != null &&
      seg[i].rpm! > cfg.idleRpm * 0.5 &&
      seg[i].rpm! < cfg.idleRpm * 1.5;

    if (isIdleEntry) {
      const start = i;
      while (i < seg.length - 1) {
        const nextIdle =
          seg[i + 1].speedKmh < 3 &&
          seg[i + 1].rpm != null &&
          seg[i + 1].rpm! > cfg.idleRpm * 0.4;
        if (!nextIdle) break;
        i++;
      }
      const dur = seg[i].ts - seg[start].ts;
      if (dur >= LONG_IDLE_THRESHOLD_MS) {
        events.push({
          eventType: 'LONG_IDLE',
          severity: dur > 600_000 ? 'SEVERE' : 'WARNING',
          startedAt: new Date(seg[start].ts), endedAt: new Date(seg[i].ts),
          durationMs: dur,
          startSpeedKmh: 0, endSpeedKmh: 0,
          peakValue: Math.round(dur / 60_000 * 10) / 10, peakValueUnit: 'minutes',
          maxRpm: null, maxThrottlePos: null, maxCoolantTemp: null,
          metadata: { idleMinutes: Math.round(dur / 60_000 * 10) / 10, idleRpmVehicle: cfg.idleRpm },
        });
      }
    }
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR: FULL_BRAKING + POSSIBLE_IMPACT (mini-window approach)
// ═══════════════════════════════════════════════════════════════

/**
 * When POSSIBLE_IMPACT and FULL_BRAKING fire for the same physical stop (overlapping
 * time windows), keep only the more severe POSSIBLE_IMPACT to prevent double-counting
 * in the abuse score.
 */
function deduplicateBrakingAndImpact(events: AbuseEvent[]): AbuseEvent[] {
  const impacts = events.filter((e) => e.eventType === 'POSSIBLE_IMPACT');
  const rest = events.filter((e) => e.eventType !== 'POSSIBLE_IMPACT' && e.eventType !== 'FULL_BRAKING');
  const fullBraking = events.filter((e) => e.eventType === 'FULL_BRAKING');

  const keptFb = fullBraking.filter((fb) => {
    const fbStart = fb.startedAt.getTime();
    const fbEnd = fb.endedAt.getTime();
    return !impacts.some((imp) => {
      const impStart = imp.startedAt.getTime();
      const impEnd = imp.endedAt.getTime();
      return impStart <= fbEnd && impEnd >= fbStart;
    });
  });

  return [...rest, ...keptFb, ...impacts];
}

/**
 * FULL_BRAKING and POSSIBLE_IMPACT are derived from a validated mini-window scanner —
 * NOT from a single point-pair. This prevents noise spikes in 1s GPS data from
 * triggering these severe events.
 *
 * SEMANTIC RELATIONSHIP:
 *   braking.EXTREME (hf-braking.ts):  >= 7.0 m/s²  — braking intensity class
 *   abuse.FULL_BRAKING:               >= 7.5 m/s²  — stricter abuse event (2+ samples)
 *   abuse.POSSIBLE_IMPACT:            >= 12.0 m/s² — abrupt deceleration event (2+ samples)
 *
 * FULL_BRAKING requirements:
 *   peakDecel >= 7.5 m/s², startSpeed >= 20 km/h, sampleCount >= 2, deltaKmh >= 6.0
 *
 * POSSIBLE_IMPACT requirements:
 *   peakDecel >= 12.0 m/s², startSpeed >= 25 km/h, sampleCount >= 2, deltaKmh >= 3.0
 */
function detectFullBrakingAndImpact(seg: CleanHfPoint[]): AbuseEvent[] {
  const events: AbuseEvent[] = [];

  // Scanner state for each abuse category (run concurrently)
  let fbInEvent = false;
  let fbStart = 0;
  let fbPeak = 0;
  let fbSampleCount = 0;

  let impactInEvent = false;
  let impactStart = 0;
  let impactPeak = 0;
  let impactSampleCount = 0;

  function tryCloseFb(endIdx: number) {
    const deltaKmh = seg[fbStart].speedKmh - seg[endIdx].speedKmh;
    if (
      fbSampleCount >= FULL_BRAKING_MIN_SAMPLE_COUNT &&
      seg[fbStart].speedKmh >= FULL_BRAKING_MIN_START_SPEED_KMH &&
      deltaKmh >= FULL_BRAKING_MIN_DELTA_KMH
    ) {
      const decelG = fbPeak / G;
      events.push({
        eventType: 'FULL_BRAKING',
        severity: decelG >= 1.0 ? 'SEVERE' : 'WARNING',
        startedAt: new Date(seg[fbStart].ts), endedAt: new Date(seg[endIdx].ts),
        durationMs: seg[endIdx].ts - seg[fbStart].ts,
        startSpeedKmh: seg[fbStart].speedKmh, endSpeedKmh: seg[endIdx].speedKmh,
        peakValue: Math.round(decelG * 100) / 100, peakValueUnit: 'g',
        maxRpm: null, maxThrottlePos: null, maxCoolantTemp: null,
        metadata: {
          peakDecelMs2: Math.round(fbPeak * 100) / 100,
          deltaKmh: Math.round(deltaKmh * 10) / 10,
          sampleCount: fbSampleCount,
        },
      });
    }
  }

  function tryCloseImpact(endIdx: number) {
    const deltaKmh = seg[impactStart].speedKmh - seg[endIdx].speedKmh;
    if (
      impactSampleCount >= IMPACT_MIN_SAMPLE_COUNT &&
      seg[impactStart].speedKmh >= IMPACT_MIN_START_SPEED_KMH &&
      deltaKmh >= IMPACT_MIN_DELTA_KMH
    ) {
      const decelG = impactPeak / G;
      events.push({
        eventType: 'POSSIBLE_IMPACT',
        severity: 'CRITICAL',
        startedAt: new Date(seg[impactStart].ts), endedAt: new Date(seg[endIdx].ts),
        durationMs: seg[endIdx].ts - seg[impactStart].ts,
        startSpeedKmh: seg[impactStart].speedKmh, endSpeedKmh: seg[endIdx].speedKmh,
        peakValue: Math.round(decelG * 100) / 100, peakValueUnit: 'g',
        maxRpm: null, maxThrottlePos: null, maxCoolantTemp: null,
        metadata: {
          peakDecelMs2: Math.round(impactPeak * 100) / 100,
          deltaKmh: Math.round(deltaKmh * 10) / 10,
          sampleCount: impactSampleCount,
        },
      });
    }
  }

  for (let i = 1; i < seg.length; i++) {
    const dt = (seg[i].ts - seg[i - 1].ts) / 1000;
    if (dt <= 0) continue;
    const decel = (seg[i - 1].speedMs - seg[i].speedMs) / dt;

    // ── POSSIBLE_IMPACT scanner ──
    if (!impactInEvent) {
      if (decel >= IMPACT_MS2) {
        impactInEvent = true;
        impactStart = i - 1;
        impactPeak = decel;
        impactSampleCount = 1;
      }
    } else {
      if (decel >= IMPACT_HYSTERESIS_MS2) {
        impactSampleCount++;
        if (decel > impactPeak) impactPeak = decel;
      } else {
        tryCloseImpact(i - 1);
        impactInEvent = false;
        impactPeak = 0;
        impactSampleCount = 0;
      }
    }

    // ── FULL_BRAKING scanner (runs independently) ──
    if (!fbInEvent) {
      if (decel >= FULL_BRAKING_MS2) {
        fbInEvent = true;
        fbStart = i - 1;
        fbPeak = decel;
        fbSampleCount = 1;
      }
    } else {
      if (decel >= FULL_BRAKING_HYSTERESIS_MS2) {
        fbSampleCount++;
        if (decel > fbPeak) fbPeak = decel;
      } else {
        tryCloseFb(i - 1);
        fbInEvent = false;
        fbPeak = 0;
        fbSampleCount = 0;
      }
    }
  }

  // Close trailing events
  if (impactInEvent) tryCloseImpact(seg.length - 1);
  if (fbInEvent) tryCloseFb(seg.length - 1);

  return events;
}

// ═══════════════════════════════════════════════════════════════
//  ABUSE SCORE (Fix J)
// ═══════════════════════════════════════════════════════════════

/**
 * Deterministic, explainable abuse score (0–100) for a set of abuse events.
 *
 * Formula:
 *   raw = Σ (eventTypeBaseWeight × severityMultiplier) for each event
 *   score = min(100, raw)
 *
 * Event base weights:
 *   POSSIBLE_IMPACT:            20  (CRITICAL — potential vehicle damage)
 *   ENGINE_SHUTDOWN_WHILE_DRIVING: 15 (CRITICAL — mechanical risk)
 *   OVERHEATING_ENGINE:         10  (CRITICAL/SEVERE — thermal risk)
 *   LAUNCH_LIKE_START:           6  (SEVERE — drivetrain/clutch stress)
 *   FULL_BRAKING:                8  (SEVERE — brake/chassis stress)
 *   COLD_ENGINE_HIGH_RPM:        5
 *   COLD_ENGINE_FULL_THROTTLE:   5
 *   HIGH_RPM_CONSTANT:           4
 *   ENGINE_REV_IN_IDLE:          3
 *   KICKDOWN:                    3
 *   LONG_IDLE:                   2  (WARNING — fuel/emissions concern)
 *
 * Severity multipliers:
 *   WARNING:  1.0
 *   SEVERE:   1.5
 *   CRITICAL: 2.0
 *
 * The score is intentionally not per-100km because the number of events can
 * legitimately be high on a long trip.  Downstream consumers should normalize by
 * distanceKm if needed.  The score itself represents event weight within a single trip.
 */
export const ABUSE_SCORE_WEIGHTS: Record<AbuseEventType, number> = {
  POSSIBLE_IMPACT: 20,
  ENGINE_SHUTDOWN_WHILE_DRIVING: 15,
  OVERHEATING_ENGINE: 10,
  FULL_BRAKING: 8,
  LAUNCH_LIKE_START: 6,
  COLD_ENGINE_HIGH_RPM: 5,
  COLD_ENGINE_FULL_THROTTLE: 5,
  HIGH_RPM_CONSTANT: 4,
  ENGINE_REV_IN_IDLE: 3,
  KICKDOWN: 3,
  LONG_IDLE: 2,
};

const SEVERITY_MULTIPLIERS: Record<AbuseSeverity, number> = {
  WARNING: 1.0,
  SEVERE: 1.5,
  CRITICAL: 2.0,
};

export function computeAbuseScore(events: AbuseEvent[]): number {
  let raw = 0;
  for (const e of events) {
    const baseWeight = ABUSE_SCORE_WEIGHTS[e.eventType] ?? 2;
    const multiplier = SEVERITY_MULTIPLIERS[e.severity] ?? 1.0;
    raw += baseWeight * multiplier;
  }
  return Math.min(100, Math.round(raw * 10) / 10);
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL AVAILABILITY UTILITY
// ═══════════════════════════════════════════════════════════════

export interface SignalAvailability {
  coolantAvailable: boolean;
  rpmAvailable: boolean;
  throttleAvailable: boolean;
  loadAvailable: boolean;
  tractionBatteryPowerAvailable: boolean;
}

/**
 * Assess which optional signals are present in a cleaned segment array.
 * Used to populate behaviorSummaryJson so downstream consumers can distinguish
 * "no events occurred" from "detector was not evaluable due to missing signals".
 */
export function assessSignalAvailability(
  segments: CleanHfPoint[][],
): SignalAvailability {
  const all = segments.flat();
  return {
    coolantAvailable: all.some((p) => p.coolantC != null),
    rpmAvailable: all.some((p) => p.rpm != null),
    throttleAvailable: all.some((p) => p.throttlePct != null),
    loadAvailable: all.some((p) => p.loadPct != null),
    tractionBatteryPowerAvailable: all.some((p) => p.tractionBatteryPowerKw != null),
  };
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR CAPABILITY / FEASIBILITY (Phase 3 — read-only metadata)
// ═══════════════════════════════════════════════════════════════
//
// This block does NOT change detection. It declares, per abuse detector, which
// HF signals it needs and whether it can run on a battery-electric vehicle
// (i.e. it is "speed-only"). It is used to:
//   - honestly report which detectors were active vs impossible (EV) vs
//     blocked by missing signals, and
//   - tag derived events with confidence/required-signals
// without ever asserting engine-based abuse on a vehicle that physically has no
// combustion engine.

export type HfAbuseSignal = 'speed' | 'rpm' | 'coolant' | 'throttle';

export interface AbuseDetectorRequirement {
  requiredSignals: HfAbuseSignal[];
  /** True when the detector relies only on speed (works on EV/cloud). */
  speedOnly: boolean;
}

/** Per-detector signal requirements. Single source of truth for feasibility. */
export const ABUSE_DETECTOR_REQUIREMENTS: Record<AbuseEventType, AbuseDetectorRequirement> = {
  COLD_ENGINE_HIGH_RPM: { requiredSignals: ['coolant', 'rpm'], speedOnly: false },
  COLD_ENGINE_FULL_THROTTLE: { requiredSignals: ['coolant', 'throttle'], speedOnly: false },
  ENGINE_SHUTDOWN_WHILE_DRIVING: { requiredSignals: ['rpm', 'speed'], speedOnly: false },
  ENGINE_REV_IN_IDLE: { requiredSignals: ['rpm', 'speed'], speedOnly: false },
  HIGH_RPM_CONSTANT: { requiredSignals: ['rpm'], speedOnly: false },
  KICKDOWN: { requiredSignals: ['throttle', 'speed'], speedOnly: false },
  LAUNCH_LIKE_START: { requiredSignals: ['rpm', 'throttle', 'speed'], speedOnly: false },
  OVERHEATING_ENGINE: { requiredSignals: ['coolant'], speedOnly: false },
  LONG_IDLE: { requiredSignals: ['rpm', 'speed'], speedOnly: false },
  POSSIBLE_IMPACT: { requiredSignals: ['speed'], speedOnly: true },
  FULL_BRAKING: { requiredSignals: ['speed'], speedOnly: true },
};

export type DetectorFeasibilityStatus =
  | 'active' // signals present, detector evaluated
  | 'impossible_no_engine' // EV/cloud has no combustion-engine signals
  | 'insufficient_signal' // engine vehicle but required HF signal absent
  | 'snapshot_only'; // no dense HF stream — cannot run reliably

export interface DetectorFeasibility {
  status: DetectorFeasibilityStatus;
  requiredSignals: HfAbuseSignal[];
  speedOnly: boolean;
}

/**
 * Assess, per detector, whether it could run for this vehicle/trip given the
 * vehicle capability profile and the observed HF signal availability. Pure,
 * read-only — drives diagnostics + derived-event metadata, never detection.
 */
export function assessDetectorFeasibility(input: {
  engineSignalsAvailable: boolean;
  snapshotOnly: boolean;
  signal: SignalAvailability;
}): Record<AbuseEventType, DetectorFeasibility> {
  const haveSignal: Record<HfAbuseSignal, boolean> = {
    speed: true, // speed is always part of the HF stream
    rpm: input.signal.rpmAvailable,
    coolant: input.signal.coolantAvailable,
    throttle: input.signal.throttleAvailable,
  };

  const out = {} as Record<AbuseEventType, DetectorFeasibility>;
  for (const key of Object.keys(ABUSE_DETECTOR_REQUIREMENTS) as AbuseEventType[]) {
    const req = ABUSE_DETECTOR_REQUIREMENTS[key];
    let status: DetectorFeasibilityStatus;
    if (input.snapshotOnly) {
      status = 'snapshot_only';
    } else if (!req.speedOnly && !input.engineSignalsAvailable) {
      // Engine-dependent detector on a vehicle without a combustion engine.
      status = 'impossible_no_engine';
    } else if (!req.requiredSignals.every((s) => haveSignal[s])) {
      status = 'insufficient_signal';
    } else {
      status = 'active';
    }
    out[key] = {
      status,
      requiredSignals: req.requiredSignals,
      speedOnly: req.speedOnly,
    };
  }
  return out;
}

/**
 * Derived-event confidence for an HF-reconstructed abuse event. Reconstructed
 * (non-native) events are kept conservative so they are never confused with
 * native DIMO behavior events. Speed-only EV events cap at 'medium'.
 */
export function deriveAbuseConfidence(
  event: AbuseEvent,
  feasibility?: DetectorFeasibility,
): 'low' | 'medium' | 'high' {
  // If the detector could only run on partial signals, downgrade.
  if (feasibility && feasibility.status !== 'active') return 'low';
  if (event.severity === 'CRITICAL') return 'high';
  return 'medium';
}
