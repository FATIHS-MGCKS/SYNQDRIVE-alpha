import { computeC4AdaptiveL3 } from './c4-adaptive-l3';
import type { MotionCorePositionBucket } from './motion-core-grid';
import { parseBucketLabelMs } from './motion-core-grid';
import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';
import type { MotionEventQuality, MotionManoeuvreEvent, MotionManoeuvreKind } from './motion-event.types';

/** Re-used HF thresholds (unchanged); see `trips/hf-acceleration.ts` / `trips/hf-braking.ts`. */
export const MOTION_EVENT_HF_THRESHOLDS_V1 = {
  version: 'HF_THRESHOLDS_V1_REUSED (trips/hf-acceleration.ts, trips/hf-braking.ts)',
  entryMps2: 1.5,
  continueMps2: 1.2,
  minSteps: 2,
  minDeltaKmh: { ACCELERATION: 4.0, DECELERATION: 3.0 } as const,
  mergeGapS: { ACCELERATION: 2.0, DECELERATION: 1.5 } as const,
};

export const MOTION_CORE_EVENT_GUARDS_V0_1_DEV = {
  version: 'MOTION_CORE_EVENT_GUARDS_V0_1_DEV',
  maxGapS: 2,
  postGapGuardS: 2,
  usableQualities: [
    'OK',
    'SPARSE_SUPPORT',
    'JITTER_SUSPECT',
    'REPAIRED',
    'SPAN_SUPPORT',
    'SPAN_DERIVED',
  ] as MotionCoreSpeedQuality[],
};

/**
 * Review-round candidate switches (EXP021 Fable review). All `false` reproduces Fable V0.1 exactly.
 */
export interface MotionEventCandidateOptions {
  /**
   * K3 — spike reversion: an event whose speed returns to within `minDeltaKmh[kind]` of its start
   * speed at the next usable sample(s) after `endLabel` (same segment, ≤ `spikeReversionWindowS`)
   * is a single-sample excursion, not a manoeuvre — unless an opposite-kind event starts at or after
   * `endLabel` within the window (real accel→decel). Quality becomes `ARTEFACT_SUSPECT`; the event is
   * kept so coverage is not silently reduced. Adds `spikeReversionWindowS` to event finalization.
   */
  spikeReversionCheck: boolean;
}

export const MOTION_EVENT_FABLE_V0_1_OPTIONS: Readonly<MotionEventCandidateOptions> = {
  spikeReversionCheck: false,
};

export const MOTION_EVENT_V0_2_CANDIDATE_OPTIONS: Readonly<MotionEventCandidateOptions> = {
  spikeReversionCheck: true,
};

/** Same horizon as the post-gap guard: reversion is only checked inside the current segment. */
export const MOTION_EVENT_SPIKE_REVERSION_WINDOW_S = 2;

export function motionEventVersionId(options: Readonly<MotionEventCandidateOptions>): string {
  const base = `${MOTION_EVENT_HF_THRESHOLDS_V1.version} + ${MOTION_CORE_EVENT_GUARDS_V0_1_DEV.version}`;
  return options.spikeReversionCheck
    ? `${base} + MOTION_EVENT_V0_2_CAND_DEV[spikeReversionCheck]`
    : base;
}

const UNCERTAINTY_LABEL = '±1 s label + unvalidated clock offset';

function secSinceEpoch(label: string): number {
  return Math.floor(parseBucketLabelMs(label) / 1000);
}

