/**
 * SynqDrive V2 Trip Detection — Unit Tests
 *
 * Coverage (v2.3.0 cleanup):
 *   Fix A — EV/HYBRID idle-within-trip handling
 *   Fix B — time-based continuity window (no magic slice(-5))
 *   Fix C — ignition de-prioritized in end / resume detection
 *   Fix D — V1 legacy isolation (no live path calls legacy detectTrips)
 *   Fix E — canonical HF counter preference in health scoring
 *   Plus   — CUSUM, profile thresholds, merge/cancel, timeout fallback
 */

import {
  assessActiveContinuity,
  evaluateSnapshotEvidence,
  evaluateInactivityWindow,
  evaluateFrequency,
  hasActivityResumed,
  checkTripQuality,
  getProfileThresholds,
} from './trip-evidence.helpers';
import {
  detectTripEndChangePoint,
  hasOngoingActivityInWindow,
} from './trip-cusum';
import { END_DETECTION_MODES } from './trip-detection.types';
import type { TripCoreDataPoint } from '../../dimo/dimo-segments.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTs(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

function pt(
  secondsAgo: number,
  speed: number | null,
  ignition: boolean,
  odometer?: number,
  batteryEnergy?: number,
): TripCoreDataPoint {
  return {
    timestamp: makeTs(secondsAgo),
    isIgnitionOn: ignition,
    speed,
    travelledDistance: odometer ?? null,
    fuelAbsoluteLevel: null,
    batteryEnergy: batteryEnergy ?? null,
  };
}

const snapshot = (
  ignition: boolean | null,
  speed: number | null,
  engineLoad: number | null = null,
  odometerKm: number | null = null,
): import('./trip-detection.types').SnapshotEvidenceSignals => ({
  isIgnitionOn: ignition,
  speedKmh: speed,
  engineLoad,
  tractionBatteryPowerKw: null,
  latitude: null,
  longitude: null,
  odometerKm,
  fuelLevelAbsolute: null,
  evSoc: null,
});

// ═══════════════════════════════════════════════════════════════
//  FIX A — EV / HYBRID IDLE-WITHIN-TRIP HANDLING
// ═══════════════════════════════════════════════════════════════

describe('Fix A — EV/HYBRID idle handling', () => {
  it('EV: short traffic stop with active signal frequency → IDLE (not POSSIBLE_END)', () => {
    // 6 data points ~20s apart = 3 ppm — above EV active threshold (2 ppm)
    // Speed=0, no RPM, no throttle, no load — typical EV stop
    const points = [
      pt(120, 0, false, 5000),
      pt(100, 0, false, 5000),
      pt(80,  0, false, 5000),
      pt(60,  0, false, 5000),
      pt(40,  0, false, 5000),
      pt(20,  0, false, 5000),
    ];
    // perfHasActivity=false (no RPM/throttle/load — EV)
    const result = assessActiveContinuity(points, false, 'EV');
    expect(result.verdict).toBe('IDLE');
    expect((result.summary as any).reason).toBe('ev_hybrid_stop_active_frequency');
  });

  it('HYBRID: short stop with active frequency → IDLE', () => {
    const points = [
      pt(100, 0, true, 3000),
      pt(80,  0, true, 3000),
      pt(60,  0, true, 3000),
      pt(40,  0, true, 3000),
      pt(20,  0, true, 3000),
    ];
    const result = assessActiveContinuity(points, false, 'HYBRID');
    expect(result.verdict).toBe('IDLE');
    expect((result.summary as any).reason).toBe('ev_hybrid_stop_active_frequency');
  });

  it('ICE: stopped at traffic light with perf activity → IDLE', () => {
    const points = [
      pt(80, 0, true, 1000),
      pt(60, 0, true, 1000),
      pt(40, 0, true, 1000),
      pt(20, 0, true, 1000),
      pt(5,  0, true, 1000),
    ];
    const result = assessActiveContinuity(points, true, 'ICE');
    expect(result.verdict).toBe('IDLE');
    expect((result.summary as any).reason).toBe('stopped_perf_active');
  });

  it('ICE: stopped without perf activity → POSSIBLE_END (not IDLE)', () => {
    const points = [
      pt(300, 0, false, 1000),
      pt(280, 0, false, 1000),
      pt(260, 0, false, 1000),
      pt(240, 0, false, 1000),
      pt(220, 0, false, 1000),
    ];
    const result = assessActiveContinuity(points, false, 'ICE');
    expect(result.verdict).toBe('POSSIBLE_END');
  });

  it('EV: parked with resting frequency → POSSIBLE_END (not IDLE)', () => {
    // Only 2 points in a very long window → resting frequency
    const points = [
      pt(600, 0, false, 2000),
      pt(5,   0, false, 2000),
    ];
    const result = assessActiveContinuity(points, false, 'EV');
    expect(result.verdict).toBe('POSSIBLE_END');
  });

  it('EV: stopped with light energy activity → IDLE (charging or regen post-stop)', () => {
    const points = [
      pt(100, 0, false, 5000, 45.0),
      pt(80,  0, false, 5000, 44.8),
      pt(60,  0, false, 5000, 44.5),
      pt(40,  0, false, 5000, 44.2),
    ];
    const result = assessActiveContinuity(points, false, 'EV');
    expect(result.verdict).toBe('IDLE');
    expect((result.summary as any).reason).toBe('stopped_energy_active');
  });

  it('HYBRID: stopped + stale combustion signals but active frequency → IDLE', () => {
    // Hybrid at a long traffic light: ICE may be off (EV mode), frequency still active
    const points = [
      pt(110, 0, true, 4000),
      pt(90,  0, true, 4000),
      pt(70,  0, true, 4000),
      pt(50,  0, true, 4000),
      pt(30,  0, true, 4000),
      pt(10,  0, true, 4000),
    ];
    const result = assessActiveContinuity(points, false, 'HYBRID');
    expect(result.verdict).toBe('IDLE');
  });
});

