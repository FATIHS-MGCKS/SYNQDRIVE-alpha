import type { DrivingContextLabel, VideoEligibleRow } from "../types.js";
import { NC_E_GOVERNANCE, RAYRUN_PREREG } from "./preregistration.js";
import { buildRunUnits, round, type RunUnitBuild } from "./run_units.js";
import { fitRegimeModel, type RegimeModelResult } from "./regime_model.js";

export type AbstainReason =
  | "RUN_ASSIGNED_BACKGROUND"
  | "RUN_REGIME_NOT_ACCEPTED"
  | "RESPONSIBILITY_BELOW_GATE"
  | "SECOND_OUTSIDE_REGIME_RAY_BAND";

export type EvidenceTier = "HIGH" | "MEDIUM" | "LOW";

export interface PerSecondState {
  key: string;
  clip: string;
  video_second: number;
  speed_kmh: number;
  run_id: string;
  state: "LABELLED" | "ABSTAIN";
  regime_id: string | null;
  abstain_reason: AbstainReason | null;
  speed_resolvable: boolean | null;
  tier_uncapped: EvidenceTier | null;
  tier_reported: EvidenceTier | null;
}

export interface RayRunOptions {
  rpmPolicy?: number;
  requireBothClips?: boolean;
}

export interface RayRunResult {
  rpm_policy_rpm: number;
  require_both_clips: boolean;
  n_seconds: number;
  clips: string[];
  run_build: RunUnitBuild;
  model: RegimeModelResult;
  per_second: PerSecondState[];
  accepted_centres: number[];
}

const TIER_ORDER: EvidenceTier[] = ["LOW", "MEDIUM", "HIGH"];

function capTier(t: EvidenceTier, cap: EvidenceTier): EvidenceTier {
  return TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(cap) ? cap : t;
}

export function runRayRun(rows: VideoEligibleRow[], opts: RayRunOptions = {}): RayRunResult {
  const rpmPolicy = opts.rpmPolicy ?? RAYRUN_PREREG.rpmPolicyPrimaryRpm;
  const requireBothClips = opts.requireBothClips ?? RAYRUN_PREREG.requireBothClips;
  const clips = [...new Set(rows.map((r) => r.source_clip))].sort();
  const build = buildRunUnits(rows, rpmPolicy);
  const model = fitRegimeModel(build.units, build.n_eff_total, { requireBothClips, clips });

  const accepted = model.candidates
    .map((c, j) => ({ c, j }))
    .filter(({ c }) => c.status === "ACCEPTED");
  const acceptedCentres = accepted.map(({ c }) => c.centre_k);

  const perSecond: PerSecondState[] = [];
  build.units.forEach((u, i) => {
    const comp = model.hard_assignment[i]!;
    const resp = model.final_fit.responsibilities[i]!;
    for (const r of u.rows) {
      const base = {
        key: `${r.source_clip}|${r.video_second}`,
        clip: r.source_clip,
        video_second: r.video_second,
        speed_kmh: r.speed_kmh,
        run_id: u.run_id,
      };
      const abstain = (reason: AbstainReason): PerSecondState => ({
        ...base,
        state: "ABSTAIN",
        regime_id: null,
        abstain_reason: reason,
        speed_resolvable: null,
        tier_uncapped: null,
        tier_reported: null,
      });
      if (comp < 0) {
        perSecond.push(abstain("RUN_ASSIGNED_BACKGROUND"));
        continue;
      }
      const cand = model.candidates[comp]!;
      if (cand.status !== "ACCEPTED") {
        perSecond.push(abstain("RUN_REGIME_NOT_ACCEPTED"));
        continue;
      }
      if (resp[comp]! < RAYRUN_PREREG.responsibilityGate) {
        perSecond.push(abstain("RESPONSIBILITY_BELOW_GATE"));
        continue;
      }
      if (
        RAYRUN_PREREG.perSecondRayBandCheck &&
        Math.abs(r.rpm - cand.centre_k * r.speed_kmh) > rpmPolicy
      ) {
        perSecond.push(abstain("SECOND_OUTSIDE_REGIME_RAY_BAND"));
        continue;
      }
      const others = acceptedCentres.filter((c) => c !== cand.centre_k);
      const nearest = others.length
        ? Math.min(...others.map((c) => Math.abs(c - cand.centre_k)))
        : Infinity;
      const resolvable =
        nearest * r.speed_kmh > RAYRUN_PREREG.speedResolvabilityFactor * rpmPolicy;
      const uncapped: EvidenceTier =
        resolvable && u.n_seconds >= RAYRUN_PREREG.minRunSecondsForTier ? "HIGH" : "MEDIUM";
      perSecond.push({
        ...base,
        state: "LABELLED",
        regime_id: cand.id,
        abstain_reason: null,
        speed_resolvable: resolvable,
        tier_uncapped: uncapped,
        tier_reported: capTier(uncapped, NC_E_GOVERNANCE.maxPerSecondEvidenceTier),
      });
    }
  });

  return {
    rpm_policy_rpm: rpmPolicy,
    require_both_clips: requireBothClips,
    n_seconds: rows.length,
    clips,
    run_build: build,
    model,
    per_second: perSecond,
    accepted_centres: acceptedCentres,
  };
}

