import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_FABLE_V0_1_OPTIONS,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_FABLE_V0_2_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  motionFsmVersionId,
  runMotionFsm,
  runMotionFsmV02,
  type MotionCorePositionBucket,
  type MotionCoreSpeedSample,
  type MotionFsmCandidateOptions,
  type MotionFsmLabel,
} from '..';

/**
 * EXP021 review — robustness cases and invariants for the motion core chain
 * (C4 → FSM → event detector), run for the Fable baseline and the V0.3 / K3 candidates.
 * Synthetic along-track grids; no Tesla data, no trip-specific rules.
 */

const T0 = Date.parse('2026-01-01T10:00:00Z');
const lab = (i: number) => new Date(T0 + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const LAT0 = 51.0;
const MLAT = 111_320;
const MLON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

/** Along-track distance (m) per 1 s label; null → ROW_ABSENT. `lateral` adds a cross-track offset (m). */
function grid(dist: Array<number | null>, lateral: Record<number, number> = {}): MotionCorePositionBucket[] {
  return dist.map((d, i) => ({
    bucketLabelUtc: lab(i),
    availability: d == null ? 'ROW_ABSENT' : 'PRESENT',
    latitude: d == null ? null : LAT0 + (lateral[i] ?? 0) / MLAT,
    longitude: d == null ? null : d / MLON,
  }));
}

/** Integrate a per-second speed profile (km/h) into along-track distance. */
function profile(speedsKmh: number[]): number[] {
  const d: number[] = [0];
  for (let i = 1; i < speedsKmh.length; i++) {
    d.push(d[i - 1]! + ((speedsKmh[i - 1]! + speedsKmh[i]!) / 2) / 3.6);
  }
  return d;
}
const ramp = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
const hold = (v: number, n: number) => Array.from({ length: n }, () => v);

const FSM_VARIANTS: Array<[string, Readonly<MotionFsmCandidateOptions>]> = [
  ['BASE', MOTION_FSM_FABLE_V0_2_OPTIONS],
  ['V03', MOTION_FSM_V0_3_CANDIDATE_OPTIONS],
];
const EVENT_VARIANTS = [
  ['BASE', MOTION_EVENT_FABLE_V0_1_OPTIONS],
  ['K3', MOTION_EVENT_V0_2_CANDIDATE_OPTIONS],
] as const;

function chain(g: MotionCorePositionBucket[], opts: Readonly<MotionFsmCandidateOptions>, mode: 'CAUSAL' | 'RETROSPECTIVE' = 'CAUSAL') {
  const c4 = computeC4AdaptiveL3(g);
  const fsm = runMotionFsm(g, c4, mode, null, undefined, opts);
  const eps = extractMotionFsmStopEpisodes(0, fsm, mode);
  return { c4, fsm, eps };
}
function events(c4: MotionCoreSpeedSample[], opts: (typeof EVENT_VARIANTS)[number][1]) {
  return detectMotionManoeuvreEvents(0, c4, 'C4', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, opts);
}
const fsmSig = (l: MotionFsmLabel) => `${l.state}|${l.evidenceQuality}|${l.reason}|${[...l.flags].filter((f) => f !== 'OPEN_END_GRID_BOUNDARY').sort().join(',')}`;

/** Longest run of consecutive STATIONARY labels without position or sparse evidence. */
function longestUnobservedStationaryRun(fsm: MotionFsmLabel[]): number {
  let best = 0;
  let cur = 0;
  for (const l of fsm) {
    if (l.state === 'STATIONARY' && !l.positionPresent && l.sparseSpeedKmh == null) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Synthetic cases (§4 of the review brief)
// ---------------------------------------------------------------------------------------------

const CASES: Record<string, { grid: MotionCorePositionBucket[]; note: string }> = {};

{
  // 1. constant 50 km/h with short outages (1-s and 2-s)
  const d: Array<number | null> = profile(hold(50, 60));
  for (const i of [10, 25, 26, 40]) d[i] = null;
  CASES.constantWithOutages = { grid: grid(d), note: 'no manoeuvre and no stop may arise from data loss alone' };
}
{
  // 2. brake → 10 s stop → restart, dense positions
  const v = [...hold(50, 8), ...ramp(50, 0, 7), ...hold(0, 10), ...ramp(0, 50, 8), ...hold(50, 8)];
  CASES.brakeStopRestart = { grid: grid(profile(v)), note: 'one episode, one DECEL, one ACCEL' };
}
{
  // 3. creep / stop-and-go: stop, 3 km/h creep, stop, 4 km/h creep, drive off
  const v = [...hold(20, 5), ...ramp(20, 0, 4), ...hold(0, 5), ...hold(3, 6), ...hold(0, 5), ...hold(4, 6), ...ramp(4, 30, 6), ...hold(30, 5)];
  CASES.creepStopAndGo = { grid: grid(profile(v)), note: 'creep in the hysteresis band must be flagged, not claimed as separated' };
}
{
  // 4. strong real speed change 30 → 80 km/h in 5 s (≈2.8 m/s²), then 80 → 30 in 5 s
  const v = [...hold(30, 8), ...ramp(30, 80, 6), ...hold(80, 8), ...ramp(80, 30, 6), ...hold(30, 8)];
  CASES.strongRealChange = { grid: grid(profile(v)), note: 'real accel/decel preserved with OK quality' };
}
{
  // 5a. timing jitter: labels 14/15 stamped late (0.3 s / 0.9 s), 16 absent — Tesla-like signature
  const vv = 45 / 3.6;
  const d: Array<number | null> = Array.from({ length: 30 }, (_, i) => i * vv);
  d[14] = 14 * vv + 0.3 * vv;
  d[15] = 15 * vv + 0.9 * vv;
  d[16] = null;
  CASES.timingJitter = { grid: grid(d), note: 'constant 45 km/h; any emitted event is an artefact' };
}
{
  // 5b. GPS jump: 12 m lateral at label 12 during constant 30 km/h
  const d: Array<number | null> = profile(hold(30, 25));
  CASES.gpsJump = { grid: grid(d, { 12: 12 }), note: 'outlier rejected; no event; no stop' };
}
{
  // 6. long gap (90 s) while moving, then resume moving
  const d: Array<number | null> = [...profile(hold(40, 10))];
  const last = d[d.length - 1]!;
  for (let i = 0; i < 90; i++) d.push(null);
  for (let i = 1; i <= 10; i++) d.push(last + 1000 + (i * 40) / 3.6);
  CASES.longGapResume = { grid: grid(d), note: 'UNKNOWN after gapLongMaxS; no stop episode; no event across the gap' };
}
{
  // 7. stale / duplicated positions: identical coordinates for 6 s inside a 40 km/h drive
  const d: Array<number | null> = profile(hold(40, 30));
  for (let i = 12; i <= 17; i++) d[i] = d[11]!;
  CASES.stalePositions = { grid: grid(d), note: 'FROZEN_POSITION is not evidence; no DIRECT stop, no event' };
}
{
  // 8. trip start with absent buckets and trip end inside a stop
  const v = [...hold(30, 8), ...ramp(30, 0, 5), ...hold(0, 6)];
  const d: Array<number | null> = [null, null, null, ...profile(v)];
  CASES.tripBoundaries = { grid: grid(d), note: 'UNKNOWN at start; open-ended episode at the end' };
}
{
  // 9. BUG-2: stop with numeric speed, then drive-off at 36 km/h with positions every 3rd second only
  const d: Array<number | null> = [];
  for (let i = 0; i < 12; i++) d.push(i * 0.3);
  let x = d[d.length - 1]!;
  for (let i = 0; i < 30; i++) {
    x += 10;
    d.push(i % 3 === 0 ? x : null);
  }
  CASES.bug2SparseDriveOff = { grid: grid(d), note: 'baseline oscillates STARTING→STATIONARY; V0.3 does not' };
}

describe('EXP021 review — robustness cases', () => {
  it('1. constant drive with short outages: no events, no stop episodes (all variants)', () => {
    const g = CASES.constantWithOutages!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, eps } = chain(g, fo);
      expect(eps).toHaveLength(0);
      for (const [, eo] of EVENT_VARIANTS) expect(events(c4, eo)).toHaveLength(0);
    }
  });

  it('2. brake-stop-restart: exactly one episode starting within the stop, one DECEL and one ACCEL', () => {
    const g = CASES.brakeStopRestart!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, eps } = chain(g, fo);
      expect(eps).toHaveLength(1);
      const stopFrom = 15;
      const stopTo = 24;
      const start = (Date.parse(eps[0]!.startLatest) - T0) / 1000;
      expect(start).toBeGreaterThanOrEqual(stopFrom - 1);
      expect(start).toBeLessThanOrEqual(stopTo);
      expect(eps[0]!.openEnd).toBe(false);
      for (const [, eo] of EVENT_VARIANTS) {
        const ev = events(c4, eo);
        expect(ev.map((e) => e.kind)).toEqual(['DECELERATION', 'ACCELERATION']);
        expect(ev.every((e) => e.quality !== 'ARTEFACT_SUSPECT')).toBe(true);
      }
    }
  });

  it('3. creep / stop-and-go: states identical between BASE and V0.3; V0.3 flags hysteresis-band creep', () => {
    const g = CASES.creepStopAndGo!.grid;
    const base = chain(g, MOTION_FSM_FABLE_V0_2_OPTIONS);
    const cand = chain(g, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
    expect(cand.fsm.map((l) => l.state)).toEqual(base.fsm.map((l) => l.state));
    const creepLabels = cand.fsm.filter((l) => l.speedKmh != null && l.speedKmh >= 3 && l.speedKmh < 5);
    expect(creepLabels.length).toBeGreaterThan(0);
    const flagged = cand.fsm.filter((l) => l.flags.includes('HYSTERESIS_BAND_CREEP_POSSIBLE'));
    expect(flagged.length).toBeGreaterThan(0);
    expect(base.fsm.some((l) => l.flags.includes('HYSTERESIS_BAND_CREEP_POSSIBLE'))).toBe(false);
    // the stop-side states during creep are never claimed DIRECT from C4 under V0.3 unless quality OK
    for (const l of cand.fsm) {
      if (l.evidenceQuality === 'DIRECT' && l.speedKmh != null) expect(l.speedQuality).toBe('OK');
    }
  });

  it('4. strong real speed change is preserved (OK quality, not ARTEFACT_SUSPECT, Δv ≥ 40 km/h)', () => {
    const { c4 } = chain(CASES.strongRealChange!.grid, MOTION_FSM_FABLE_V0_2_OPTIONS);
    for (const [, eo] of EVENT_VARIANTS) {
      const ev = events(c4, eo);
      const acc = ev.find((e) => e.kind === 'ACCELERATION')!;
      const dec = ev.find((e) => e.kind === 'DECELERATION')!;
      expect(acc.deltaKmh).toBeGreaterThanOrEqual(40);
      expect(dec.deltaKmh).toBeGreaterThanOrEqual(40);
      expect(acc.quality).toBe('OK');
      expect(dec.quality).toBe('OK');
    }
  });

  it('5a. timing jitter on a constant drive: emitted events are never OK quality; no stop episode', () => {
    const g = CASES.timingJitter!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, eps } = chain(g, fo);
      expect(eps).toHaveLength(0);
      for (const [, eo] of EVENT_VARIANTS) {
        const ev = events(c4, eo);
        // symmetric stamp shift produces an ACCEL+DECEL pair; K3 exempts it (opposite event follows) —
        // documented limitation: only single-sided spikes become ARTEFACT_SUSPECT
        for (const e of ev) expect(e.quality).not.toBe('OK');
      }
    }
  });

  it('5b. GPS jump: outlier rejected, no event, no stop', () => {
    const g = CASES.gpsJump!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, eps } = chain(g, fo);
      expect(c4[12]!.quality).toBe('OUTLIER_REJECTED');
      expect(eps).toHaveLength(0);
      for (const [, eo] of EVENT_VARIANTS) expect(events(c4, eo)).toHaveLength(0);
    }
  });

  it('6. long gap while moving: UNKNOWN after gapLongMaxS, no stop, no event across the gap', () => {
    const g = CASES.longGapResume!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, fsm, eps } = chain(g, fo);
      expect(eps).toHaveLength(0);
      expect(fsm[10 + MOTION_FSM_PARAMS_V0_2_DEV.gapLongMaxS + 1]!.state).toBe('UNKNOWN');
      for (const [, eo] of EVENT_VARIANTS) expect(events(c4, eo)).toHaveLength(0);
    }
  });

  it('7. stale / duplicated positions: FROZEN_POSITION, no DIRECT stop evidence, no event', () => {
    const g = CASES.stalePositions!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { c4, fsm } = chain(g, fo);
      expect(c4.slice(11, 18).every((s) => s.quality === 'FROZEN_POSITION')).toBe(true);
      expect(fsm.some((l) => l.state === 'STATIONARY' && l.evidenceQuality === 'DIRECT')).toBe(false);
      for (const [, eo] of EVENT_VARIANTS) expect(events(c4, eo)).toHaveLength(0);
    }
  });

  it('8. trip boundaries: UNKNOWN at start, open-ended episode at end with boundary flag', () => {
    const g = CASES.tripBoundaries!.grid;
    for (const [, fo] of FSM_VARIANTS) {
      const { fsm, eps } = chain(g, fo);
      expect(fsm[0]!.state).toBe('UNKNOWN');
      expect(fsm[fsm.length - 1]!.flags).toContain('OPEN_END_GRID_BOUNDARY');
      expect(eps).toHaveLength(1);
      expect(eps[0]!.openEnd).toBe(true);
      expect(eps[0]!.endEarliest).toBeNull();
    }
  });

  it('9. BUG-2 regression: sparse-position drive-off — baseline emits bogus STATIONARY runs, V0.3 does not', () => {
    const g = CASES.bug2SparseDriveOff!.grid;
    const base = chain(g, MOTION_FSM_FABLE_V0_2_OPTIONS);
    const cand = chain(g, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
    // counterexample on the Fable path (also reproduced by the Python prototype via parity)
    expect(base.eps.length).toBeGreaterThan(1);
    const bogus = base.eps.filter((e) => (Date.parse(e.startLatest) - T0) / 1000 >= 12);
    expect(bogus.length).toBeGreaterThanOrEqual(5);
    expect(bogus.every((e) => e.minDurationS <= 1)).toBe(true);
    // candidate: exactly the real stop; drive-off resolves to MOVING
    expect(cand.eps).toHaveLength(1);
    expect(cand.fsm.slice(16).every((l) => l.state === 'MOVING' || l.state === 'STARTING')).toBe(true);
    // K-A alone is sufficient for this case
    const ka = chain(g, {
      staleSpeedContextFix: true,
      startingTimeout: false,
      evidencePropagation: false,
      frozenLegacySparsePointAuthority: false,
      retrospectiveGapBridgeV1: false,
    });
    expect(ka.eps).toHaveLength(1);
    expect(motionFsmVersionId(MOTION_FSM_V0_3_CANDIDATE_OPTIONS)).toContain('V0_3_CAND');
    // the Fable path is byte-identical through the wrapper
    expect(runMotionFsmV02(g, base.c4, 'CAUSAL').map(fsmSig)).toEqual(base.fsm.map(fsmSig));
  });

  it('10. K-B STARTING timeout: position-only drive-off without numeric speed resolves to MOVING after startingMaxS', () => {
    // stop (explicit zero speeds) then 10 m/s displacement per second with no usable speed sample
    const d: number[] = [];
    for (let i = 0; i < 8; i++) d.push(i * 0.2);
    let x = d[d.length - 1]!;
    for (let i = 0; i < 12; i++) {
      x += 10;
      d.push(x);
    }
    const g = grid(d);
    const speeds: MotionCoreSpeedSample[] = g.map((b, i) => ({
      label: b.bucketLabelUtc,
      valueKmh: i < 8 ? 0 : null,
      quality: i < 8 ? 'OK' : 'NO_SUPPORT',
      supportLabels: [],
      supportSpanS: null,
      flags: [],
      estimator: 'TEST',
    }));
    const base = runMotionFsm(g, speeds, 'CAUSAL', null, undefined, MOTION_FSM_FABLE_V0_2_OPTIONS);
    const kb = runMotionFsm(g, speeds, 'CAUSAL', null, undefined, {
      staleSpeedContextFix: false,
      startingTimeout: true,
      evidencePropagation: false,
      frozenLegacySparsePointAuthority: false,
      retrospectiveGapBridgeV1: false,
    });
    // baseline: STARTING never resolves (declared startingMaxS unused)
    expect(base.slice(8).every((l) => l.state === 'STARTING')).toBe(true);
    // K-B: resolves after startingMaxS labels, then stays MOVING
    const firstMoving = kb.findIndex((l) => l.state === 'MOVING');
    expect(firstMoving).toBe(8 + MOTION_FSM_PARAMS_V0_2_DEV.startingMaxS - 1);
    expect(kb[firstMoving]!.reason).toBe('starting_timeout_resolved_moving');
    expect(kb.slice(firstMoving).every((l) => l.state === 'MOVING')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Invariants over all cases and variants
// ---------------------------------------------------------------------------------------------

describe('EXP021 review — invariants (all synthetic cases × variants)', () => {
  const entries = Object.entries(CASES);

  it('I1 repeated processing is identical', () => {
    for (const [, c] of entries) {
      for (const [, fo] of FSM_VARIANTS) {
        const a = chain(c.grid, fo);
        const b = chain(c.grid, fo);
        expect(JSON.stringify(b.fsm)).toBe(JSON.stringify(a.fsm));
        expect(JSON.stringify(b.eps)).toBe(JSON.stringify(a.eps));
        for (const [, eo] of EVENT_VARIANTS) {
          expect(JSON.stringify(events(b.c4, eo))).toBe(JSON.stringify(events(a.c4, eo)));
        }
      }
    }
  });

  it('I2 no STATIONARY run beyond gapLongMaxS without evidence', () => {
    for (const [, c] of entries) {
      for (const [, fo] of FSM_VARIANTS) {
        const { fsm } = chain(c.grid, fo);
        expect(longestUnobservedStationaryRun(fsm)).toBeLessThanOrEqual(MOTION_FSM_PARAMS_V0_2_DEV.gapLongMaxS);
      }
    }
  });

  it('I3 CAUSAL chain output at label t is final once inputs up to t + C4 full horizon exist (no silent future use)', () => {
    const H = MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S;
    for (const [, c] of entries) {
      for (const [, fo] of FSM_VARIANTS) {
        const full = chain(c.grid, fo, 'CAUSAL').fsm.map(fsmSig);
        for (let cut = 8; cut < c.grid.length; cut++) {
          const trunc = chain(c.grid.slice(0, cut + 1), fo, 'CAUSAL').fsm.map(fsmSig);
          for (let i = 0; i <= cut - H; i++) {
            expect(trunc[i]).toBe(full[i]);
          }
        }
      }
    }
  });

  it('I4 observedMinDurationS never exceeds minDurationS and counts add up per episode', () => {
    for (const [, c] of entries) {
      for (const [, fo] of FSM_VARIANTS) {
        for (const mode of ['CAUSAL', 'RETROSPECTIVE'] as const) {
          for (const e of chain(c.grid, fo, mode).eps) {
            expect(e.observedMinDurationS).toBeLessThanOrEqual(e.minDurationS);
            expect(e.observedLabels + e.gapLabels).toBe(e.labels);
            expect(e.directLabels + e.inferredLabels + e.indeterminateLabels).toBe(e.labels);
          }
        }
      }
    }
  });

  it('I5 V0.3 never claims DIRECT from a non-OK C4 value without a vehicle-speed sample', () => {
    for (const [, c] of entries) {
      const { fsm } = chain(c.grid, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
      for (const l of fsm) {
        if (l.evidenceQuality === 'DIRECT' && l.speedKmh != null && l.sparseSpeedKmh == null) {
          expect(l.speedQuality).toBe('OK');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// K3 unit behaviour on hand-made speed series
// ---------------------------------------------------------------------------------------------

describe('EXP021 review — K3 spike reversion on explicit speed series', () => {
  const series = (vals: Array<[number, number | null, string?]>): MotionCoreSpeedSample[] =>
    vals.map(([i, v, q]) => ({
      label: lab(i),
      valueKmh: v,
      quality: (v == null ? 'NO_POSITION' : (q ?? 'OK')) as MotionCoreSpeedSample['quality'],
      supportLabels: [],
      supportSpanS: null,
      flags: [],
      estimator: 'TEST',
    }));

  it('single-sided spike (Tesla pattern): baseline DEGRADED ACCEL → K3 ARTEFACT_SUSPECT with flag', () => {
    const s = series([
      [0, 44], [1, 44], [2, 44], [3, 44], [4, 44.6], [5, 44.4], [6, 43.8],
      [7, 51.1, 'JITTER_SUSPECT'], [8, 56.2, 'JITTER_SUSPECT'], [9, null], [10, 43.2, 'SPARSE_SUPPORT'], [11, 40.1, 'SPARSE_SUPPORT'], [12, 40], [13, 40],
    ]);
    const base = events(s, MOTION_EVENT_FABLE_V0_1_OPTIONS);
    const k3 = events(s, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    expect(base).toHaveLength(1);
    expect(base[0]!.kind).toBe('ACCELERATION');
    expect(base[0]!.quality).toBe('DEGRADED');
    expect(k3).toHaveLength(1);
    expect(k3[0]!.quality).toBe('ARTEFACT_SUSPECT');
    expect(k3[0]!.flags.some((f) => f.startsWith('SPIKE_REVERSION_WITHIN_2S='))).toBe(true);
    expect(k3[0]!.algorithmVersion).toContain('spikeReversionCheck');
    expect(base[0]!.algorithmVersion).not.toContain('spikeReversionCheck');
  });

  it('real accel immediately followed by real decel: both kept, accel flagged as explained, nothing suspect', () => {
    const s = series([
      [0, 40], [1, 40], [2, 40], [3, 40], [4, 47], [5, 54], [6, 60], [7, 50], [8, 41], [9, 40], [10, 40], [11, 40],
    ]);
    const k3 = events(s, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    expect(k3.map((e) => e.kind)).toEqual(['ACCELERATION', 'DECELERATION']);
    expect(k3.every((e) => e.quality === 'OK')).toBe(true);
    expect(k3[0]!.flags).toContain('REVERSION_EXPLAINED_BY_OPPOSITE_EVENT');
  });

  it('sustained real acceleration is untouched by K3', () => {
    const s = series([[0, 30], [1, 30], [2, 30], [3, 36], [4, 42], [5, 48], [6, 54], [7, 54], [8, 54], [9, 54]]);
    const base = events(s, MOTION_EVENT_FABLE_V0_1_OPTIONS);
    const k3 = events(s, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    expect(k3.map((e) => `${e.kind}|${e.quality}|${e.startLabel}|${e.endLabel}`)).toEqual(
      base.map((e) => `${e.kind}|${e.quality}|${e.startLabel}|${e.endLabel}`),
    );
    expect(k3[0]!.quality).toBe('OK');
  });

  it('reversion across a segment break (> maxGapS) is not checked (no cross-gap claim)', () => {
    const s = series([[0, 40], [1, 40], [2, 40], [3, 46], [4, 52], [5, null], [6, null], [7, null], [8, 40], [9, 40], [10, 40]]);
    const k3 = events(s, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    expect(k3).toHaveLength(1);
    expect(k3[0]!.quality).toBe('OK');
  });
});