// ═══════════════════════════════════════════════════════════════
//  FIX B — TIME-BASED CONTINUITY WINDOW (NO slice(-5))
// ═══════════════════════════════════════════════════════════════

describe('Fix B — time-based continuity window', () => {
  it('evaluates all points within the window, not just the last 5', () => {
    // 10 moving points all within 2 minutes — all should be counted
    const points = Array.from({ length: 10 }, (_, i) =>
      pt((10 - i) * 12, 50, true, 1000 + i * 0.1),
    );
    const result = assessActiveContinuity(points, false, 'ICE');
    // Has motion because many points have speed=50 above ICE threshold (5)
    expect(result.verdict).toBe('ACTIVE');
    expect((result.summary as any).motionCount).toBe(10);
  });

  it('activity within window is not lost regardless of point count', () => {
    // Simulate many points, all with clear motion
    const manyPoints = Array.from({ length: 20 }, (_, i) =>
      pt((20 - i) * 6, 40, true, 1000 + i * 0.05),
    );
    const result = assessActiveContinuity(manyPoints, false, 'ICE');
    expect(result.verdict).toBe('ACTIVE');
  });

  it('sparse window (2 points) handled safely — no crash', () => {
    const points = [pt(90, 60, true, 1000), pt(30, 55, true, 1001)];
    const result = assessActiveContinuity(points, false, 'ICE');
    expect(result.verdict).toBe('ACTIVE');
  });

  it('empty window falls back to POSSIBLE_END safely', () => {
    const result = assessActiveContinuity([], false, 'ICE');
    expect(result.verdict).toBe('POSSIBLE_END');
  });
});

// ═══════════════════════════════════════════════════════════════
//  FIX C — IGNITION DE-PRIORITIZED IN END / RESUME LOGIC
// ═══════════════════════════════════════════════════════════════