/**
 * A per-second label can never carry stronger evidence than its regime's population tier.
 * Returns the number of labelled seconds whose reported tier was lowered.
 */
export function boundPerSecondTiersByPopulation(
  r: RayRunResult,
  populationTierByRegime: Map<string, EvidenceTier>,
): number {
  let lowered = 0;
  for (const s of r.per_second) {
    if (s.state !== "LABELLED" || !s.regime_id || !s.tier_reported) continue;
    const pop = populationTierByRegime.get(s.regime_id);
    if (!pop) continue;
    const bounded = capTier(s.tier_reported, pop);
    if (bounded !== s.tier_reported) {
      s.tier_reported = bounded;
      lowered++;
    }
  }
  return lowered;
}

export function acceptedCount(r: RayRunResult): number {
  return r.accepted_centres.length;
}

/** Share of seconds not labelled (background, rejected regime, gate, ray band). */
export function abstainShare(r: RayRunResult): number {
  if (r.per_second.length === 0) return 1;
  return r.per_second.filter((s) => s.state === "ABSTAIN").length / r.per_second.length;
}

export function coverageSummary(r: RayRunResult): Record<string, unknown> {
  const n = r.per_second.length;
  const labelled = r.per_second.filter((s) => s.state === "LABELLED");
  const reasons: Record<AbstainReason, number> = {
    RUN_ASSIGNED_BACKGROUND: 0,
    RUN_REGIME_NOT_ACCEPTED: 0,
    RESPONSIBILITY_BELOW_GATE: 0,
    SECOND_OUTSIDE_REGIME_RAY_BAND: 0,
  };
  for (const s of r.per_second) if (s.abstain_reason) reasons[s.abstain_reason]++;
  const uncappedHigh = labelled.filter((s) => s.tier_uncapped === "HIGH").length;
  return {
    eligible_seconds: n,
    labelled_seconds: labelled.length,
    abstained_seconds: n - labelled.length,
    classification_coverage: n ? round(labelled.length / n, 4) : 0,
    abstention_rate: n ? round((n - labelled.length) / n, 4) : 1,
    strict_coverage_speed_resolvable_run_ge_3s: n ? round(uncappedHigh / n, 4) : 0,
    abstain_reasons: reasons,
    tier_reported_counts: tierCounts(labelled.map((s) => s.tier_reported!)),
    tier_uncapped_counts: tierCounts(labelled.map((s) => s.tier_uncapped!)),
    by_regime: Object.fromEntries(
      [...new Set(labelled.map((s) => s.regime_id!))]
        .sort()
        .map((id) => [id, labelled.filter((s) => s.regime_id === id).length]),
    ),
  };
}

function tierCounts(ts: EvidenceTier[]): Record<EvidenceTier, number> {
  return {
    HIGH: ts.filter((t) => t === "HIGH").length,
    MEDIUM: ts.filter((t) => t === "MEDIUM").length,
    LOW: ts.filter((t) => t === "LOW").length,
  };
}

