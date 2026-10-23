import { haversineMeters } from '../geo/haversine';
import {
  bucketLabelPlusSeconds,
  orderMotionCoreGrid,
  parseBucketLabelMs,
  presentBucketMap,
  type MotionCorePositionBucket,
} from './motion-core-grid';
import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';
import {
  applyMotionFsmGapBridgeV1PostPass,
  type MotionFsmGapBridgeAuxiliary,
} from './motion-fsm-gap-bridge-v1';

export type { MotionFsmGapBridgeAuxiliary } from './motion-fsm-gap-bridge-v1';
export {
  GAP_BRIDGE_V1_STOP_FEASIBILITY_DECEL_MPS2,
  MOTION_FSM_GAP_BRIDGE_V1_VERSION,
  gapBridgeV1LongSpanAllowed,
  gapBridgeV1StopFeasibilityAllowsBridge,
} from './motion-fsm-gap-bridge-v1';

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

/**
 * Review-round candidate switches (EXP021 Fable review). All `false` reproduces Fable V0.2 exactly.
 * Each switch is a separately evaluated candidate; see `MOTION_FSM_V0_3_CANDIDATE_OPTIONS`.
 */
export interface MotionFsmCandidateOptions {
  /**
   * K-A — stale low-speed context after motion evidence. Fable keeps `last_speed` from before a stop
   * while positions without numeric speed already imply motion (displacement across gaps). The next
   * ROW_ABSENT label then re-enters the stop path (`gap_after_low_speed_*`) and emits bogus 1-s
   * STATIONARY runs while the vehicle moves. Fix: refresh last-speed context from implied displacement
   * speed, reset stop observation on STARTING, and let STARTING survive short gaps like MOVING.
   */
  staleSpeedContextFix: boolean;
  /** K-B — enforce declared-but-unused `startingMaxS`: STARTING resolves to MOVING after N labels. */
  startingTimeout: boolean;
  /**
   * K-C — evidence-quality propagation: DIRECT only from a vehicle-speed sample or an OK-quality C4
   * value; degraded C4 (SPARSE_SUPPORT / JITTER_SUSPECT / REPAIRED) yields INFERRED with a flag;
   * sparse-vs-C4 contradictions and hysteresis-band creep are flagged. States are unchanged.
   */
  evidencePropagation: boolean;
  /**
   * Frozen baseline replay only: sparse rows without `fsmPointAuthority` may drive DIRECT like pre-authority pins.
   * Product / shadow processor paths must leave this false.
   */
  frozenLegacySparsePointAuthority: boolean;
  /**
   * K-D — retrospective gap bridge + frozen stand in UNKNOWN (EXP021 / PR #2149 research).
   * Default false: reproduces pre–gap-bridge FSM exactly. RETROSPECTIVE mode only; requires optional
   * {@link MotionFsmGapBridgeAuxiliary} for DI-V0 `STATIONARY_SUPPORTED` frozen-stand evidence.
   */
  /** Default OFF when omitted (backward-compatible with pre–gap-bridge option objects). */
  retrospectiveGapBridgeV1?: boolean;
}

export const MOTION_FSM_FABLE_V0_2_OPTIONS: Readonly<MotionFsmCandidateOptions> = {
  staleSpeedContextFix: false,
  startingTimeout: false,
  evidencePropagation: false,
  frozenLegacySparsePointAuthority: false,
  retrospectiveGapBridgeV1: false,
};

export const MOTION_FSM_V0_3_CANDIDATE_OPTIONS: Readonly<MotionFsmCandidateOptions> = {
  staleSpeedContextFix: true,
  startingTimeout: true,
  evidencePropagation: true,
  frozenLegacySparsePointAuthority: false,
  retrospectiveGapBridgeV1: false,
};

/** Offline / future activation: V0_3 + gap-bridge V1 (still default OFF in shadow processor). */
export const MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS: Readonly<MotionFsmCandidateOptions> = {
  ...MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  retrospectiveGapBridgeV1: true,
};