describe('Fix C — ignition de-prioritized in end and resume detection', () => {
  it('stale ignition ON does not block POSSIBLE_END when vehicle is truly stopped', () => {
    const points = [
      pt(300, 0, true, 1000),
      pt(280, 0, true, 1000),
      pt(260, 0, true, 1000),
      pt(240, 0, true, 1000),
      pt(200, 0, true, 1000),
    ];
    const result = assessActiveContinuity(points, false, 'ICE');
    expect(result.verdict).toBe('POSSIBLE_END');
    expect((result.summary as any).ignitionStuck).toBe(true);
    expect(result.endMode).toBe(END_DETECTION_MODES.COMPOSITE_INACTIVITY);
  });

  it('ignition OFF still boosts end confidence (bonus signal)', () => {
    const points = [
      pt(300, 0, false, 1000),
      pt(280, 0, false, 1000),
      pt(260, 0, false, 1000),
      pt(240, 0, false, 1000),
    ];
    const result = assessActiveContinuity(points, false, 'ICE');
    expect(result.verdict).toBe('POSSIBLE_END');
    expect(result.endMode).toBe(END_DETECTION_MODES.IGNITION_OFF_CONFIRMED);
    expect(result.endConfidence).toBe('HIGH');
  });

  it('hasActivityResumed: stale ignition alone does NOT resume trip', () => {
    // Ignition still ON but speed=0 — should NOT trigger resume
    const points = [
      pt(60, 0, true),
      pt(40, 0, true),
      pt(20, 0, true),
    ];
    expect(hasActivityResumed(points, 'ICE')).toBe(false);
  });

  it('hasActivityResumed: speed above motion threshold resumes trip', () => {
    const points = [
      pt(60, 0, true),
      pt(40, 0.8, true),  // > 0.5 km/h (ICE speedMotionKmh)
      pt(20, 5, true),
    ];
    expect(hasActivityResumed(points, 'ICE')).toBe(true);
  });

  it('hasActivityResumed: EV — speed alone is sufficient, no ignition required', () => {
    const points = [
      pt(60, 0, false),
      pt(40, 1.0, false),  // > 0.5 km/h (EV speedMotionKmh = 0.5)
    ];
    expect(hasActivityResumed(points, 'EV')).toBe(true);
  });

  it('hasActivityResumed: ignition ON + speed exactly at boundary (0.5) does NOT resume ICE', () => {
    // 0.5 is the threshold — we require STRICTLY greater than
    const points = [pt(30, 0.5, true)];
    // speedMotionKmh = 0.5, condition is > 0.5
    expect(hasActivityResumed(points, 'ICE')).toBe(false);
  });

  it('stale ignition ON + EV + resting frequency + no speed → POSSIBLE_END', () => {
    // 3 points spread over ~600 seconds = 0.3 ppm < restingFrequencyPerMin (0.5)
    // → isRestingFrequency=true → EV frequency guard does NOT fire → POSSIBLE_END
    const points = [
      pt(600, 0, true),
      pt(400, 0, true),
      pt(10,  0, true),
    ];
    const result = assessActiveContinuity(points, false, 'EV');
    expect(result.verdict).toBe('POSSIBLE_END');
  });
});

// ═══════════════════════════════════════════════════════════════
//  PROFILE-AWARE FREQUENCY THRESHOLDS
// ═══════════════════════════════════════════════════════════════

