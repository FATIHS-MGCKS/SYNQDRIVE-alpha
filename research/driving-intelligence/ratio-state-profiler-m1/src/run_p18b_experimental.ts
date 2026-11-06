#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { M1_DEFAULTS, P16_REGRESSION, P16_SEALED_ARTIFACTS } from "./constants.js";
import { stableReportHash } from "./hash.js";
import {
  loadManifestFromPath,
  resolvePackageRoot,
  resolveRepoRoot,
  verifyP16Gate,
  type P16GateOptions,
} from "./pin/p16_gate.js";
import {
  block5Subsample,
  eligibleVideoRows,
  parseP5QcCsv,
  parseR1SameRowPairs,
  type QcRow,
} from "./loaders/video_cohort.js";
import { parseVideo1HzCsv } from "./loaders/video_1hz.js";
import {
  assertP16BaselineRegression,
  computeBaselineB0B1,
  reportHasForbiddenGearFields,
} from "./compute/baseline_b0_b1.js";
import {
  attachContextToEligibleRows,
  buildDrivingContextGridFrom1Hz,
  loadManoeuvreWindows,
} from "./compute/driving_context.js";
import { runNegativeControls } from "./controls/negative_controls.js";
import {
  NC_E_GOVERNANCE,
  RAYRUN_ACCEPTANCE_CRITERIA,
  RAYRUN_PREREG,
} from "./rayrun/preregistration.js";
import {
  abstainShare,
  boundPerSecondTiersByPopulation,
  contextDescriptive,
  coverageBySpeedBand,
  coverageSummary,
  runRayRun,
  runStabilityStatistics,
  type EvidenceTier,
  type RayRunResult,
} from "./rayrun/pipeline.js";
import { evaluateRayRun } from "./rayrun/evaluation.js";
import { round } from "./rayrun/run_units.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(here);
const pkgRoot = resolvePackageRoot(repoRoot);

function sealedPath(role: string): string {
  const art = P16_SEALED_ARTIFACTS.find((a) => a.role === role);
  if (!art) throw new Error(`missing pinned role ${role}`);
  return join(repoRoot, art.repo_relative);
}

const SCHEMA = "DS4_RPM_P18B_RAY_RUN_EXPERIMENTAL_V1";

function failClosed(reason: string, detail: unknown): Record<string, unknown> {
  return {
    schema: SCHEMA,
    mandatory_gates_pass: false,
    fail_closed_reason: reason,
    detail,
    SCIENTIFIC_GO_NO_GO: { verdict: "NO_GO_FAIL_CLOSED", reason },
  };
}

function notAvailableOutsideCohort(qc: QcRow[], clips: string[]): Record<string, unknown> {
  const exclude = new Set<number>(M1_DEFAULTS.videoBoundaryExcludeSeconds);
  const reasons = {
    NO_POSITIVE_RPM_CANDIDATE: 0,
    SPEED_MISSING_OR_LE_20: 0,
    CLIP_BOUNDARY_SECOND: 0,
  };
  let total = 0;
  for (const r of qc) {
    if (!clips.includes(r.source_clip)) continue;
    total++;
    if (r.p5_evidence_class !== "POSITIVE_RPM_VISUAL_CANDIDATE" || r.rpm == null) {
      reasons.NO_POSITIVE_RPM_CANDIDATE++;
    } else if (r.speed_kmh == null || r.speed_kmh <= M1_DEFAULTS.vMinKmh) {
      reasons.SPEED_MISSING_OR_LE_20++;
    } else if (exclude.has(r.video_second)) {
      reasons.CLIP_BOUNDARY_SECOND++;
    }
  }
  const na = Object.values(reasons).reduce((a, b) => a + b, 0);
  return {
    qc_seconds_in_eligible_clips: total,
    not_available_seconds: na,
    not_available_reasons: reasons,
    note: "NOT_AVAILABLE seconds are outside the frozen 242-pair cohort; RAY-RUN never labels them.",
  };
}

function separabilitySummary(r: RayRunResult): Array<Record<string, unknown>> {
  return r.model.separability_steps.map((s) => ({
    k_low: round(s.k_low, 2),
    k_high: round(s.k_high, 2),
    delta_k: round(s.delta_k, 2),
    se_low: round(s.se_low, 3),
    se_high: round(s.se_high, 3),
    z: round(s.z, 2),
    z_threshold: s.z_threshold,
    action: s.action,
  }));
}