/** Explicit frozen comparison replay (pre–point-authority sparse semantics). */
export const MOTION_FSM_FROZEN_LEGACY_SPARSE_OPTIONS: Readonly<MotionFsmCandidateOptions> = {
  ...MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  frozenLegacySparsePointAuthority: true,
};

export function motionFsmVersionId(options: Readonly<MotionFsmCandidateOptions>): string {
  const on = (Object.keys(options) as Array<keyof MotionFsmCandidateOptions>).filter((k) => {
    if (k === 'retrospectiveGapBridgeV1') {
      return options.retrospectiveGapBridgeV1 === true;
    }
    return Boolean(options[k]);
  });
  return on.length === 0 ? MOTION_FSM_PARAMS_V0_2_DEV.version : `MOTION_FSM_V0_3_CAND_DEV[${on.join('+')}]`;
}

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
  /** Sparse vehicle-speed sample at this label (additive; null when none). */
  sparseSpeedKmh: number | null;
  /** Whether sparse may count as point-level FSM/stop evidence (false for interval-only R1 labels). */
  sparseFsmPointAuthority: boolean;
  /** Quality of the consumed C4 speed sample (additive; null when no numeric speed was used). */
  speedQuality: MotionCoreSpeedQuality | null;
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
  /** Additive evidence breakdown (review round) — does not alter Fable fields above. */
  directLabels: number;
  inferredLabels: number;
  indeterminateLabels: number;
  /** Labels with a position row or a sparse vehicle-speed sample. */
  observedLabels: number;
  /** Labels inside the episode without any evidence (ROW_ABSENT and no sparse sample). */
  gapLabels: number;
  /** Last label in the episode with position or sparse evidence (null when none). */
  lastEvidenceLabel: string | null;
  /**
   * Span from startLatest to the last evidence label (s), bounded by minDurationS. Interior gaps are
   * NOT subtracted — use `gapLabels` / `observedLabels` for coverage; this only bounds trailing propagation.
   */
  observedMinDurationS: number;
  /** Labels with numeric speed in the hysteresis band (creep not excluded). */
  hysteresisBandLabels: number;
  /** How STATIONARY was first asserted: vehicle-speed sample, C4 OK, C4 degraded, or gap inference. */
  firstStationarySource: 'SPARSE_VEHICLE_SPEED' | 'C4_OK' | 'C4_DEGRADED' | 'GAP_OR_POSITION_INFERENCE';
  firstStationaryC4Quality: string | null;
}

export interface SparseVehicleSpeedSample {
  label: string;
  speedKmh: number;
  /**
   * When false, the sample is retained for audit/export but must not drive DIRECT FSM transitions
   * (e.g. R1 bucket aggregation without provider measurement instant).
   */
  fsmPointAuthority?: boolean;
}

