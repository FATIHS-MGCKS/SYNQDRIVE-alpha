import type { NegativeControlResult, VideoEligibleRow } from "../types.js";
import { histogramPeaks, ratioValues } from "../compute/baseline_b0_b1.js";
import { majorModeCenters, mulberry32 } from "../controls/negative_controls.js";
import {
  NC_E_GOVERNANCE,
  RAYRUN_ACCEPTANCE_CRITERIA,
  RAYRUN_PREREG,
} from "./preregistration.js";
import { abstainShare, acceptedCount, runRayRun, type RayRunResult } from "./pipeline.js";
import { round } from "./run_units.js";

const TOL = RAYRUN_PREREG.centreMatchToleranceK;

function within(a: number, bs: readonly number[]): boolean {
  return bs.some((b) => Math.abs(a - b) <= TOL);
}

function quantize250(rpm: number): number {
  return Math.round(rpm / 250) * 250;
}

function withRpm(r: VideoEligibleRow, rpm: number): VideoEligibleRow {
  return { ...r, rpm, ratio: rpm / r.speed_kmh, p5_evidence_class: "SYNTHETIC" };
}

/** Real speed trajectories with synthetic rpm = k(t)·v + U(−policy, +policy), rounded to 250. */
export function syntheticOnRealSpeeds(
  real: VideoEligibleRow[],
  seed: number,
  kOf: (row: VideoEligibleRow, idxInClip: number, clipN: number) => number,
  noiseRpm = RAYRUN_PREREG.rpmPolicyPrimaryRpm,
): VideoEligibleRow[] {
  const rng = mulberry32(seed);
  const byClip = new Map<string, VideoEligibleRow[]>();
  for (const r of real) {
    const l = byClip.get(r.source_clip) ?? [];
    l.push(r);
    byClip.set(r.source_clip, l);
  }
  const out: VideoEligibleRow[] = [];
  for (const [, rows] of [...byClip.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => a.video_second - b.video_second);
    sorted.forEach((r, i) => {
      const k = kOf(r, i, sorted.length);
      const noise = (rng() * 2 - 1) * noiseRpm;
      out.push(withRpm(r, Math.max(250, quantize250(k * r.speed_kmh + noise))));
    });
  }
  return out;
}

export function quantizationOnlyNull(): VideoEligibleRow[] {
  const k = 37.5;
  const rows: VideoEligibleRow[] = [];
  const clipSpeeds: Array<[string, number[]]> = [
    ["SYNTH_Q_UP", Array.from({ length: 21 }, (_, i) => 20 + i)],
    ["SYNTH_Q_DOWN", Array.from({ length: 21 }, (_, i) => 40 - i)],
  ];
  for (const [clip, speeds] of clipSpeeds) {
    speeds.forEach((v, i) => {
      const rpm = quantize250(k * v);
      rows.push({
        source_clip: clip,
        video_second: i + 1,
        speed_kmh: v,
        rpm,
        ratio: rpm / v,
        pairing_authority: "VIDEO_SAME_FRAME_NOMINAL",
        p5_evidence_class: "SYNTHETIC",
      });
    });
  }
  return rows;
}

export function permuteRpmWithinClip(real: VideoEligibleRow[], seed: number): VideoEligibleRow[] {
  const rng = mulberry32(seed);
  const byClip = new Map<string, VideoEligibleRow[]>();
  for (const r of real) {
    const l = byClip.get(r.source_clip) ?? [];
    l.push(r);
    byClip.set(r.source_clip, l);
  }
  const out: VideoEligibleRow[] = [];
  for (const [, rows] of [...byClip.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => a.video_second - b.video_second);
    const rpms = sorted.map((r) => r.rpm);
    for (let i = rpms.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rpms[i], rpms[j]] = [rpms[j]!, rpms[i]!];
    }
    sorted.forEach((r, i) => out.push(withRpm(r, rpms[i]!)));
  }
  return out;
}

export function b0MajorCount(rows: VideoEligibleRow[]): number {
  return majorModeCenters(histogramPeaks(ratioValues(rows))).length;
}

interface RunSummary {
  accepted_regimes: number;
  accepted_centres_k: number[];
  candidate_centres_k: number[];
  run_units: number;
  abstain_share: number;
  selected_J_by_bic: number;
  merges: number;
}