function resolvabilityMap(r: RayRunResult): Array<Record<string, unknown>> {
  const c = r.accepted_centres;
  const speeds = r.per_second.map((s) => s.speed_kmh);
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i + 1 < c.length; i++) {
    const dk = c[i + 1]! - c[i]!;
    const vReq = (RAYRUN_PREREG.speedResolvabilityFactor * r.rpm_policy_rpm) / dk;
    out.push({
      pair_k: [round(c[i]!, 2), round(c[i + 1]!, 2)],
      delta_k: round(dk, 2),
      per_second_resolvable_above_kmh: round(vReq, 1),
      share_of_eligible_seconds_above: round(speeds.filter((v) => v > vReq).length / speeds.length, 4),
    });
  }
  return out;
}

function bicTable(r: RayRunResult): Array<Record<string, unknown>> {
  return r.model.bic_by_J.map((b) => ({
    J: b.J,
    bic: round(b.bic, 3),
    log_likelihood: round(b.log_likelihood, 3),
  }));
}

export function buildP18bExperimentalReport(options?: P16GateOptions): Record<string, unknown> {
  const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
  const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath), options);
  if (gate.verdict !== "PASS") return failClosed("SOURCE_INTEGRITY_FAIL_CLOSED", gate);

  const qc = parseP5QcCsv(sealedPath("p5_optical_qc_overlay"));
  const eligible = eligibleVideoRows(qc);
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  const p16 = assertP16BaselineRegression(eligible, block5, baseline);
  const r1 = parseR1SameRowPairs(sealedPath("sealed_s4_r1_obd"));
  if (!p16.pass || r1.length !== P16_REGRESSION.r1SameRowVMin20) {
    return failClosed("P16_PARITY_FAIL_CLOSED", { p16, r1: r1.length });
  }

  const controls = runNegativeControls(eligible, r1);
  const ncE = controls.find((c) => c.control_id === "NC-E_SPLIT_HALF_TEMPORAL_STABILITY");
  if (ncE?.verdict !== NC_E_GOVERNANCE.requiredVerdict) {
    return failClosed("NC_E_GOVERNANCE_MISMATCH", { observed: ncE?.verdict ?? "MISSING" });
  }

  const grid = buildDrivingContextGridFrom1Hz(
    parseVideo1HzCsv(sealedPath("video_1hz_reference")),
    loadManoeuvreWindows(sealedPath("analysis_windows_nine")),
  );
  const contextLabels = attachContextToEligibleRows(eligible, grid);

  const primary = runRayRun(eligible, { rpmPolicy: RAYRUN_PREREG.rpmPolicyPrimaryRpm });
  const sensitivity = runRayRun(eligible, { rpmPolicy: RAYRUN_PREREG.rpmPolicySensitivityRpm });
  const evaluation = evaluateRayRun({
    eligible,
    primary,
    integrity: {
      p16_gate_pass: gate.verdict === "PASS",
      n_video: eligible.length,
      n_block5: block5.length,
      n_r1: r1.length,
    },
    p18aControls: controls,
  });

  const crit = new Map(evaluation.criteria.map((c) => [c.id, c.result]));
  const nullsPass =
    crit.get("AC4_SYNTHETIC_SINGLE_RATIO_NO_FALSE_SPLIT") === "PASS" &&
    crit.get("AC6_PERMUTATION_NULL_COLLAPSE") === "PASS" &&
    crit.get("AC7_LEAVE_ONE_CLIP_OUT") === "PASS";
  const sensCentres = sensitivity.accepted_centres;
  const within = (a: number, bs: number[]) =>
    bs.some((b) => Math.abs(a - b) <= RAYRUN_PREREG.centreMatchToleranceK);

  const regimeCandidates = primary.model.candidates.map((c) => {
    const bothClips = primary.clips.every((cl) => (c.runs_by_clip[cl] ?? 0) >= 1);
    let tier: EvidenceTier;
    if (c.status === "ACCEPTED") {
      tier = nullsPass ? "HIGH" : "LOW";
    } else if (bothClips && c.hard_assigned_runs === 2) {
      tier = "MEDIUM";
    } else {
      tier = "LOW";
    }
    const reported =
      tier === "HIGH" ? NC_E_GOVERNANCE.maxPopulationEvidenceTier : tier;
    const clipSeconds = primary.clips.map((cl) => c.seconds_by_clip[cl] ?? 0);
    return {
      id: c.id,
      status: c.status,
      centre_k_rpm_per_kmh: round(c.centre_k, 2),
      centre_se_k: round(c.centre_se_k, 3),
      hard_assigned_runs: c.hard_assigned_runs,
      runs_by_clip: c.runs_by_clip,
      seconds_hard_assigned: c.seconds_hard_assigned,
      seconds_by_clip: c.seconds_by_clip,
      minority_clip_seconds_share: c.seconds_hard_assigned
        ? round(Math.min(...clipSeconds) / c.seconds_hard_assigned, 4)
        : 0,
      occupancy_share_of_242: round(c.seconds_hard_assigned / eligible.length, 4),
      nearest_p16_family_distance_k: round(
        Math.min(...RAYRUN_PREREG.p16FamilyCentresK.map((f) => Math.abs(c.centre_k - f))),
        2,
      ),
      replicated_under_pm250: within(c.centre_k, sensCentres),
      population_tier_uncapped: tier,
      population_tier_reported: reported,
      temporal_status: NC_E_GOVERNANCE.regimeTemporalStatus,
    };
  });

  const popTier = new Map<string, EvidenceTier>();
  for (const c of regimeCandidates) {
    if (c.status === "ACCEPTED") {
      popTier.set(c.id, c.population_tier_reported);
    }
  }
  const secondsBoundedByPopulation = boundPerSecondTiersByPopulation(primary, popTier);

  const primaryCoverage = coverageSummary(primary);
  const sensitivityCoverage = coverageSummary(sensitivity);
  const selected = primary.model.bic_by_J.find((b) => b.J === primary.model.selected_J_by_bic)!;
  const runnerUp = primary.model.bic_by_J
    .filter((b) => b.J !== selected.J)
    .reduce((a, b) => (b.bic < a.bic ? b : a));
  const uncappedHighSeconds = primary.per_second.filter((s) => s.tier_uncapped === "HIGH").length;
  const highRegimesCapped = regimeCandidates.filter(
    (c) => c.population_tier_uncapped === "HIGH",
  ).length;

  const outperforms = evaluation.outperforms_b0_b1;
  const failedHard = evaluation.criteria
    .filter((c) => c.kind === "HARD" && c.result !== "PASS")
    .map((c) => c.id);

  const report: Record<string, unknown> = {
    schema: SCHEMA,
    operation: "DS4_RPM_P18B_RAY_RUN_EXPERIMENTAL_ALGORITHM",
    mode: "RESEARCH_IMPLEMENTATION_DRAFT_ONLY",
    generated_at_utc: new Date().toISOString(),
    mandatory_gates_pass: true,
    preregistration_id: RAYRUN_PREREG.id,
    SOURCE_INTEGRITY: {
      verdict: gate.verdict,
      manifest_sha256_self_recomputed: gate.manifest_sha256_self_recomputed,
      sealed_inputs: gate.sealed_inputs.map((s) => ({ role: s.role, sha256: s.sha256, match: s.match })),
    },
    P16_COUNTS_PRESERVED: {
      video_pair_count: eligible.length,
      block5_count: block5.length,
      r1_same_row_vmin_20: r1.length,
      r1_used_by_rayrun: false,
      cross_cohort_join: "BLOCKED",
    },
    RAY_RUN_EXPERIMENTAL_RESULTS: {
      status: "EXPERIMENTAL_OFFLINE_RESEARCH_ONLY",
      pipeline: "I2 run rays -> I1 origin-ray mixture + background (BIC on n_eff) -> I3 separability/merge -> I5 abstaining per-second state -> I6 context (descriptive)",
      rpm_policy_primary_rpm: RAYRUN_PREREG.rpmPolicyPrimaryRpm,
      temporal_dependence: {
        per_clip: primary.run_build.temporal_dependence,
        n_eff_total: primary.run_build.n_eff_total,
        n_raw: eligible.length,
        n_block5_reference: block5.length,
        run_units: primary.run_build.units.length,
        n_used_for_bic: round(primary.model.n_bic, 2),
      },
      run_units: primary.run_build.units.map((u) => ({
        run_id: u.run_id,
        n_seconds: u.n_seconds,
        k_hat: round(u.k_hat, 2),
        sigma_k: round(u.sigma_k, 3),
        sigma_k_policy_only: round(u.sigma_k_policy_only, 3),
        rms_residual_rpm: u.rms_residual_rpm == null ? null : round(u.rms_residual_rpm, 1),
        mean_speed_kmh: round(u.mean_speed_kmh, 1),
      })),
      model_selection: {
        bic_by_J: bicTable(primary),
        selected_J: primary.model.selected_J_by_bic,
        runner_up_J: runnerUp.J,
        delta_bic_runner_up_minus_selected: round(runnerUp.bic - selected.bic, 3),
        j_cap: RAYRUN_PREREG.maxRegimes,
        note: "J is selected by BIC on run units with n = min(run units, n_eff); no regime count is assumed.",
      },
      run_stability: runStabilityStatistics(primary),
      dual_uncertainty_pm250_sensitivity: {
        claims_adopt: "PM500",
        accepted_centres_k: sensCentres.map((c) => round(c, 2)),
        selected_J: sensitivity.model.selected_J_by_bic,
        n_eff_total: sensitivity.run_build.n_eff_total,
        run_units: sensitivity.run_build.units.length,
        coverage: sensitivityCoverage,
      },
      quantization_assessment: {
        rpm_values_all_multiples_of_250: eligible.every((r) => r.rpm % 250 === 0),
        integer_speed_kmh: eligible.every((r) => Number.isInteger(r.speed_kmh)),
        quantization_only_null: evaluation.controls.quantization_only_null,
        note: "RAY-RUN fits rays in rpm space per run; ratio-space comb is a B0 histogram artefact.",
      },
      driving_context_descriptive: contextDescriptive(primary, contextLabels),
    },
    REGIME_CANDIDATES: regimeCandidates,
    SEPARABILITY_EVIDENCE: {
      pm500_steps: separabilitySummary(primary),
      pm250_steps: separabilitySummary(sensitivity),
      per_second_speed_resolvability_pm500: resolvabilityMap(primary),
      merge_policy_deviation_from_fable:
        "Statistically separable but single-clip candidates are kept and REJECTED (not merged into a neighbour); merging distinguishable regimes would fabricate an intermediate centre.",
    },
    NC_E_IMPACT: {
      governing_nc_e_verdict: ncE.verdict,
      required_verdict: NC_E_GOVERNANCE.requiredVerdict,
      regime_temporal_status: NC_E_GOVERNANCE.regimeTemporalStatus,
      population_tier_cap: NC_E_GOVERNANCE.maxPopulationEvidenceTier,
      per_second_tier_cap: NC_E_GOVERNANCE.maxPerSecondEvidenceTier,
      regimes_downgraded_high_to_medium: highRegimesCapped,
      seconds_uncapped_high_capped_by_nc_e: uncappedHighSeconds,
      seconds_further_bounded_by_population_tier: secondsBoundedByPopulation,
      rayrun_split_half_descriptive: evaluation.controls.split_half_rayrun_descriptive,
      statement:
        "Regimes are trip-pooled run-ray clusters. Temporal split-half replication failed for the frozen baseline (NC-E); no regime is claimed to be stable across time, and the RAY-RUN split-half result cannot lift that cap.",
    },
    CLASSIFICATION_COVERAGE: {
      pm500: primaryCoverage,
      by_speed_band_pm500: coverageBySpeedBand(primary),
      outside_cohort: notAvailableOutsideCohort(qc, primary.clips),
      confidence_policy: {
        probabilities_emitted: false,
        tiers: "Categorical evidence-quality tiers (Fable §10) — not probabilities, not gear truth.",
        calibration_status: "NOT_CALIBRATABLE_NO_GROUND_TRUTH",
      },
    },
    ABSTENTION_RATE: {
      pm500: round(abstainShare(primary), 4),
      pm250_sensitivity: round(abstainShare(sensitivity), 4),
      reasons_pm500: primaryCoverage.abstain_reasons,
      reasons_pm250: sensitivityCoverage.abstain_reasons,
    },
    BASELINE_COMPARISON: {
      b0_top_four_centres_k: baseline.b0_top_four_centers,
      b0_peak_count: baseline.b0_histogram_peaks.length,
      b1_block5_peak_count: baseline.block5_peaks.length,
      b1_block5_top_centres_k: baseline.block5_peaks.slice(0, 4).map((p) => p.center_rpm_per_kmh),
      rayrun_accepted_centres_k: primary.accepted_centres.map((c) => round(c, 2)),
      p18a_baseline_controls: Object.fromEntries(controls.map((c) => [c.control_id, c.verdict])),
      acceptance_criteria: evaluation.criteria,
      control_runs: evaluation.controls,
      hard_all_pass: evaluation.hard_all_pass,
      comparative_advantages: evaluation.comparative_advantages,
      comparative_disadvantages: evaluation.comparative_disadvantages,
      decision_rule:
        "Outperforms only if every HARD criterion passes AND >=1 COMPARATIVE advantage AND 0 COMPARATIVE disadvantages.",
    },
    SCIENTIFIC_GO_NO_GO: {
      verdict: outperforms
        ? "GO_EXPERIMENTAL_RESEARCH_CONTINUATION_ONLY"
        : "NO_GO_RECOMMEND_B0_B1_BASELINE",
      rayrun_outperforms_b0_b1: outperforms,
      failed_hard_criteria: failedHard,
      recommendation: outperforms
        ? "RAY-RUN may continue as an offline research method; regimes stay trip-pooled (NC-E) and MEDIUM-capped. No production, gear or shift use."
        : "Keep the simpler B0/B1 descriptive baselines. RAY-RUN outputs remain experimental diagnostics only.",
      production_readiness: "NOT_APPLICABLE_RESEARCH_ONLY",
      p18c_started: false,
    },
    preregistered_criteria_count: RAYRUN_ACCEPTANCE_CRITERIA.length,
    POST_REGISTRATION_CHANGES: [
      {
        change: "Accepted regimes failing the RAY-RUN nulls (AC4/AC6/AC7) get population tier LOW.",
        direction: "CLAIM_REDUCING_ONLY",
        reason: "Fable §10 MEDIUM conditions do not cover a null failure; LOW is the conservative mapping.",
      },
      {
        change: "Per-second reported tier is bounded by its regime's population tier.",
        direction: "CLAIM_REDUCING_ONLY",
        reason: "A second cannot carry stronger evidence than the regime it is assigned to.",
      },
      {
        change: "Added minority_clip_seconds_share and pre-acceptance candidate centres (descriptive).",
        direction: "DESCRIPTIVE_ONLY",
        reason: "Exposes nominal both-clip support and vacuous control passes.",
      },
    ],
    PREREG_SPECIFICATION_WEAKNESSES: [
      {
        criterion: "AC5_QUANTIZATION_ONLY_NULL / CMP2_QUANTIZATION_VS_B0",
        weakness:
          "Null has 2 run units, so the 3-run acceptance gate rejects its single candidate (~37.5): 0 accepted is structural, not comb immunity. B0 also shows 1 peak on this null at 2.5 bins, so CMP2's advantage (0 vs 1) is vacuous.",
      },
      {
        criterion: "AC6_PERMUTATION_NULL_COLLAPSE",
        weakness:
          "Passed via the abstention clause only; permuted nulls still yield accepted regimes, so accepted regime count is not by itself evidence of structure.",
      },
      {
        criterion: "I3 merge step",
        weakness:
          "BIC already selects a parsimonious J on these cohorts; no adjacent pair fell below z=2, so merge behaviour is exercised only by unit tests.",
      },
    ],
    DECISION_ROBUSTNESS: {
      scenario: "Score CMP2 as TIE and AC5 as FAIL (treat both vacuous results against RAY-RUN).",
      verdict_under_scenario: "NO_GO_RECOMMEND_B0_B1_BASELINE",
      verdict_unchanged: !outperforms,
      independent_hard_failures: failedHard.filter((id) => id !== "AC5_QUANTIZATION_ONLY_NULL"),
    },
  };
  report.forbidden_field_scan = reportHasForbiddenGearFields(report);
  report.content_sha256_excluding_generated_at = stableReportHash(report);
  return report;
}

const isMain = process.argv[1]?.includes("run_p18b_experimental");
if (isMain) {
  const report = buildP18bExperimentalReport();
  const outPath =
    process.env.P18B_REPORT_PATH ??
    "/opt/cursor/artifacts/ds4-rpm-p18b-ray-run-experimental-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("wrote", outPath);
  console.log("mandatory_gates_pass", report.mandatory_gates_pass);
  const go = report.SCIENTIFIC_GO_NO_GO as { verdict: string };
  console.log("go_no_go", go.verdict);
  console.log("content_sha256", report.content_sha256_excluding_generated_at);
  if (!report.mandatory_gates_pass) process.exitCode = 1;
}
