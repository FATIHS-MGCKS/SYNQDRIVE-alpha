import { createHash } from 'node:crypto';
import {
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS,
  runMotionFsm,
} from '../kinematics/motion-fsm';
import {
  applyMotionFsmGapBridgeV1PostPass,
  gapBridgeV1StopFeasibilityAllowsBridge,
} from '../kinematics/motion-fsm-gap-bridge-v1';
import { computeC4AdaptiveL3 } from '../kinematics/c4-adaptive-l3';
import { withImplausibleLegEndpointsQuarantined } from '../kinematics/leg-consistency';
import type { MotionCorePositionBucket } from '../kinematics/motion-core-grid';
import type { MotionCoreSpeedSample } from '../kinematics/speed-sample.types';
import type { MotionFsmLabel } from '../kinematics/motion-fsm';

const p = MOTION_FSM_PARAMS_V0_2_DEV;
const LAT = 51.0;
const M_PER_DEG_LON = 111320 * Math.cos((LAT * Math.PI) / 180);
const base = Date.parse('2026-01-01T10:00:00Z');
const lab = (s: number) => new Date(base + s * 1000).toISOString().replace('.000Z', 'Z');

function norm(p: number | { v: number; a?: 'P' | 'R' | 'N' }): { v: number; a: 'P' | 'R' | 'N' } {
  if (typeof p === 'number') {
    return { v: p, a: 'P' };
  }
  return { v: p.v ?? 0, a: p.a ?? 'P' };
}

function buildProfile(profile: Array<number | { v: number; a?: 'P' | 'R' | 'N' }>): MotionCorePositionBucket[] {
  let x = 0;
  const buckets: MotionCorePositionBucket[] = [];
  for (let s = 0; s < profile.length; s++) {
    const cur = norm(profile[s]);
    if (s > 0) {
      x += (norm(profile[s - 1]).v + cur.v) / 2;
    }
    if (cur.a === 'R') {
      buckets.push({ bucketLabelUtc: lab(s), availability: 'ROW_ABSENT', latitude: null, longitude: null });
    } else if (cur.a === 'N') {
      buckets.push({ bucketLabelUtc: lab(s), availability: 'SIGNAL_NULL', latitude: null, longitude: null });
    } else {
      buckets.push({
        bucketLabelUtc: lab(s),
        availability: 'PRESENT',
        latitude: LAT,
        longitude: x / M_PER_DEG_LON,
      });
    }
  }
  return buckets;
}

function absentV(n: number, v: number) {
  return Array.from({ length: n }, () => ({ v, a: 'R' as const }));
}

function cruise(n: number, v: number) {
  return Array.from({ length: n }, () => v);
}

function hiddenStopProfile(vKmh: number, aDec: number, stopS: number) {
  const v = vKmh / 3.6;
  const dec: number[] = [];
  for (let u = v - aDec; u > 0; u -= aDec) {
    dec.push(u);
  }
  const acc = [...dec].reverse();
  const hidden = [...dec, ...cruise(stopS, 0), ...acc];
  return [...cruise(20, v), ...hidden.map((x) => ({ v: x, a: 'R' as const })), ...cruise(20, v)];
}

function fsmSig(labels: MotionFsmLabel[]): string {
  return createHash('sha256')
    .update(JSON.stringify(labels.map((l) => [l.label, l.state, l.evidenceQuality, l.reason, l.speedKmh, l.flags])))
    .digest('hex');
}

