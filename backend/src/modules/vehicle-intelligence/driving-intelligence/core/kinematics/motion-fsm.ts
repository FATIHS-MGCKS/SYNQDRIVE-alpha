import { haversineMeters } from '../geo/haversine';
import {
  bucketLabelPlusSeconds,
  orderMotionCoreGrid,
  parseBucketLabelMs,
  presentBucketMap,
  type MotionCorePositionBucket,
} from './motion-core-grid';
import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';

/** Port of Fable prototype `motion_fsm.PARAMS` — not tuned on Tesla trips. */
export const MOTION_FSM_PARAMS_V0_2_DEV = {
  version: 'MOTION_FSM_V0_2_DEV',
  stationaryBandMaxKmh: 3.0,
  movingBandMinKmh: 5.0,
  stopConfirmS: 3,
  gapShortMaxS: 3,
  gapLowSpeedContextKmh: 10.0,
  gapLongMaxS: 60,
  reappearNoiseM: 3.0,
  startingMaxS: 5,
  lookaheadS: 5,
} as const;

export type MotionFsmMode = 'CAUSAL' | 'RETROSPECTIVE';

export type MotionFsmState =
  | 'MOVING'
  | 'STOP_CANDIDATE'
  | 'STATIONARY'
  | 'STARTING'
  | 'UNKNOWN';

export type MotionFsmEvidenceQuality = 'DIRECT' | 'INFERRED' | 'INDETERMINATE';

export interface MotionFsmLabel {
  label: string;
  state: MotionFsmState;
  evidenceQuality: MotionFsmEvidenceQuality;
  reason: string;
  speedKmh: number | null;
  positionPresent: boolean;
  mode: MotionFsmMode;
  flags: string[];
}

export interface MotionFsmStopEpisode {
  trip: number;
  mode: MotionFsmMode;
  startEarliest: string;
  startLatest: string;
  endEarliest: string | null;
  endLatest: string | null;
  minDurationS: number;
  maxDurationS: number | null;
  evidenceQuality: MotionFsmEvidenceQuality;
  openEnd: boolean;
  labels: number;
}

export interface SparseVehicleSpeedSample {
  label: string;
  speedKmh: number;
}

const FSM_NUMERIC_SPEED_QUALITIES: ReadonlySet<MotionCoreSpeedQuality | string> = new Set([
  'OK',
  'SPARSE_SUPPORT',
  'JITTER_SUSPECT',
  'REPAIRED',
  'SPAN_SUPPORT',
  'SPAN_DERIVED',
]);

function secSinceEpoch(label: string): number {
  return Math.floor(parseBucketLabelMs(label) / 1000);
}

function isStopSideState(s: MotionFsmState): boolean {
  return s === 'STATIONARY' || s === 'STOP_CANDIDATE';
}

function speedValueForFsm(s: MotionCoreSpeedSample | undefined): number | null {
  if (!s || s.valueKmh == null) {
    return null;
  }
  if (!FSM_NUMERIC_SPEED_QUALITIES.has(s.quality)) {
    return null;
  }
  return s.valueKmh;
}

/**
 * Temporal motion FSM (Fable V0.2). Specification: exp021-motion-core-design/prototype/motion_fsm.py
 */
