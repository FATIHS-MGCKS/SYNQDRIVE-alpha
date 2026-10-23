import {
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS,
  runMotionFsm,
  type MotionFsmGapBridgeAuxiliary,
  type MotionFsmLabel,
} from '../kinematics/motion-fsm';
import {
  applyMotionFsmGapBridgeV1PostPass,
  gapBridgeV1LongSpanAllowed,
} from '../kinematics/motion-fsm-gap-bridge-v1';
import { parseBucketLabelMs } from '../kinematics/motion-core-grid';

function secSinceEpoch(lab: string): number {
  return Math.floor(parseBucketLabelMs(lab) / 1000);
}
import type { MotionCorePositionBucket } from '../kinematics/motion-core-grid';
import type { MotionCoreSpeedSample } from '../kinematics/speed-sample.types';

function label(sec: number): string {
  return `2026-01-01T10:00:${String(sec).padStart(2, '0')}Z`;
}

function present(lat: number, lon: number, sec: number): MotionCorePositionBucket {
  return {
    bucketLabelUtc: label(sec),
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
  };
}

function absent(sec: number): MotionCorePositionBucket {
  return { bucketLabelUtc: label(sec), availability: 'ROW_ABSENT', latitude: null, longitude: null };
}

function okSpeed(sec: number, kmh: number): MotionCoreSpeedSample {
  return {
    label: label(sec),
    valueKmh: kmh,
    quality: 'OK',
    estimator: 'C4',
    supportLabels: [],
    supportSpanS: null,
    flags: [],
  };
}

function frozenSample(sec: number): MotionCoreSpeedSample {
  return {
    label: label(sec),
    valueKmh: null,
    quality: 'FROZEN_POSITION',
    estimator: 'C4',
    supportLabels: [],
    supportSpanS: null,
    flags: [],
  };
}

function noPos(sec: number): MotionCoreSpeedSample {
  return {
    label: label(sec),
    valueKmh: null,
    quality: 'NO_POSITION',
    estimator: 'C4',
    supportLabels: [],
    supportSpanS: null,
    flags: [],
  };
}

