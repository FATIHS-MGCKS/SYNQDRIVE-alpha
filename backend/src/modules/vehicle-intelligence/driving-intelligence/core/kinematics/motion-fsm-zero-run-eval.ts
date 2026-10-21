import { bucketLabelPlusSeconds, parseBucketLabelMs } from './motion-core-grid';
import type { MotionFsmLabel, MotionFsmMode, MotionFsmStopEpisode } from './motion-fsm';

export interface ZeroDisplayRun {
  trip: number;
  first_sample: string;
  last_sample: string;
  first_display_time: string;
  last_display_time: string;
  zero_sample_count: number;
}

export interface ReferenceRow {
  trip: number;
  sample_id: string;
  utc_candidate_assuming_offset_plus_02: string;
}

export interface ShadowRow {
  estimatedSpeedKmh: number | null;
  motionState?: string;
}

export interface ZeroRunFsmEvaluation {
  trip: number;
  videoStartLocal: string;
  videoEndLocal: string;
  zeroSamples: number;
  zeroUtcAssumed: string;
  baselineShadowStates: Record<string, number>;
  baselineDetectsStop: boolean;
  excludedReason: 'NO_BUCKET' | null;
  causalC4MatchedEpisode: boolean;
  retrospectiveC4MatchedEpisode: boolean;
  causalC4States: Record<string, number>;
  retrospectiveC4States: Record<string, number>;
  causalC4Quality: Record<string, number>;
  retrospectiveC4Quality: Record<string, number>;
}

function shift(label: string, seconds: number): string {
  return bucketLabelPlusSeconds(label, seconds);
}

function overlaps(
  a0: string,
  a1: string,
  b0: string,
  b1: string,
  padS: number,
): boolean {
  const as = parseBucketLabelMs(a0) / 1000 - padS;
  const ae = parseBucketLabelMs(a1) / 1000 + padS;
  const bs = parseBucketLabelMs(b0) / 1000;
  const be = parseBucketLabelMs(b1) / 1000;
  return as <= be && bs <= ae;
}

function counter(labels: MotionFsmLabel[], z0: string, z1: string, field: 'state' | 'evidenceQuality') {
  const out: Record<string, number> = {};
  for (const l of labels) {
    if (l.label >= z0 && l.label <= z1) {
      const k = field === 'state' ? l.state : l.evidenceQuality;
      out[k] = (out[k] ?? 0) + 1;
    }
  }
  return out;
}

export function evaluateZeroRunsForTrip(
  trip: number,
  zeroRuns: ZeroDisplayRun[],
  refById: Map<string, ReferenceRow>,
  shadow: Map<string, ShadowRow>,
  causalC4: MotionFsmLabel[],
  retroC4: MotionFsmLabel[],
  episodesCausal: MotionFsmStopEpisode[],
  episodesRetro: MotionFsmStopEpisode[],
): ZeroRunFsmEvaluation[] {
  const rows: ZeroRunFsmEvaluation[] = [];
  for (const zr of zeroRuns.filter((z) => z.trip === trip)) {
    const z0 = refById.get(zr.first_sample)?.utc_candidate_assuming_offset_plus_02;
    const z1 = refById.get(zr.last_sample)?.utc_candidate_assuming_offset_plus_02;
    if (!z0 || !z1) {
      continue;
    }
    const spanS = Math.max(0, Math.floor((parseBucketLabelMs(z1) - parseBucketLabelMs(z0)) / 1000));
    const shStates: Record<string, number> = {};
    let noBucket = 0;
    for (let k = 0; k <= spanS; k++) {
      const lab = shift(z0, k);
      const row = shadow.get(lab);
      const st = row ? (row.motionState ?? 'NO_BUCKET') : 'NO_BUCKET';
      if (st === 'NO_BUCKET' || !row) {
        noBucket += 1;
      }
      shStates[st] = (shStates[st] ?? 0) + 1;
    }
    const excludedReason =
      noBucket === zr.zero_sample_count && noBucket > 0 ? 'NO_BUCKET' : null;

    const hitCausal = episodesCausal.filter((e) =>
      overlaps(e.startEarliest, e.endLatest ?? e.endEarliest ?? e.startLatest, z0, z1, 3),
    );
    const hitRetro = episodesRetro.filter((e) =>
      overlaps(e.startEarliest, e.endLatest ?? e.endEarliest ?? e.startLatest, z0, z1, 3),
    );

    rows.push({
      trip,
      videoStartLocal: zr.first_display_time,
      videoEndLocal: zr.last_display_time,
      zeroSamples: zr.zero_sample_count,
      zeroUtcAssumed: `${z0}..${z1}`,
      baselineShadowStates: shStates,
      baselineDetectsStop: (shStates.STATIONARY_SUPPORTED ?? 0) > 0,
      excludedReason,
      causalC4MatchedEpisode: excludedReason ? false : hitCausal.length > 0,
      retrospectiveC4MatchedEpisode: excludedReason ? false : hitRetro.length > 0,
      causalC4States: excludedReason ? {} : counter(causalC4, z0, z1, 'state'),
      retrospectiveC4States: excludedReason ? {} : counter(retroC4, z0, z1, 'state'),
      causalC4Quality: excludedReason ? {} : counter(causalC4, z0, z1, 'evidenceQuality'),
      retrospectiveC4Quality: excludedReason ? {} : counter(retroC4, z0, z1, 'evidenceQuality'),
    });
  }
  return rows;
}