function buildSegments(
  samples: MotionCoreSpeedSample[],
  usable: ReadonlySet<string>,
): MotionCoreSpeedSample[][] {
  const segs: MotionCoreSpeedSample[][] = [];
  let cur: MotionCoreSpeedSample[] = [];
  for (const s of samples) {
    if (s.valueKmh == null || !usable.has(s.quality)) {
      continue;
    }
    if (cur.length > 0 && secSinceEpoch(s.label) - secSinceEpoch(cur[cur.length - 1]!.label) > MOTION_CORE_EVENT_GUARDS_V0_1_DEV.maxGapS) {
      segs.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length > 0) {
    segs.push(cur);
  }
  return segs;
}

function eventQuality(slice: MotionCoreSpeedSample[]): MotionEventQuality {
  const qualities = new Set(slice.map((x) => x.quality));
  if (qualities.size === 1 && qualities.has('OK')) {
    return 'OK';
  }
  if (qualities.has('JITTER_SUSPECT') || qualities.has('REPAIRED')) {
    return 'DEGRADED';
  }
  return 'LIMITED';
}

/**
 * Neutral ACCELERATION / DECELERATION detector on a quality-checked 1 Hz speed series.
 * Port of `exp021-motion-core-design/prototype/event_detector.py` — no FSM input.
 */
export function detectMotionManoeuvreEvents(
  trip: number,
  samples: MotionCoreSpeedSample[],
  source: string,
  usableQualities: readonly MotionCoreSpeedQuality[] = MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
  options: Readonly<MotionEventCandidateOptions> = MOTION_EVENT_FABLE_V0_1_OPTIONS,
): MotionManoeuvreEvent[] {
  const usable = new Set<string>(usableQualities);
  const events: MotionManoeuvreEvent[] = [];
  const algoVersion = motionEventVersionId(options);

  for (const seg of buildSegments(samples, usable)) {
    if (seg.length < 3) {
      continue;
    }
    const segStart = secSinceEpoch(seg[0]!.label);
    const segEvents: Array<{ ev: MotionManoeuvreEvent; s0: number; s1: number }> = [];

    for (const kind of ['ACCELERATION', 'DECELERATION'] as const) {
      const sign = kind === 'ACCELERATION' ? 1 : -1;
      let inEv = false;
      let evStart = 0;
      let peak = 0;
      let steps = 0;
      const raw: Array<[number, number, number, number]> = [];

      for (let i = 1; i < seg.length; i++) {
        const dt = secSinceEpoch(seg[i]!.label) - secSinceEpoch(seg[i - 1]!.label);
        const a = (sign * (seg[i]!.valueKmh! - seg[i - 1]!.valueKmh!)) / 3.6 / dt;
        if (!inEv) {
          if (
            a >= MOTION_EVENT_HF_THRESHOLDS_V1.entryMps2 &&
            secSinceEpoch(seg[i - 1]!.label) - segStart >= MOTION_CORE_EVENT_GUARDS_V0_1_DEV.postGapGuardS
          ) {
            inEv = true;
            evStart = i - 1;
            peak = a;
            steps = 1;
          }
        } else if (a >= MOTION_EVENT_HF_THRESHOLDS_V1.continueMps2) {
          steps += 1;
          peak = Math.max(peak, a);
        } else {
          raw.push([evStart, i - 1, peak, steps]);
          inEv = false;
        }
      }
      if (inEv) {
        raw.push([evStart, seg.length - 1, peak, steps]);
      }

      const acc: Array<[number, number, number, number]> = [];
      for (const [s0, s1, pk, st] of raw) {
        const dv = sign * (seg[s1]!.valueKmh! - seg[s0]!.valueKmh!);
        if (st >= MOTION_EVENT_HF_THRESHOLDS_V1.minSteps && dv >= MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh[kind]) {
          acc.push([s0, s1, pk, st]);
        }
      }

      const merged: Array<[number, number, number, number]> = [];
      for (const e of acc) {
        if (
          merged.length > 0 &&
          secSinceEpoch(seg[e[0]].label) - secSinceEpoch(seg[merged[merged.length - 1]![1]].label) <
            MOTION_EVENT_HF_THRESHOLDS_V1.mergeGapS[kind]
        ) {
          const m = merged[merged.length - 1]!;
          m[1] = e[1];
          m[2] = Math.max(m[2], e[2]);
          m[3] += e[3];
        } else {
          merged.push([...e]);
        }
      }

      for (const [s0, s1, pk, st] of merged) {
        const dur = secSinceEpoch(seg[s1]!.label) - secSinceEpoch(seg[s0]!.label);
        const dv = sign * (seg[s1]!.valueKmh! - seg[s0]!.valueKmh!);
        const slice = seg.slice(s0, s1 + 1);
        const vals = slice.map((x) => [secSinceEpoch(x.label), x.valueKmh!] as [number, number]);
        const two: number[] = [];
        for (let j = 2; j < vals.length; j++) {
          two.push((sign * (vals[j]![1] - vals[j - 2]![1])) / 3.6 / (vals[j]![0] - vals[j - 2]![0]));
        }
        const peak2 = two.length > 0 ? Math.max(...two) : null;
        const flagSet = new Set<string>();
        for (const x of slice) {
          for (const f of x.flags) {
            flagSet.add(f);
          }
        }
        const flags = [...flagSet].sort();

        const ev: MotionManoeuvreEvent = {
          trip,
          kind,
          startLabel: seg[s0]!.label,
          endLabel: seg[s1]!.label,
          startUncertaintyS: UNCERTAINTY_LABEL,
          endUncertaintyS: UNCERTAINTY_LABEL,
          startSpeedKmh: round1(seg[s0]!.valueKmh!),
          endSpeedKmh: round1(seg[s1]!.valueKmh!),
          deltaKmh: round1(dv),
          meanAccelMps2: round3(dv / 3.6 / Math.max(dur, 1)),
          peakAccel1sMps2: round3(pk),
          peakAccel2sMps2: peak2 != null ? round3(peak2) : null,
          durationS: dur,
          steps: st,
          coverageRatio: round3((s1 - s0 + 1) / Math.max(1, dur + 1)),
          quality: eventQuality(slice),
          source,
          algorithmVersion: algoVersion,
          flags,
        };
        events.push(ev);
        segEvents.push({ ev, s0, s1 });
      }
    }

    if (options.spikeReversionCheck) {
      applySpikeReversionCheck(seg, segEvents);
    }
  }

  events.sort((a, b) => a.startLabel.localeCompare(b.startLabel));
  return events;
}

/**
 * K3: mark events whose speed reverts to the start level right after the event end (same segment,
 * within `MOTION_EVENT_SPIKE_REVERSION_WINDOW_S`) and that are not followed by an opposite-kind
 * event starting at/after the end label within the same window.
 */
function applySpikeReversionCheck(
  seg: MotionCoreSpeedSample[],
  segEvents: Array<{ ev: MotionManoeuvreEvent; s0: number; s1: number }>,
): void {
  const win = MOTION_EVENT_SPIKE_REVERSION_WINDOW_S;
  for (const { ev, s0, s1 } of segEvents) {
    const endSec = secSinceEpoch(seg[s1]!.label);
    const startSpeed = seg[s0]!.valueKmh!;
    const tol = MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh[ev.kind];
    let revertLabel: string | null = null;
    let revertSpeed: number | null = null;
    for (let j = s1 + 1; j < seg.length; j++) {
      const dt = secSinceEpoch(seg[j]!.label) - endSec;
      if (dt > win) {
        break;
      }
      if (Math.abs(seg[j]!.valueKmh! - startSpeed) < tol) {
        revertLabel = seg[j]!.label;
        revertSpeed = seg[j]!.valueKmh!;
        break;
      }
    }
    if (revertLabel == null) {
      continue;
    }
    const oppositeFollows = segEvents.some(
      (o) =>
        o.ev.kind !== ev.kind &&
        o.s0 >= s1 &&
        secSinceEpoch(seg[o.s0]!.label) - endSec <= win,
    );
    if (oppositeFollows) {
      ev.flags = [...ev.flags, `REVERSION_EXPLAINED_BY_OPPOSITE_EVENT`].sort();
      continue;
    }
    ev.quality = 'ARTEFACT_SUSPECT';
    ev.flags = [
      ...ev.flags,
      `SPIKE_REVERSION_WITHIN_${win}S=${revertLabel}:${round1(revertSpeed!)}`,
    ].sort();
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** End-to-end: C4 speed series → manoeuvre events (offline replay chain). */
export function detectMotionManoeuvreEventsFromC4(
  trip: number,
  buckets: MotionCorePositionBucket[],
  options: Readonly<MotionEventCandidateOptions> = MOTION_EVENT_FABLE_V0_1_OPTIONS,
): MotionManoeuvreEvent[] {
  return detectMotionManoeuvreEvents(
    trip,
    computeC4AdaptiveL3(buckets),
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    options,
  );
}