describe('motion-fsm gap bridge V1', () => {
  const p = MOTION_FSM_PARAMS_V0_2_DEV;

  it('gapBridgeV1LongSpanAllowed blocks low implied speed on long spans (19:03-style)', () => {
    const left = {
      state: 'STARTING',
      evidenceQuality: 'INFERRED',
    } as MotionFsmLabel;
    const right = {
      state: 'MOVING',
      evidenceQuality: 'INFERRED',
    } as MotionFsmLabel;
    expect(gapBridgeV1LongSpanAllowed(27, 8.2, left, right, p)).toBe(false);
    expect(gapBridgeV1LongSpanAllowed(8, 61, { ...left, state: 'MOVING' }, right, p)).toBe(true);
  });

  it('flag OFF: V0_3 signature unchanged vs pre-pass-only forward labels', () => {
    const grid = [0, 1, 2, 3, 4].map((s) => present(48 + s * 0.0001, 11, s));
    const speeds = [0, 1, 2, 3, 4].map((s) => okSpeed(s, 30));
    const a = runMotionFsm(grid, speeds, 'RETROSPECTIVE', null, p, MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
    const b = runMotionFsm(grid, speeds, 'RETROSPECTIVE', null, p, MOTION_FSM_V0_3_CANDIDATE_OPTIONS, {
      stationarySupportedLabels: new Set([label(2)]),
    });
    expect(a.map((x) => [x.state, x.evidenceQuality, x.reason])).toEqual(
      b.map((x) => [x.state, x.evidenceQuality, x.reason]),
    );
  });

  it('bridges UNKNOWN when cruise displacement is implied and embedded stop absent', () => {
    const grid: MotionCorePositionBucket[] = [];
    const speeds: MotionCoreSpeedSample[] = [];
    for (let s = 0; s <= 12; s++) {
      grid.push(present(48 + s * 0.00025, 11, s));
      speeds.push(s >= 4 && s <= 7 ? noPos(s) : okSpeed(s, 40));
    }
    const mk = (sec: number, state: MotionFsmLabel['state']): MotionFsmLabel => ({
      label: label(sec),
      state,
      evidenceQuality: state === 'UNKNOWN' ? 'INDETERMINATE' : 'INFERRED',
      reason: 'test',
      speedKmh: null,
      positionPresent: true,
      mode: 'RETROSPECTIVE',
      flags: [],
      sparseSpeedKmh: null,
      sparseFsmPointAuthority: false,
      speedQuality: null,
    });
    const movingDirect = [0, 1, 2, 3, 8, 9, 10, 11, 12].map((s) => ({
      ...mk(s, 'MOVING'),
      evidenceQuality: 'DIRECT' as const,
      speedKmh: 40,
      reason: 'speed_above_moving_band',
    }));
    const forward: MotionFsmLabel[] = [
      ...movingDirect,
      ...[4, 5, 6, 7].map((s) => mk(s, 'UNKNOWN')),
    ];
    forward.sort((a, b) => secSinceEpoch(a.label) - secSinceEpoch(b.label));
    const bridged = applyMotionFsmGapBridgeV1PostPass(forward, grid, speeds, undefined, p);
    for (const s of [4, 5, 6, 7]) {
      const row = bridged.find((l) => l.label === label(s));
      expect(row?.state).toBe('MOVING');
      expect(row?.speedKmh).toBeNull();
      expect(row?.reason).toBe('retro_gap_bridge_endpoint_displacement');
    }
  });

  it('rejects bridge when embedded halt: stationary-supported inside window', () => {
    const grid = [0, 1, 2, 3, 4, 5, 6].map((s) => present(48 + s * 0.0002, 11, s));
    const speeds = grid.map((b, s) => (s === 3 ? frozenSample(s) : okSpeed(s, 35)));
    const aux: MotionFsmGapBridgeAuxiliary = { stationarySupportedLabels: new Set([label(3)]) };
    const forward: MotionFsmLabel[] = [0, 1, 2, 4, 5, 6].map((s) => ({
      label: label(s),
      state: 'MOVING',
      evidenceQuality: 'INFERRED',
      reason: 'test',
      speedKmh: 35,
      positionPresent: true,
      mode: 'RETROSPECTIVE',
      flags: [],
      sparseSpeedKmh: null,
      sparseFsmPointAuthority: false,
      speedQuality: 'OK',
    }));
    forward.splice(
      3,
      0,
      {
        label: label(3),
        state: 'UNKNOWN',
        evidenceQuality: 'INDETERMINATE',
        reason: 'test',
        speedKmh: null,
        positionPresent: true,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'FROZEN_POSITION',
      },
    );
    const bridged = applyMotionFsmGapBridgeV1PostPass(forward, grid, speeds, aux, p);
    const mid = bridged.find((l) => l.label === label(3))?.state;
    expect(mid).not.toBe('MOVING');
    expect(['UNKNOWN', 'STOP_CANDIDATE', 'STATIONARY']).toContain(mid);
  });

  it('frozen stand in UNKNOWN requires STATIONARY_SUPPORTED aux and PRESENT bucket (not ROW_ABSENT)', () => {
    const grid = [absent(0), present(48, 11, 1), present(48, 11, 2), present(48, 11, 3)];
    const speeds = [noPos(0), frozenSample(1), frozenSample(2), frozenSample(3)];
    const aux: MotionFsmGapBridgeAuxiliary = { stationarySupportedLabels: new Set([label(1), label(2), label(3)]) };
    const forward: MotionFsmLabel[] = [
      {
        label: label(0),
        state: 'UNKNOWN',
        evidenceQuality: 'INDETERMINATE',
        reason: 'gap_without_context',
        speedKmh: null,
        positionPresent: false,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: null,
      },
      {
        label: label(1),
        state: 'UNKNOWN',
        evidenceQuality: 'INDETERMINATE',
        reason: 'gap_without_context',
        speedKmh: null,
        positionPresent: false,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'FROZEN_POSITION',
      },
      {
        label: label(2),
        state: 'UNKNOWN',
        evidenceQuality: 'INDETERMINATE',
        reason: 'gap_without_context',
        speedKmh: null,
        positionPresent: false,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'FROZEN_POSITION',
      },
      {
        label: label(3),
        state: 'MOVING',
        evidenceQuality: 'DIRECT',
        reason: 'speed_above_moving_band',
        speedKmh: 20,
        positionPresent: true,
        mode: 'RETROSPECTIVE',
        flags: [],
        sparseSpeedKmh: null,
        sparseFsmPointAuthority: false,
        speedQuality: 'OK',
      },
    ];
    const out = applyMotionFsmGapBridgeV1PostPass(forward, grid, speeds, aux, p);
    expect(out[0]!.state).toBe('UNKNOWN');
    expect(out[1]!.state).toBe('STOP_CANDIDATE');
    expect(out[2]!.state).toBe('STOP_CANDIDATE');
  });
});