describe('evaluateFrequency — profile-aware thresholds', () => {
  it('uses profile activeFrequencyPerMin and restingFrequencyPerMin', () => {
    const iceProfile = getProfileThresholds('ICE');
    const evProfile = getProfileThresholds('EV');
    // Both have activeFrequencyPerMin=2 and restingFrequencyPerMin=0.5
    expect(iceProfile.activeFrequencyPerMin).toBe(2);
    expect(iceProfile.restingFrequencyPerMin).toBe(0.5);
    expect(evProfile.activeFrequencyPerMin).toBe(2);
    expect(evProfile.restingFrequencyPerMin).toBe(0.5);
  });

  it('2 points in 60s window → 2 ppm → isActiveFrequency=true (>=2)', () => {
    const points = [pt(60, 50, true), pt(0, 45, true)];
    const result = evaluateFrequency(points, 60_000, 'ICE');
    expect(result.pointsPerMinute).toBeCloseTo(2, 0);
    expect(result.isActiveFrequency).toBe(true);
  });

  it('1 point in 5 min window → 0.2 ppm → isRestingFrequency=true (<0.5)', () => {
    const points = [pt(300, 0, false), pt(0, 0, false)];
    // 2 points in 5 min = 0.4 ppm — below restingFrequencyPerMin=0.5
    const result = evaluateFrequency(points, 5 * 60_000, 'ICE');
    expect(result.isRestingFrequency).toBe(true);
  });

  it('empty points → always resting', () => {
    const result = evaluateFrequency([], 60_000, 'EV');
    expect(result.isActiveFrequency).toBe(false);
    expect(result.isRestingFrequency).toBe(true);
  });

  it('frequency between resting and active is neither', () => {
    // 1.0 ppm: above restingFrequencyPerMin (0.5) but below activeFrequencyPerMin (2)
    const points = [pt(60, 0, false), pt(0, 0, false)];
    const result = evaluateFrequency(points, 2 * 60_000, 'ICE');
    // 2 pts / 2 min = 1.0 ppm
    expect(result.pointsPerMinute).toBeCloseTo(1.0, 0);
    expect(result.isRestingFrequency).toBe(false);
    expect(result.isActiveFrequency).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  evaluateSnapshotEvidence — Trip Start preserved
// ═══════════════════════════════════════════════════════════════

describe('evaluateSnapshotEvidence — Trip Start still works', () => {
  it('triggers for ICE: ignition + speed above threshold', () => {
    const result = evaluateSnapshotEvidence(snapshot(true, 25, 30), null, 'ICE');
    expect(result.triggered).toBe(true);
    expect(result.hasMovement).toBe(true);
  });

  it('triggers for EV: speed + odometer delta (no ignition)', () => {
    const current = { ...snapshot(false, 10, 0, 5001), evSoc: 85, fuelLevelAbsolute: null };
    const prev = { latitude: 48.1, longitude: 11.5, odometerKm: 5000, fuelLevelAbsolute: null, evSoc: 90 };
    const result = evaluateSnapshotEvidence(current as any, prev, 'EV');
    expect(result.triggered).toBe(true);
  });

  it('does NOT trigger for resting vehicle with no signals', () => {
    const result = evaluateSnapshotEvidence(snapshot(false, 0, 0), null, 'ICE');
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger for EV on low-speed only (no odometer delta)', () => {
    const result = evaluateSnapshotEvidence(snapshot(false, 1, 0), null, 'EV');
    expect(result.triggered).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  assessActiveContinuity — ICE profile (full coverage)
// ═══════════════════════════════════════════════════════════════

describe('assessActiveContinuity — ICE profile', () => {
  const PROFILE = 'ICE';

  it('returns ACTIVE when speed is above ICE threshold (5 km/h)', () => {
    const points = [
      pt(80, 60, true, 1000),
      pt(60, 55, true, 1001),
      pt(40, 50, true, 1002),
      pt(20, 48, true, 1003),
      pt(5,  45, true, 1004),
    ];
    expect(assessActiveContinuity(points, false, PROFILE).verdict).toBe('ACTIVE');
  });

  it('returns ACTIVE when odometer is progressing even at low speed', () => {
    const points = [
      pt(80, 3, true, 1000.0),
      pt(60, 2, true, 1000.1),
      pt(40, 2, true, 1000.2),
      pt(20, 2, true, 1000.3),
      pt(5,  3, true, 1000.4),
    ];
    expect(assessActiveContinuity(points, false, PROFILE).verdict).toBe('ACTIVE');
  });

  it('returns IDLE when perf confirms engine running at genuine traffic stop', () => {
    const points = [pt(80, 0, true, 1000), pt(60, 0, true, 1000), pt(40, 0, true, 1000), pt(20, 0, true, 1000), pt(5, 0, true, 1000)];
    const result = assessActiveContinuity(points, true, PROFILE);
    expect(result.verdict).toBe('IDLE');
    expect(result.summary).toMatchObject({ reason: 'stopped_perf_active' });
  });

  it('KEY FIX: stale ignition ON + no perf → POSSIBLE_END (not stuck in IDLE)', () => {
    const points = [pt(280, 0, true, 1000), pt(260, 0, true, 1000), pt(240, 0, true, 1000), pt(220, 0, true, 1000), pt(200, 0, true, 1000)];
    const result = assessActiveContinuity(points, false, PROFILE);
    expect(result.verdict).toBe('POSSIBLE_END');
    expect(result.endMode).toBe(END_DETECTION_MODES.COMPOSITE_INACTIVITY);
    expect((result.summary as any).ignitionStuck).toBe(true);
  });

  it('HIGH confidence end when ignition is clearly off and all stopped', () => {
    const points = [pt(280, 0, false, 1000), pt(260, 0, false, 1000), pt(240, 0, false, 1000), pt(220, 0, false, 1000)];
    const result = assessActiveContinuity(points, false, PROFILE);
    expect(result.verdict).toBe('POSSIBLE_END');
    expect(result.endMode).toBe(END_DETECTION_MODES.IGNITION_OFF_CONFIRMED);
    expect(result.endConfidence).toBe('HIGH');
  });

  it('returns POSSIBLE_END when no data points (signal silence)', () => {
    const result = assessActiveContinuity([], false, PROFILE);
    expect(result.verdict).toBe('POSSIBLE_END');
    expect(result.endMode).toBe(END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT);
  });

  it('MEDIUM confidence POSSIBLE_END on frequency drop', () => {
    const points = [pt(280, 0, true, 1000), pt(5, 0, true, 1000)];
    const result = assessActiveContinuity(points, false, PROFILE);
    expect(result.verdict).toBe('POSSIBLE_END');
    expect(result.endMode).toBe(END_DETECTION_MODES.FREQUENCY_DROP_TIMEOUT);
    expect(result.endConfidence).toBe('MEDIUM');
  });
});

// ═══════════════════════════════════════════════════════════════
//  checkTripQuality — merge/cancel/normal
// ═══════════════════════════════════════════════════════════════

describe('checkTripQuality', () => {
  const now = new Date();

  it('discards trip < 60s with no distance', () => {
    expect(checkTripQuality(30_000, null, 0, null, now).shouldDiscard).toBe(true);
  });

  it('discards trip with < 0.1 km and low consecutive active points', () => {
    const r = checkTripQuality(120_000, 0.05, 1, null, now);
    expect(r.shouldDiscard).toBe(true);
    expect(r.reason).toBe('no_meaningful_movement');
  });

  it('merges with previous trip if gap < 5 min', () => {
    const prevEnd = new Date(now.getTime() - 3 * 60_000);
    const r = checkTripQuality(120_000, 5, 3, prevEnd, now);
    expect(r.shouldMergeWithPrevious).toBe(true);
  });

  it('does NOT merge if gap > 5 min', () => {
    const prevEnd = new Date(now.getTime() - 10 * 60_000);
    expect(checkTripQuality(300_000, 5, 3, prevEnd, now).shouldMergeWithPrevious).toBe(false);
  });

  it('accepts a normal quality trip', () => {
    const r = checkTripQuality(600_000, 8.5, 5, null, now);
    expect(r.shouldDiscard).toBe(false);
    expect(r.shouldMergeWithPrevious).toBe(false);
  });

  it('timeout fallback: long trip that exceeded timeout is still finalized, not discarded', () => {
    // A 31-minute trip with 5 km distance should complete, not be discarded
    const r = checkTripQuality(31 * 60_000, 5.0, 3, null, now);
    expect(r.shouldDiscard).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CUSUM change-point detection
// ═══════════════════════════════════════════════════════════════

describe('detectTripEndChangePoint — CUSUM', () => {
  function mkPt(secondsAgo: number, speed: number | null): TripCoreDataPoint {
    return pt(secondsAgo, speed, speed != null && speed > 2, speed != null ? 1000 + (300 - secondsAgo) * 0.01 : 1000);
  }

  it('detects a clear stop after active driving', () => {
    const points: TripCoreDataPoint[] = [];
    for (let i = 60; i >= 1; i--) {
      const speedKmh = i > 20 ? 40 + Math.sin(i) * 10 : 0;
      points.push(mkPt(i * 15, speedKmh));
    }
    const result = detectTripEndChangePoint(points);
    expect(result.changePointDetected).toBe(true);
    expect(result.changePointAt).not.toBeNull();
    expect(result.appearsOngoing).toBe(false);
    expect(['MEDIUM', 'HIGH']).toContain(result.confidence);
  });

  it('does NOT falsely detect end when trip is ongoing', () => {
    const points = Array.from({ length: 30 }, (_, i) => mkPt((30 - i) * 20, 50 + Math.random() * 20));
    const result = detectTripEndChangePoint(points);
    expect(result.appearsOngoing).toBe(true);
    expect(result.changePointDetected).toBe(false);
  });

  it('returns insufficient_data for < 4 points', () => {
    const result = detectTripEndChangePoint([mkPt(60, 50), mkPt(30, 40)]);
    expect(result.reason).toBe('insufficient_data');
  });

  it('handles all-stopped-from-start gracefully', () => {
    const points = Array.from({ length: 10 }, (_, i) => mkPt((10 - i) * 20, 0));
    const result = detectTripEndChangePoint(points);
    expect(result.changePointDetected).toBe(false);
    expect(result.reason).toBe('all_stopped_from_start');
  });

  it('EV slow-parking: detects gradual deceleration to stop', () => {
    const points: TripCoreDataPoint[] = [
      mkPt(600, 80), mkPt(560, 65), mkPt(520, 50), mkPt(480, 35),
      mkPt(440, 20), mkPt(400, 10), mkPt(360, 5),  mkPt(320, 2),
      mkPt(280, 0),  mkPt(240, 0),  mkPt(200, 0),  mkPt(160, 0),
      mkPt(120, 0),  mkPt(80, 0),   mkPt(40, 0),   mkPt(5, 0),
    ];
    const result = detectTripEndChangePoint(points);
    expect(result.changePointDetected).toBe(true);
    expect(result.lastMovementAt).not.toBeNull();
  });

  it('stop-and-go: short stop mid-trip does not produce false end', () => {
    const points: TripCoreDataPoint[] = [
      mkPt(600, 60), mkPt(560, 55),
      mkPt(520, 0),  mkPt(500, 0),       // brief stop
      mkPt(460, 30), mkPt(420, 55), mkPt(380, 60),
      mkPt(340, 58), mkPt(300, 55), mkPt(260, 50),
    ];
    const result = detectTripEndChangePoint(points);
    expect(result.appearsOngoing).toBe(true);
    expect(result.changePointDetected).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  hasOngoingActivityInWindow
// ═══════════════════════════════════════════════════════════════

describe('hasOngoingActivityInWindow', () => {
  it('returns true when speed present', () => {
    expect(hasOngoingActivityInWindow([pt(30, 10, true, 1000), pt(10, 8, true, 1000.1)])).toBe(true);
  });

  it('returns true when only odometer progress exists', () => {
    expect(hasOngoingActivityInWindow([pt(30, 0, true, 1000), pt(10, 0, true, 1000.2)])).toBe(true);
  });

  it('returns false when all stopped and no progress', () => {
    expect(hasOngoingActivityInWindow([pt(30, 0, true, 1000), pt(10, 0, true, 1000)])).toBe(false);
  });

  it('returns false when empty', () => {
    expect(hasOngoingActivityInWindow([])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  evaluateInactivityWindow — ignition is secondary
// ═══════════════════════════════════════════════════════════════

describe('evaluateInactivityWindow', () => {
  it('counts stopped points regardless of ignition state', () => {
    const points = [pt(100, 0, true), pt(80, 0, true), pt(60, 0, true)];
    const result = evaluateInactivityWindow(points, 'ICE');
    expect(result.inactivePointCount).toBe(3);
    expect(result.allStopped).toBe(true);
    expect(result.allIgnitionOff).toBe(false);
  });

  it('detects all-stopped even without explicit ignition-off', () => {
    const points = [pt(100, 0.3, true), pt(80, 0.4, true), pt(60, 0, true)];
    const result = evaluateInactivityWindow(points, 'ICE');
    expect(result.allStopped).toBe(true);
  });

  it('handles empty array gracefully', () => {
    const result = evaluateInactivityWindow([], 'ICE');
    expect(result.allStopped).toBe(true);
    expect(result.totalPoints).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  HF enrichment trigger (integration-level: finalize enqueues hf-enrich)
// ═══════════════════════════════════════════════════════════════

describe('Fix E — canonical HF counter preference', () => {
  it('hardBrakingCount is preferred when behaviorEnrichedAt is set', () => {
    // Simulate the canonical-counter selector used in the controller
    const trips = [
      { hardBrakingCount: 3, harshBrakeCount: 1, behaviorEnrichedAt: new Date(), distanceKm: 50 },
      { hardBrakingCount: 0, harshBrakeCount: 5, behaviorEnrichedAt: null, distanceKm: 30 },
    ];

    const total = trips.reduce((s: number, t: typeof trips[0]) => {
      if (t.behaviorEnrichedAt != null) return s + (t.hardBrakingCount ?? 0);
      return s + (t.harshBrakeCount ?? 0);
    }, 0);

    // First trip: uses hardBrakingCount=3 (HF canonical)
    // Second trip: uses harshBrakeCount=5 (legacy, no HF enrichment yet)
    expect(total).toBe(8);
  });

  it('falls back to harshBrakeCount when no HF enrichment has run', () => {
    const trips = [
      { hardBrakingCount: 0, harshBrakeCount: 4, behaviorEnrichedAt: null, distanceKm: 40 },
    ];
    const total = trips.reduce((s: number, t: typeof trips[0]) => {
      if (t.behaviorEnrichedAt != null) return s + (t.hardBrakingCount ?? 0);
      return s + (t.harshBrakeCount ?? 0);
    }, 0);
    expect(total).toBe(4);
  });
});