describe('motion-fsm gap bridge V1 safety (B2/B3)', () => {
  it('gapBridgeV1StopFeasibilityAllowsBridge accepts TIG22-class displacement', () => {
    expect(gapBridgeV1StopFeasibilityAllowsBridge(202.5, 12, 68.3, 64.7, p)).toBe(true);
  });

  it('rejects hidden embedded stops at 50–100 km/h anchors (ROW_ABSENT, integrated motion)', () => {
    const cases: Array<{ v: number; aDec: number; stopS: number }> = [];
    for (const v of [50, 70, 100]) {
      for (const aDec of [2, 3]) {
        for (const stopS of [5, 10, 20]) {
          cases.push({ v, aDec, stopS });
        }
      }
    }
    for (const v of [30]) {
      for (const aDec of [2, 3]) {
        for (const stopS of [5, 10, 20]) {
          cases.push({ v, aDec, stopS });
        }
      }
    }
    for (const { v, aDec, stopS } of cases) {
      const buckets = buildProfile(hiddenStopProfile(v, aDec, stopS));
      const kin = withImplausibleLegEndpointsQuarantined(buckets);
      const c4 = computeC4AdaptiveL3(buckets);
      const on = runMotionFsm(kin, c4, 'RETROSPECTIVE', null, p, MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS);
      const bridged = on.filter((l) => l.flags.some((f) => f.startsWith('GAP_BRIDGE_V1_BRIDGE')));
      expect(bridged.length).toBe(0);
    }
  });

  it('FROZEN_POSITION inside UNKNOWN window vetoes bridge without aux', () => {
    const buckets = buildProfile([...cruise(15, 50 / 3.6), ...absentV(8, 50 / 3.6), ...cruise(15, 50 / 3.6)]);
    buckets[20] = {
      bucketLabelUtc: lab(20),
      availability: 'PRESENT',
      latitude: LAT,
      longitude: buckets[19]!.longitude!,
    };
    buckets[21] = {
      bucketLabelUtc: lab(21),
      availability: 'PRESENT',
      latitude: LAT,
      longitude: buckets[19]!.longitude!,
    };
    const kin = withImplausibleLegEndpointsQuarantined(buckets);
    const speeds: MotionCoreSpeedSample[] = buckets.map((b, s) => ({
      label: b.bucketLabelUtc,
      valueKmh: s < 15 || s > 28 ? 50 : null,
      quality: s === 20 || s === 21 ? 'FROZEN_POSITION' : s >= 15 && s <= 28 ? 'NO_POSITION' : 'OK',
      estimator: 'C4',
      supportLabels: [],
      supportSpanS: null,
      flags: [],
    }));
    const forward: MotionFsmLabel[] = buckets.map((b, s) => ({
      label: b.bucketLabelUtc,
      state: s >= 15 && s <= 28 ? 'UNKNOWN' : 'MOVING',
      evidenceQuality: s >= 15 && s <= 28 ? 'INDETERMINATE' : 'DIRECT',
      reason: s >= 15 && s <= 28 ? 'gap' : 'speed_above_moving_band',
      speedKmh: s >= 15 && s <= 28 ? null : 50,
      positionPresent: b.availability === 'PRESENT',
      mode: 'RETROSPECTIVE',
      flags: [],
      sparseSpeedKmh: null,
      sparseFsmPointAuthority: false,
      speedQuality: null,
    }));
    const out = applyMotionFsmGapBridgeV1PostPass(forward, kin, speeds, undefined, p);
    expect(out.filter((l) => l.state === 'MOVING' && l.reason === 'retro_gap_bridge_endpoint_displacement').length).toBe(
      0,
    );
  });

  it('CAUSAL mode unchanged with gap-bridge flag ON', () => {
    const buckets = buildProfile([...cruise(15, 50 / 3.6), ...absentV(8, 50 / 3.6), ...cruise(15, 50 / 3.6)]);
    const kin = withImplausibleLegEndpointsQuarantined(buckets);
    const c4 = computeC4AdaptiveL3(buckets);
    const off = runMotionFsm(kin, c4, 'CAUSAL', null, p, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
    const on = runMotionFsm(kin, c4, 'CAUSAL', null, p, MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS);
    expect(fsmSig(off)).toBe(fsmSig(on));
  });

  it('flag OFF parity with aux passed (V0_3)', () => {
    const buckets = buildProfile([...cruise(15, 50 / 3.6), ...absentV(8, 50 / 3.6), ...cruise(15, 50 / 3.6)]);
    const kin = withImplausibleLegEndpointsQuarantined(buckets);
    const c4 = computeC4AdaptiveL3(buckets);
    const a = runMotionFsm(kin, c4, 'RETROSPECTIVE', null, p, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
    const b = runMotionFsm(kin, c4, 'RETROSPECTIVE', null, p, MOTION_FSM_V0_3_CANDIDATE_OPTIONS, {
      stationarySupportedLabels: new Set([lab(5)]),
    });
    expect(fsmSig(a)).toBe(fsmSig(b));
  });

  it('does not carry frozen stopObs across long UNKNOWN without aux', () => {
    const grid: MotionCorePositionBucket[] = [
      { bucketLabelUtc: lab(0), availability: 'PRESENT', latitude: LAT, longitude: 0 },
      ...Array.from({ length: 30 }, (_, k) => ({
        bucketLabelUtc: lab(k + 1),
        availability: 'ROW_ABSENT' as const,
        latitude: null,
        longitude: null,
      })),
      { bucketLabelUtc: lab(31), availability: 'PRESENT', latitude: LAT, longitude: 0 },
    ];
    const speeds: MotionCoreSpeedSample[] = grid.map((b, i) => ({
      label: b.bucketLabelUtc,
      valueKmh: null,
      quality: i === 31 ? 'FROZEN_POSITION' : 'NO_POSITION',
      estimator: 'C4',
      supportLabels: [],
      supportSpanS: null,
      flags: [],
    }));
    const forward: MotionFsmLabel[] = [
      {
        label: lab(0),
        state: 'STATIONARY',
        evidenceQuality: 'DIRECT',
        reason: 'x',
        speedKmh: 0,
        positionPresent: true,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'OK',
      },
      ...Array.from({ length: 30 }, (_, k) => ({
        label: lab(k + 1),
        state: 'UNKNOWN' as const,
        evidenceQuality: 'INDETERMINATE' as const,
        reason: 'gap',
        speedKmh: null,
        positionPresent: false,
        mode: 'RETROSPECTIVE' as const,
        flags: [] as string[],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: null,
      })),
      {
        label: lab(31),
        state: 'UNKNOWN',
        evidenceQuality: 'INDETERMINATE',
        reason: 'gap',
        speedKmh: null,
        positionPresent: true,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'FROZEN_POSITION',
      },
    ];
    const out = applyMotionFsmGapBridgeV1PostPass(forward, grid, speeds, {
      stationarySupportedLabels: new Set([lab(31)]),
    }, p);
    expect(out[31]!.state).toBe('STOP_CANDIDATE');
    expect(out[31]!.reason).toBe('frozen_stationary_supported_observing');
  });
});