function sparseEligibleForFsmPointAuthority(
  sample: SparseVehicleSpeedSample | undefined,
  frozenLegacySparsePointAuthority: boolean,
): boolean {
  if (sample == null) {
    return false;
  }
  if (sample.fsmPointAuthority === true) {
    return true;
  }
  if (sample.fsmPointAuthority === false) {
    return false;
  }
  return frozenLegacySparsePointAuthority;
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
 * Thin wrapper over {@link runMotionFsm} with all candidate switches off (exact Fable behaviour).
 */
export function runMotionFsmV02(
  buckets: MotionCorePositionBucket[],
  speedSamples: MotionCoreSpeedSample[],
  mode: MotionFsmMode,
  sparseSpeed: SparseVehicleSpeedSample[] | null = null,
  params: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
): MotionFsmLabel[] {
  return runMotionFsm(buckets, speedSamples, mode, sparseSpeed, params, MOTION_FSM_FABLE_V0_2_OPTIONS);
}

/**
 * Temporal motion FSM with review-round candidate switches. `options` all false == Fable V0.2.
 */
export function runMotionFsm(
  buckets: MotionCorePositionBucket[],
  speedSamples: MotionCoreSpeedSample[],
  mode: MotionFsmMode,
  sparseSpeed: SparseVehicleSpeedSample[] | null = null,
  params: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
  options: Readonly<MotionFsmCandidateOptions> = MOTION_FSM_FABLE_V0_2_OPTIONS,
  gapBridgeAuxiliary: MotionFsmGapBridgeAuxiliary | undefined = undefined,
): MotionFsmLabel[] {
  const p = params;
  const opt = options;
  const ordered = orderMotionCoreGrid(buckets);
  const spBy = new Map(speedSamples.map((s) => [s.label, s]));
  const sparseByLabel = new Map((sparseSpeed ?? []).map((s) => [s.label, s]));
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
  /** K-B: consecutive STARTING labels (candidate only). */
  let startingRun = 0;
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
    const v = speedValueForFsm(s);
    let present = pres.has(lab);
    const flags: string[] = [];
    let reason = '';

    if (s?.quality === 'FROZEN_POSITION') {
      present = false;
      flags.push('FROZEN_POSITION_TREATED_AS_NO_EVIDENCE');
    }
    const sparseRow = sparseByLabel.get(lab);
    const sparseAuthoritative = sparseEligibleForFsmPointAuthority(
      sparseRow,
      opt.frozenLegacySparsePointAuthority,
    );
    const sparseKmh = sparseRow?.speedKmh ?? null;
    if (sparseRow && !sparseAuthoritative) {
      flags.push('SPARSE_AGGREGATION_LABEL_NOT_POINT_AUTHORITY');
    }
    const directZero =
      sparseAuthoritative &&
      sparseKmh != null &&
      sparseKmh <= p.stationaryBandMaxKmh;
    const directMoving =
      sparseAuthoritative && sparseKmh != null && sparseKmh >= p.movingBandMinKmh;

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
              if (opt.staleSpeedContextFix) {
                lastSpeed = implied;
                lastSpeedLabel = lab;
                stopObs = 0;
              }
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
          if (opt.staleSpeedContextFix) {
            // 1-s displacement implies a mean speed; refresh the gap context instead of keeping the
            // pre-stop low speed that would re-enter the stop path on the next ROW_ABSENT label.
            lastSpeed = disp * 3.6;
            lastSpeedLabel = lab;
            stopObs = 0;
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
        lastSpeed = sparseKmh!;
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
      } else if (state === 'MOVING' || (opt.staleSpeedContextFix && state === 'STARTING')) {
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

    if (state === 'STARTING') {
      startingRun += 1;
      if (opt.startingTimeout && startingRun >= p.startingMaxS) {
        state = 'MOVING';
        reason = 'starting_timeout_resolved_moving';
        flags.push(`STARTING_TIMEOUT_AFTER_S=${startingRun}`);
        startingRun = 0;
      }
    } else {
      startingRun = 0;
    }

    if (opt.evidencePropagation) {
      const sparseHere = sparseAuthoritative ? sparseKmh : null;
      if (quality === 'DIRECT' && v != null && sparseHere == null && s!.quality !== 'OK') {
        quality = 'INFERRED';
        flags.push(`EVIDENCE_DOWNGRADED_C4_QUALITY=${s!.quality}`);
      }
      if (sparseHere != null && v != null) {
        const contradiction =
          (sparseHere <= p.stationaryBandMaxKmh && v >= p.movingBandMinKmh) ||
          (sparseHere >= p.movingBandMinKmh && v < p.stationaryBandMaxKmh);
        if (contradiction) {
          quality = 'INFERRED';
          flags.push(`SPARSE_C4_CONTRADICTION=${sparseHere.toFixed(1)}/${v.toFixed(1)}`);
        }
      }
      if (
        isStopSideState(state) &&
        v != null &&
        v >= p.stationaryBandMaxKmh &&
        v < p.movingBandMinKmh
      ) {
        flags.push('HYSTERESIS_BAND_CREEP_POSSIBLE');
      }
    }

    if (state === 'MOVING' || (opt.staleSpeedContextFix && state === 'STARTING')) {
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
      sparseSpeedKmh: sparseKmh,
      sparseFsmPointAuthority: sparseAuthoritative,
      speedQuality: v != null ? s!.quality : null,
    });
  }

  if (mode === 'RETROSPECTIVE' && opt.retrospectiveGapBridgeV1 === true) {
    return applyMotionFsmGapBridgeV1PostPass(out, ordered, speedSamples, gapBridgeAuxiliary, p);
  }

  return out;
}