export function runMotionFsmV02(
  buckets: MotionCorePositionBucket[],
  speedSamples: MotionCoreSpeedSample[],
  mode: MotionFsmMode,
  sparseSpeed: SparseVehicleSpeedSample[] | null = null,
  params: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
): MotionFsmLabel[] {
  const p = params;
  const ordered = orderMotionCoreGrid(buckets);
  const spBy = new Map(speedSamples.map((s) => [s.label, s]));
  const sparse = new Map((sparseSpeed ?? []).map((s) => [s.label, s.speedKmh]));
  const pres = new Set(
    ordered.filter((b) => b.availability === 'PRESENT').map((b) => b.bucketLabelUtc),
  );

  let state: MotionFsmState = 'UNKNOWN';
  let quality: MotionFsmEvidenceQuality = 'INDETERMINATE';
  let lastSpeed: number | null = null;
  let lastSpeedLabel: string | null = null;
  let lastPos: MotionCorePositionBucket | null = null;
  let gapLen = 0;
  let stopObs = 0;
  let startingLen = 0;
  const out: MotionFsmLabel[] = [];

  const lookaheadReappear = (i: number): [number, number] | null => {
    if (mode !== 'RETROSPECTIVE' || lastPos == null) {
      return null;
    }
    for (let k = 1; k <= p.lookaheadS; k++) {
      if (i + k >= ordered.length) {
        return null;
      }
      const b = ordered[i + k]!;
      if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
        const d = haversineMeters(
          lastPos.latitude!,
          lastPos.longitude!,
          b.latitude,
          b.longitude,
        );
        return [k + gapLen, d];
      }
    }
    return null;
  };

  for (let i = 0; i < ordered.length; i++) {
    const b = ordered[i]!;
    const lab = b.bucketLabelUtc;
    const stateAtTickStart: MotionFsmState = state;
    const s = spBy.get(lab);
    let v = speedValueForFsm(s);
    let present = pres.has(lab);
    const flags: string[] = [];
    let reason = '';

    if (s?.quality === 'FROZEN_POSITION') {
      present = false;
      flags.push('FROZEN_POSITION_TREATED_AS_NO_EVIDENCE');
    }

    const directZero =
      sparse.has(lab) && (sparse.get(lab) ?? p.stationaryBandMaxKmh + 1) <= p.stationaryBandMaxKmh;
    const directMoving =
      sparse.has(lab) && (sparse.get(lab) ?? 0) >= p.movingBandMinKmh;

    if (present && b.latitude != null && b.longitude != null) {
      const disp =
        lastPos && lastPos.latitude != null && lastPos.longitude != null
          ? haversineMeters(lastPos.latitude, lastPos.longitude, b.latitude, b.longitude)
          : null;
      const gapBefore = gapLen;
      gapLen = 0;

      if (v != null) {
        if (v >= p.movingBandMinKmh || directMoving) {
          if (state === 'STATIONARY') {
            state = 'STARTING';
            reason = 'speed_above_moving_band_from_stop';
            startingLen = 1;
          } else if (state === 'STOP_CANDIDATE') {
            state = 'MOVING';
            reason = 'stop_candidate_aborted_speed_above_moving_band';
          } else if (state === 'STARTING') {
            startingLen += 1;
            state = 'MOVING';
            reason = 'starting_resolved_moving';
          } else {
            state = 'MOVING';
            reason = 'speed_above_moving_band';
          }
          quality = 'DIRECT';
          stopObs = 0;
        } else if (v < p.stationaryBandMaxKmh || directZero) {
          stopObs += 1;
          if (state === 'STATIONARY' || stopObs >= p.stopConfirmS) {
            state = 'STATIONARY';
            reason = 'speed_in_stationary_band_confirmed';
          } else {
            state = 'STOP_CANDIDATE';
            reason = 'speed_in_stationary_band_observing';
          }
          quality = directZero || stopObs >= p.stopConfirmS ? 'DIRECT' : 'INFERRED';
        } else {
          if (state === 'MOVING') {
            reason = 'hysteresis_band_keep_moving';
          } else if (state === 'STATIONARY' || state === 'STOP_CANDIDATE') {
            if (disp != null && disp > p.reappearNoiseM) {
              if (state === 'STATIONARY') {
                state = 'STARTING';
                reason = 'displacement_from_stop_in_hysteresis_band';
                startingLen = 1;
              } else {
                state = 'MOVING';
                reason = 'stop_candidate_aborted_displacement';
              }
            } else {
              reason = 'hysteresis_band_keep_stop_state';
            }
          } else {
            state = 'STOP_CANDIDATE';
            reason = 'hysteresis_band_from_unknown';
          }
          quality = 'INFERRED';
        }
        lastSpeed = v;
        lastSpeedLabel = lab;
      } else {
        if (gapBefore > 0 && lastPos != null && disp != null) {
          if (disp <= p.reappearNoiseM) {
            stopObs += 1;
            if (state === 'STATIONARY' || (state === 'STOP_CANDIDATE' && stopObs >= p.stopConfirmS)) {
              state = 'STATIONARY';
              reason = 'reappeared_at_same_place_after_gap';
              quality = 'INFERRED';
            } else {
              state = 'STOP_CANDIDATE';
              reason = 'reappeared_at_same_place_after_gap_unconfirmed';
              quality = 'INFERRED';
            }
          } else {
            const implied = (disp / Math.max(1, gapBefore + 1)) * 3.6;
            if (implied >= p.movingBandMinKmh) {
              state = isStopSideState(stateAtTickStart) ? 'STARTING' : 'MOVING';
              reason = 'displacement_across_gap_implies_motion';
              quality = 'INFERRED';
              flags.push(`implied_mean_speed_kmh=${implied.toFixed(1)}`);
            } else {
              state = 'UNKNOWN';
              reason = 'displacement_across_gap_ambiguous';
              quality = 'INDETERMINATE';
            }
          }
        } else if (disp != null && disp > p.reappearNoiseM) {
          if (state === 'STATIONARY' || state === 'STOP_CANDIDATE') {
            state = 'STARTING';
            reason = 'displacement_from_stop_no_speed';
            quality = 'INFERRED';
          } else if (state === 'UNKNOWN') {
            state = 'MOVING';
            reason = 'displacement_no_speed';
            quality = 'INFERRED';
          } else {
            reason = 'position_only_keep_state';
            quality = 'INFERRED';
          }
        } else if (disp != null) {
          if (state === 'MOVING' || state === 'STARTING') {
            state = 'STOP_CANDIDATE';
            reason = 'no_displacement_no_speed';
            quality = 'INFERRED';
            stopObs = 1;
          } else if (state === 'STOP_CANDIDATE' || state === 'STATIONARY') {
            stopObs += 1;
            if (stopObs >= p.stopConfirmS) {
              state = 'STATIONARY';
            }
            reason = 'no_displacement_observing';
            quality = 'INFERRED';
          } else {
            state = 'STOP_CANDIDATE';
            reason = 'no_displacement_from_unknown';
            quality = 'INFERRED';
          }
        } else {
          state = 'UNKNOWN';
          reason = 'first_position_no_speed';
          quality = 'INDETERMINATE';
        }
        if (directZero) {
          state = 'STATIONARY';
          reason = 'vehicle_speed_sample_zero';
          quality = 'DIRECT';
        }
      }
      if (state === 'STARTING') {
        startingLen += 0;
      }
      lastPos = b;
    } else {
      gapLen += 1;
      if (directZero) {
        state = 'STATIONARY';
        reason = 'vehicle_speed_sample_zero_during_gap';
        quality = 'DIRECT';
        stopObs = p.stopConfirmS;
        gapLen = 0;
      } else if (directMoving) {
        state = state === 'STATIONARY' ? 'STARTING' : 'MOVING';
        reason = 'vehicle_speed_sample_moving_during_gap';
        quality = 'DIRECT';
        startingLen = state === 'STARTING' ? 1 : 0;
        stopObs = 0;
        gapLen = 0;
        lastSpeed = sparse.get(lab)!;
        lastSpeedLabel = lab;
      } else if (gapLen > p.gapLongMaxS) {
        state = 'UNKNOWN';
        reason = 'gap_exceeds_long_max';
        quality = 'INDETERMINATE';
      } else if (state === 'STATIONARY') {
        reason = 'gap_while_stationary_change_triggered_source';
        quality = 'INFERRED';
      } else if (
        state === 'STOP_CANDIDATE' ||
        (lastSpeed != null &&
          lastSpeed < p.gapLowSpeedContextKmh &&
          (state === 'MOVING' || state === 'STARTING'))
      ) {
        stopObs += 1;
        const la = lookaheadReappear(i);
        if (
          la != null &&
          la[1] <= p.reappearNoiseM &&
          la[0] >= p.stopConfirmS
        ) {
          state = 'STATIONARY';
          reason = 'gap_bracketed_low_speed_small_displacement(lookahead)';
          quality = 'INFERRED';
        } else if (la != null && la[1] > p.reappearNoiseM * 3) {
          state = 'UNKNOWN';
          reason = 'gap_low_speed_but_reappears_elsewhere(lookahead)';
          quality = 'INDETERMINATE';
        } else if (stopObs >= p.stopConfirmS) {
          state = 'STATIONARY';
          reason = 'gap_after_low_speed_confirmed_by_duration';
          quality = 'INFERRED';
        } else {
          state = 'STOP_CANDIDATE';
          reason = 'gap_after_low_speed_observing';
          quality = 'INFERRED';
        }
      } else if (state === 'MOVING') {
        if (gapLen <= p.gapShortMaxS) {
          reason = 'short_gap_while_cruising_keep_moving';
          quality = 'INFERRED';
        } else {
          const la = lookaheadReappear(i);
          if (
            la != null &&
            la[1] > p.reappearNoiseM &&
            (la[1] / la[0]) * 3.6 >= p.movingBandMinKmh
          ) {
            reason = 'gap_bracketed_by_motion(lookahead)';
            quality = 'INFERRED';
          } else {
            state = 'UNKNOWN';
            reason = 'gap_while_moving_exceeds_short_max';
            quality = 'INDETERMINATE';
          }
        }
      } else {
        state = 'UNKNOWN';
        reason = 'gap_without_context';
        quality = 'INDETERMINATE';
      }
    }

    if (state === 'MOVING') {
      stopObs = 0;
    }
    if (i === ordered.length - 1) {
      flags.push('OPEN_END_GRID_BOUNDARY');
    }

    out.push({
      label: lab,
      state,
      evidenceQuality: quality,
      reason,
      speedKmh: v,
      positionPresent: present,
      mode,
      flags,
    });
  }

  return out;
}