function summarizeRun(r: RayRunResult): RunSummary {
  return {
    accepted_regimes: acceptedCount(r),
    accepted_centres_k: r.accepted_centres.map((c) => round(c, 2)),
    candidate_centres_k: r.model.candidates.map((c) => round(c.centre_k, 2)),
    run_units: r.run_build.units.length,
    abstain_share: round(abstainShare(r), 4),
    selected_J_by_bic: r.model.selected_J_by_bic,
    merges: r.model.separability_steps.filter((s) => s.action === "MERGED").length,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export interface CriterionOutcome {
  id: string;
  kind: "HARD" | "COMPARATIVE";
  statement: string;
  result: "PASS" | "FAIL" | "ADVANTAGE" | "DISADVANTAGE" | "TIE";
  evidence: Record<string, unknown>;
}

export interface EvaluationInput {
  eligible: VideoEligibleRow[];
  primary: RayRunResult;
  integrity: { p16_gate_pass: boolean; n_video: number; n_block5: number; n_r1: number };
  p18aControls: NegativeControlResult[];
}

export interface EvaluationOutput {
  controls: Record<string, unknown>;
  criteria: CriterionOutcome[];
  hard_all_pass: boolean;
  comparative_advantages: number;
  comparative_disadvantages: number;
  outperforms_b0_b1: boolean;
}

export function evaluateRayRun(input: EvaluationInput): EvaluationOutput {
  const { eligible, primary } = input;
  const realAccepted = primary.accepted_centres;
  const realAbstain = abstainShare(primary);
  const seeds = RAYRUN_PREREG.syntheticSeeds;

  const single = seeds.map((s) => {
    const rows = syntheticOnRealSpeeds(eligible, s, () => 37.5);
    const rr = runRayRun(rows);
    return {
      seed: s,
      ...summarizeRun(rr),
      single_correct:
        acceptedCount(rr) === 1 && Math.abs(rr.accepted_centres[0]! - 37.5) <= TOL,
      b0_major_modes: b0MajorCount(rows),
    };
  });

  const quantRows = quantizationOnlyNull();
  const quantRR = runRayRun(quantRows);
  const quantB0Peaks = histogramPeaks(ratioValues(quantRows)).length;

  const permutation = RAYRUN_PREREG.permutationSeeds.map((s) => {
    const rr = runRayRun(permuteRpmWithinClip(eligible, s));
    const fewer = acceptedCount(rr) < realAccepted.length;
    const bgUp = abstainShare(rr) >= realAbstain + 0.1;
    return { seed: s, ...summarizeRun(rr), fewer_regimes: fewer, abstain_share_up_ge_0_10: bgUp };
  });

  const clips = primary.clips;
  const loco = clips.map((clip) => {
    const rr = runRayRun(
      eligible.filter((r) => r.source_clip === clip),
      { requireBothClips: false },
    );
    return {
      fit_on_clip_only: clip,
      post_merge_centres_k: rr.model.candidates.map((c) => round(c.centre_k, 2)),
      candidate_status: rr.model.candidates.map((c) => c.status),
    };
  });
  const locoReplicated = realAccepted.map((c) => ({
    centre_k: round(c, 2),
    replicated_in: loco.filter((l) => within(c, l.post_merge_centres_k)).map((l) => l.fit_on_clip_only),
  }));
  const locoAllReplicated =
    realAccepted.length > 0 && locoReplicated.every((x) => x.replicated_in.length === clips.length);
  const locoFraction = realAccepted.length
    ? locoReplicated.filter((x) => x.replicated_in.length === clips.length).length /
      realAccepted.length
    : 0;

  const cvt = seeds.map((s) => {
    const [lo, hi] = RAYRUN_PREREG.syntheticCvtRangeK;
    const rows = syntheticOnRealSpeeds(eligible, s, (_r, i, n) => lo + ((hi - lo) * i) / Math.max(1, n - 1));
    const rr = runRayRun(rows);
    return {
      seed: s,
      ...summarizeRun(rr),
      no_false_regimes: acceptedCount(rr) <= 1 || abstainShare(rr) >= 0.5,
      b0_major_modes: b0MajorCount(rows),
    };
  });

  const blockLen = RAYRUN_PREREG.syntheticAlternationBlockSeconds;
  const twoRegime = seeds.map((s) => {
    const rows = syntheticOnRealSpeeds(eligible, s, (r) =>
      Math.floor((r.video_second - 1) / blockLen) % 2 === 0 ? 22.5 : 37.5,
    );
    const rr = runRayRun(rows);
    const c = rr.accepted_centres;
    return {
      seed: s,
      ...summarizeRun(rr),
      recovered:
        c.length === 2 && within(22.5, c) && within(37.5, c),
      b0_major_modes: b0MajorCount(rows),
    };
  });

  const resolution4550 = seeds.map((s) => {
    const rows = syntheticOnRealSpeeds(eligible, s, (r) =>
      Math.floor((r.video_second - 1) / blockLen) % 2 === 0 ? 45 : 50,
    );
    const rr = runRayRun(rows);
    return { seed: s, ...summarizeRun(rr) };
  });

  const splitHalf = clips.map((clip) => {
    const sub = eligible
      .filter((r) => r.source_clip === clip)
      .sort((a, b) => a.video_second - b.video_second);
    const mid = sub[Math.floor(sub.length / 2)]!.video_second;
    const first = runRayRun(sub.filter((r) => r.video_second <= mid), { requireBothClips: false });
    const second = runRayRun(sub.filter((r) => r.video_second > mid), { requireBothClips: false });
    const a = first.model.candidates.map((c) => c.centre_k);
    const b = second.model.candidates.map((c) => c.centre_k);
    const matched = a.filter((x) => within(x, b));
    return {
      clip,
      mid_second: mid,
      first_half_centres_k: a.map((x) => round(x, 2)),
      second_half_centres_k: b.map((x) => round(x, 2)),
      coverage_first_by_second: a.length ? round(matched.length / a.length, 4) : 0,
    };
  });
  const rrSplitMin = Math.min(...splitHalf.map((s) => s.coverage_first_by_second));

  const ncD = input.p18aControls.find((c) => c.control_id === "NC-D_LEAVE_ONE_ELIGIBLE_CLIP_OUT");
  const ncE = input.p18aControls.find((c) => c.control_id === "NC-E_SPLIT_HALF_TEMPORAL_STABILITY");
  const b0LocoMin = Number(
    (ncD?.metrics as { summary?: { min_coverage_of_trip_majors?: number } } | undefined)?.summary
      ?.min_coverage_of_trip_majors ?? 0,
  );
  const b0SplitMin = Number(
    (ncE?.metrics as { summary?: { min_half_to_half_coverage?: number } } | undefined)?.summary
      ?.min_half_to_half_coverage ?? 0,
  );

  const spec = new Map(RAYRUN_ACCEPTANCE_CRITERIA.map((c) => [c.id, c]));
  const hard = (id: string, pass: boolean, evidence: Record<string, unknown>): CriterionOutcome => ({
    id,
    kind: "HARD",
    statement: spec.get(id)!.statement,
    result: pass ? "PASS" : "FAIL",
    evidence,
  });
  const cmp = (
    id: string,
    sign: number,
    evidence: Record<string, unknown>,
  ): CriterionOutcome => ({
    id,
    kind: "COMPARATIVE",
    statement: spec.get(id)!.statement,
    result: sign > 0 ? "ADVANTAGE" : sign < 0 ? "DISADVANTAGE" : "TIE",
    evidence,
  });

  const singleCorrect = single.filter((x) => x.single_correct).length;
  const permPass = permutation.filter((p) => p.fewer_regimes || p.abstain_share_up_ge_0_10).length;
  const cvtPass = cvt.filter((c) => c.no_false_regimes).length;
  const twoPass = twoRegime.filter((t) => t.recovered).length;
  const rrSingleMean = mean(single.map((x) => Number(x.accepted_regimes)));
  const b0SingleMean = mean(single.map((x) => x.b0_major_modes));
  const rrCvtMean = mean(cvt.map((x) => Number(x.accepted_regimes)));
  const b0CvtMean = mean(cvt.map((x) => x.b0_major_modes));

  const criteria: CriterionOutcome[] = [
    hard(
      "AC1_SEALED_INTEGRITY",
      input.integrity.p16_gate_pass &&
        input.integrity.n_video === 242 &&
        input.integrity.n_block5 === 49 &&
        input.integrity.n_r1 === 442,
      input.integrity,
    ),
    hard(
      "AC2_P16_FAMILY_DIRECTION",
      realAccepted.length >= 1 &&
        realAccepted.every((c) => within(c, RAYRUN_PREREG.p16FamilyCentresK)),
      {
        accepted_centres_k: realAccepted.map((c) => round(c, 2)),
        nearest_family_distance_k: realAccepted.map((c) =>
          round(Math.min(...RAYRUN_PREREG.p16FamilyCentresK.map((f) => Math.abs(c - f))), 2),
        ),
        tolerance_k: TOL,
      },
    ),
    hard(
      "AC3_BOTH_CLIP_SUPPORT",
      realAccepted.length >= 1 &&
        primary.model.candidates
          .filter((c) => c.status === "ACCEPTED")
          .every(
            (c) =>
              c.hard_assigned_runs >= RAYRUN_PREREG.minRunsPerRegime &&
              clips.every((cl) => (c.runs_by_clip[cl] ?? 0) >= 1),
          ),
      {
        candidates: primary.model.candidates.map((c) => ({
          id: c.id,
          status: c.status,
          runs_by_clip: c.runs_by_clip,
        })),
      },
    ),
    hard("AC4_SYNTHETIC_SINGLE_RATIO_NO_FALSE_SPLIT", singleCorrect / seeds.length >= 0.9, {
      seeds_correct: singleCorrect,
      seeds_total: seeds.length,
    }),
    hard("AC5_QUANTIZATION_ONLY_NULL", acceptedCount(quantRR) <= 1, {
      rayrun: summarizeRun(quantRR),
      b0_histogram_peaks: quantB0Peaks,
    }),
    hard("AC6_PERMUTATION_NULL_COLLAPSE", permPass >= 4, {
      seeds_collapsed: permPass,
      seeds_total: permutation.length,
      real_accepted: realAccepted.length,
      real_abstain_share: round(realAbstain, 4),
    }),
    hard("AC7_LEAVE_ONE_CLIP_OUT", locoAllReplicated, { replication: locoReplicated }),
    hard("AC8_CVT_NO_FALSE_REGIMES", cvtPass / seeds.length >= 0.8, {
      seeds_pass: cvtPass,
      seeds_total: seeds.length,
    }),
    hard("AC9_TWO_REGIME_POWER", twoPass / seeds.length >= 0.8, {
      seeds_recovered: twoPass,
      seeds_total: seeds.length,
    }),
    cmp(
      "CMP1_FALSE_SPLIT_VS_B0",
      Math.sign(Math.abs(b0SingleMean - 1) - Math.abs(rrSingleMean - 1)),
      { rayrun_mean_accepted: rrSingleMean, b0_mean_major_modes: b0SingleMean },
    ),
    cmp("CMP2_QUANTIZATION_VS_B0", Math.sign(quantB0Peaks - acceptedCount(quantRR)), {
      rayrun_accepted: acceptedCount(quantRR),
      b0_peaks: quantB0Peaks,
    }),
    cmp("CMP3_CVT_VS_B0", Math.sign(b0CvtMean - rrCvtMean), {
      rayrun_mean_accepted: rrCvtMean,
      b0_mean_major_modes: b0CvtMean,
    }),
    cmp("CMP4_LOCO_VS_B0", Math.sign(round(locoFraction - b0LocoMin, 6)), {
      rayrun_fraction_replicated_both_clips: round(locoFraction, 4),
      b0_min_trip_major_coverage_p18a_nc_d: b0LocoMin,
    }),
    cmp("CMP5_SPLIT_HALF_VS_B0", Math.sign(round(rrSplitMin - b0SplitMin, 6)), {
      rayrun_min_half_coverage: rrSplitMin,
      b0_min_half_to_half_coverage_p18a_nc_e: b0SplitMin,
      governing_nc_e_verdict: ncE?.verdict ?? "MISSING",
      note: `Descriptive only. Governing NC-E stays ${NC_E_GOVERNANCE.requiredVerdict}.`,
    }),
  ];

  const hardAll = criteria.filter((c) => c.kind === "HARD").every((c) => c.result === "PASS");
  const adv = criteria.filter((c) => c.result === "ADVANTAGE").length;
  const dis = criteria.filter((c) => c.result === "DISADVANTAGE").length;

  return {
    controls: {
      synthetic_single_ratio: single,
      quantization_only_null: { rayrun: summarizeRun(quantRR), b0_histogram_peaks: quantB0Peaks },
      permutation_null: permutation,
      leave_one_clip_out: { single_clip_fits: loco, replication: locoReplicated },
      cvt_continuous_ratio: cvt,
      two_regime_power: twoRegime,
      resolution_45_vs_50_informative: resolution4550,
      split_half_rayrun_descriptive: splitHalf,
    },
    criteria,
    hard_all_pass: hardAll,
    comparative_advantages: adv,
    comparative_disadvantages: dis,
    outperforms_b0_b1: hardAll && adv >= 1 && dis === 0,
  };
}