export const SPEED_BANDS: Array<[number, number]> = [
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 200],
];

export function coverageBySpeedBand(r: RayRunResult): Array<Record<string, unknown>> {
  return SPEED_BANDS.map(([lo, hi]) => {
    const inBand = r.per_second.filter((s) => s.speed_kmh > lo && s.speed_kmh <= hi);
    const lab = inBand.filter((s) => s.state === "LABELLED");
    return {
      band_kmh: `${lo}-${hi === 200 ? "max" : hi}`,
      n: inBand.length,
      labelled: lab.length,
      speed_resolvable_labelled: lab.filter((s) => s.speed_resolvable).length,
      abstention_rate: inBand.length ? round(1 - lab.length / inBand.length, 4) : null,
    };
  });
}

export function runStabilityStatistics(r: RayRunResult): Record<string, unknown> {
  const units = r.run_build.units;
  const lens = units.map((u) => u.n_seconds).sort((a, b) => a - b);
  const byClip: Record<string, number> = {};
  for (const u of units) byClip[u.clip] = (byClip[u.clip] ?? 0) + 1;

  const perRegime = r.model.candidates
    .filter((c) => c.status === "ACCEPTED")
    .map((c) => {
      const j = r.model.candidates.indexOf(c);
      const assigned = units.filter((_, i) => r.model.hard_assignment[i] === j);
      const secs = assigned.reduce((a, u) => a + u.n_seconds, 0);
      const persistent = assigned
        .filter((u) => u.n_seconds >= RAYRUN_PREREG.minRunSecondsForTier)
        .reduce((a, u) => a + u.n_seconds, 0);
      return {
        regime_id: c.id,
        dwell_run_lengths_s: assigned.map((u) => u.n_seconds).sort((a, b) => a - b),
        persistence_score: secs ? round(persistent / secs, 4) : null,
      };
    });

  const breaks = { K_INCREASE: 0, K_DECREASE: 0 };
  const sorted = [...units].sort(
    (a, b) => a.clip.localeCompare(b.clip) || a.start_second - b.start_second,
  );
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1]!;
    const c = sorted[i]!;
    if (p.clip !== c.clip || c.start_second !== p.end_second + 1) continue;
    if (c.k_hat > p.k_hat) breaks.K_INCREASE++;
    else breaks.K_DECREASE++;
  }

  return {
    run_count_total: units.length,
    run_count_by_clip: byClip,
    run_length_seconds: {
      min: lens[0] ?? 0,
      median: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
      max: lens[lens.length - 1] ?? 0,
      runs_ge_3s: lens.filter((x) => x >= RAYRUN_PREREG.minRunSecondsForTier).length,
    },
    contiguous_gate_break_k_direction: breaks,
    per_accepted_regime: perRegime,
    note: "Break directions are ratio-step counts only; they are not shift events and carry no gear meaning.",
  };
}

export function contextDescriptive(
  r: RayRunResult,
  labels: Map<string, DrivingContextLabel>,
): Array<Record<string, unknown>> {
  const contexts: DrivingContextLabel[] = [
    "STEADY",
    "ACCELERATING",
    "DECELERATING",
    "TRANSITION",
    "UNKNOWN",
  ];
  return contexts.map((ctx) => {
    const inCtx = r.per_second.filter((s) => (labels.get(s.key) ?? "UNKNOWN") === ctx);
    const lab = inCtx.filter((s) => s.state === "LABELLED");
    const available = inCtx.length >= RAYRUN_PREREG.minContextStratumN;
    const regimeCounts: Record<string, number> = {};
    for (const s of lab) regimeCounts[s.regime_id!] = (regimeCounts[s.regime_id!] ?? 0) + 1;
    return {
      context: ctx,
      n: inCtx.length,
      status: available ? "DESCRIPTIVE" : "NOT_AVAILABLE",
      labelled: available ? lab.length : null,
      abstention_rate: available && inCtx.length ? round(1 - lab.length / inCtx.length, 4) : null,
      labelled_regime_counts: available ? regimeCounts : null,
    };
  });
}