/** Stop episodes from STATIONARY runs (includes leading STOP_CANDIDATE). */
export function extractMotionFsmStopEpisodes(
  trip: number,
  labels: MotionFsmLabel[],
  mode: MotionFsmMode,
): MotionFsmStopEpisode[] {
  const eps: MotionFsmStopEpisode[] = [];
  let i = 0;
  const n = labels.length;
  while (i < n) {
    if (labels[i]!.state === 'STATIONARY') {
      let j = i;
      while (j + 1 < n && ['STATIONARY', 'STOP_CANDIDATE'].includes(labels[j + 1]!.state)) {
        j += 1;
      }
      let k = i;
      while (k - 1 >= 0 && labels[k - 1]!.state === 'STOP_CANDIDATE') {
        k -= 1;
      }
      const slice = labels.slice(k, j + 1);
      const qualities = new Set(slice.map((l) => l.evidenceQuality));
      const q: MotionFsmEvidenceQuality = qualities.has('DIRECT')
        ? 'DIRECT'
        : qualities.has('INFERRED')
          ? 'INFERRED'
          : 'INDETERMINATE';
      const openEnd =
        j === n - 1 ||
        (labels[j]!.state === 'STATIONARY' &&
          j + 1 < n &&
          labels[j + 1]!.state === 'UNKNOWN');
      eps.push({
        trip,
        mode,
        startEarliest: labels[k]!.label,
        startLatest: labels[i]!.label,
        endEarliest: openEnd ? null : labels[j]!.label,
        endLatest:
          !openEnd && j + 1 < n ? labels[j + 1]!.label : null,
        minDurationS: Math.max(0, secSinceEpoch(labels[j]!.label) - secSinceEpoch(labels[i]!.label)),
        maxDurationS:
          !openEnd && j + 1 < n
            ? secSinceEpoch(labels[j + 1]!.label) - secSinceEpoch(labels[k]!.label)
            : null,
        evidenceQuality: q,
        openEnd,
        labels: j - k + 1,
      });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return eps;
}