/** Stop episodes from STATIONARY runs (includes leading STOP_CANDIDATE). */
export function extractMotionFsmStopEpisodes(
  trip: number,
  labels: MotionFsmLabel[],
  mode: MotionFsmMode,
  params: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
): MotionFsmStopEpisode[] {
  const eps: MotionFsmStopEpisode[] = [];
  const sparsePointEvidence = (l: MotionFsmLabel): boolean =>
    l.sparseSpeedKmh != null && l.sparseFsmPointAuthority;
  const hasEvidence = (l: MotionFsmLabel): boolean => l.positionPresent || sparsePointEvidence(l);
  const firstStationarySourceOf = (
    l: MotionFsmLabel,
  ): MotionFsmStopEpisode['firstStationarySource'] => {
    if (sparsePointEvidence(l)) {
      return 'SPARSE_VEHICLE_SPEED';
    }
    if (l.speedQuality === 'OK') {
      return 'C4_OK';
    }
    if (l.speedQuality != null) {
      return 'C4_DEGRADED';
    }
    return 'GAP_OR_POSITION_INFERENCE';
  };
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
      const count = (q: MotionFsmEvidenceQuality): number =>
        slice.filter((l) => l.evidenceQuality === q).length;
      const observed = slice.filter(hasEvidence);
      const lastEvidenceLabel = observed.length > 0 ? observed[observed.length - 1]!.label : null;
      const minDurationS = Math.max(
        0,
        secSinceEpoch(labels[j]!.label) - secSinceEpoch(labels[i]!.label),
      );
      const observedMinDurationS =
        lastEvidenceLabel == null
          ? 0
          : Math.min(
              minDurationS,
              Math.max(0, secSinceEpoch(lastEvidenceLabel) - secSinceEpoch(labels[i]!.label)),
            );
      eps.push({
        trip,
        mode,
        startEarliest: labels[k]!.label,
        startLatest: labels[i]!.label,
        endEarliest: openEnd ? null : labels[j]!.label,
        endLatest:
          !openEnd && j + 1 < n ? labels[j + 1]!.label : null,
        minDurationS,
        maxDurationS:
          !openEnd && j + 1 < n
            ? secSinceEpoch(labels[j + 1]!.label) - secSinceEpoch(labels[k]!.label)
            : null,
        evidenceQuality: q,
        openEnd,
        labels: j - k + 1,
        directLabels: count('DIRECT'),
        inferredLabels: count('INFERRED'),
        indeterminateLabels: count('INDETERMINATE'),
        observedLabels: observed.length,
        gapLabels: slice.length - observed.length,
        lastEvidenceLabel,
        observedMinDurationS,
        hysteresisBandLabels: slice.filter(
          (l) =>
            l.speedKmh != null &&
            l.speedKmh >= params.stationaryBandMaxKmh &&
            l.speedKmh < params.movingBandMinKmh,
        ).length,
        firstStationarySource: firstStationarySourceOf(labels[i]!),
        firstStationaryC4Quality: labels[i]!.speedQuality,
      });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return eps;
}
