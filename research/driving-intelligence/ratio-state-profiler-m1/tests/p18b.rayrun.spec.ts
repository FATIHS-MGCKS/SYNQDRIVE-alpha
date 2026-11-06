import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VideoEligibleRow } from "../src/types.js";
import { resolvePackageRoot, resolveRepoRoot } from "../src/pin/p16_gate.js";
import { eligibleVideoRows, parseP5QcCsv } from "../src/loaders/video_cohort.js";
import { stableReportHash } from "../src/hash.js";
import type { RunUnit } from "../src/rayrun/run_units.js";
import {
  applySeparabilityMerge,
  fitMixtureFromCentres,
  fitRegimeModel,
} from "../src/rayrun/regime_model.js";
import { runRayRun } from "../src/rayrun/pipeline.js";
import { syntheticOnRealSpeeds } from "../src/rayrun/evaluation.js";
import { RAYRUN_ACCEPTANCE_CRITERIA } from "../src/rayrun/preregistration.js";
import { buildP18bExperimentalReport } from "../src/run_p18b_experimental.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);
const p5Path = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");

function unit(clip: string, i: number, k: number, sigma: number): RunUnit {
  return {
    run_id: `${clip}|${i}`,
    clip,
    start_second: i * 10,
    end_second: i * 10 + 5,
    n_seconds: 6,
    k_hat: k,
    sigma_k: sigma,
    sigma_k_policy_only: sigma,
    rms_residual_rpm: null,
    mean_speed_kmh: 60,
    deff_clip: 1,
    rows: [],
  };
}

function row(clip: string, second: number, v: number, rpm: number): VideoEligibleRow {
  return {
    source_clip: clip,
    video_second: second,
    speed_kmh: v,
    rpm,
    ratio: rpm / v,
    pairing_authority: "VIDEO_SAME_FRAME_NOMINAL",
    p5_evidence_class: "SYNTHETIC",
  };
}

function collectKeys(obj: unknown, out: string[] = []): string[] {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) obj.forEach((v) => collectKeys(v, out));
    else
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out.push(k);
        collectKeys(v, out);
      }
  }
  return out;
}

describe("P18B RAY-RUN model components", () => {
  it("I1 recovers two well-separated rays present in both clips", () => {
    const units: RunUnit[] = [];
    for (let i = 0; i < 3; i++) {
      for (const clip of ["A", "B"]) {
        units.push(unit(clip, units.length, 22.5 + (i - 1) * 0.2, 0.5));
        units.push(unit(clip, units.length, 37.5 + (i - 1) * 0.2, 0.5));
      }
    }
    const m = fitRegimeModel(units, units.length, { requireBothClips: true, clips: ["A", "B"] });
    const acc = m.candidates.filter((c) => c.status === "ACCEPTED");
    assert.equal(acc.length, 2);
    assert.ok(Math.abs(acc[0]!.centre_k - 22.5) < 0.5);
    assert.ok(Math.abs(acc[1]!.centre_k - 37.5) < 0.5);
    assert.deepEqual(
      acc.map((c) => c.id),
      ["RATIO_REGIME_A", "RATIO_REGIME_B"],
    );
  });

  it("I3 merges an inseparable adjacent pair (z < 2)", () => {
    const units: RunUnit[] = [];
    for (let i = 0; i < 4; i++) {
      units.push(unit("A", units.length, 40, 3));
      units.push(unit("B", units.length, 41, 3));
    }
    const twoComponent = fitMixtureFromCentres(units, [40, 41], units.length);
    const { fit, steps } = applySeparabilityMerge(units, twoComponent, units.length);
    assert.equal(fit.J, 1);
    assert.equal(steps[0]!.action, "MERGED");
    assert.ok(steps[0]!.z < 2);
  });

  it("separable single-clip candidate is rejected, not merged", () => {
    const units: RunUnit[] = [];
    for (let i = 0; i < 4; i++) units.push(unit("A", units.length, 25, 0.5));
    for (let i = 0; i < 3; i++) {
      units.push(unit("A", units.length, 50, 0.5));
      units.push(unit("B", units.length, 50, 0.5));
    }
    const m = fitRegimeModel(units, units.length, { requireBothClips: true, clips: ["A", "B"] });
    const at25 = m.candidates.find((c) => Math.abs(c.centre_k - 25) < 1);
    const at50 = m.candidates.find((c) => Math.abs(c.centre_k - 50) < 1);
    assert.equal(at25?.status, "REJECTED_SINGLE_CLIP");
    assert.equal(at50?.status, "ACCEPTED");
  });

  it("I5 abstains on an off-ray outlier second and labels the consistent seconds", () => {
    const rows: VideoEligibleRow[] = [];
    for (let s = 1; s <= 60; s++) rows.push(row("A", s, 60, s === 31 ? 6000 : 2250));
    for (let s = 1; s <= 60; s++) rows.push(row("B", s, 60, 2250));
    const r = runRayRun(rows);
    const outlier = r.per_second.find((s) => s.key === "A|31")!;
    assert.equal(outlier.state, "ABSTAIN");
    assert.ok(outlier.abstain_reason);
    assert.equal(r.accepted_centres.length, 1);
    assert.ok(Math.abs(r.accepted_centres[0]! - 37.5) < 0.5);
    const labelled = r.per_second.filter((s) => s.state === "LABELLED");
    assert.equal(labelled.length, 119);
    assert.ok(labelled.every((s) => s.tier_reported !== "HIGH"), "NC-E caps per-second tier");
  });

  it("synthetic single ratio on real speeds yields exactly one regime, deterministically", () => {
    const eligible = eligibleVideoRows(parseP5QcCsv(p5Path));
    const rows = syntheticOnRealSpeeds(eligible, 101, () => 37.5);
    const a = runRayRun(rows);
    const b = runRayRun(rows);
    assert.equal(a.accepted_centres.length, 1);
    assert.ok(Math.abs(a.accepted_centres[0]! - 37.5) <= 2.5);
    assert.deepEqual(a.accepted_centres, b.accepted_centres);
  });
});

describe("P18B experimental report", () => {
  const report = buildP18bExperimentalReport();

  it("passes mandatory gates and preserves 242 / 49 / 442", () => {
    assert.equal(report.mandatory_gates_pass, true);
    const counts = report.P16_COUNTS_PRESERVED as Record<string, unknown>;
    assert.equal(counts.video_pair_count, 242);
    assert.equal(counts.block5_count, 49);
    assert.equal(counts.r1_same_row_vmin_20, 442);
    assert.equal(counts.r1_used_by_rayrun, false);
  });

  it("propagates mandatory NC-E = SCIENTIFIC_NEGATIVE and never reports HIGH tiers", () => {
    const ncE = report.NC_E_IMPACT as Record<string, unknown>;
    assert.equal(ncE.governing_nc_e_verdict, "SCIENTIFIC_NEGATIVE");
    assert.equal(ncE.regime_temporal_status, "TRIP_POOLED_NOT_TEMPORALLY_REPLICATED");
    for (const c of report.REGIME_CANDIDATES as Array<Record<string, unknown>>) {
      assert.notEqual(c.population_tier_reported, "HIGH");
      assert.equal(c.temporal_status, "TRIP_POOLED_NOT_TEMPORALLY_REPLICATED");
    }
    const cov = (report.CLASSIFICATION_COVERAGE as { pm500: { tier_reported_counts: { HIGH: number } } })
      .pm500;
    assert.equal(cov.tier_reported_counts.HIGH, 0);
  });

  it("emits no probability/posterior/responsibility fields and no gear fields", () => {
    const allowed = new Set(["RESPONSIBILITY_BELOW_GATE", "probabilities_emitted"]);
    const keys = collectKeys(report);
    assert.deepEqual(
      keys.filter((k) => /probab|posterior|responsib|confidence_score/i.test(k) && !allowed.has(k)),
      [],
    );
    assert.deepEqual(report.forbidden_field_scan, []);
    const policy = (report.CLASSIFICATION_COVERAGE as { confidence_policy: Record<string, unknown> })
      .confidence_policy;
    assert.equal(policy.probabilities_emitted, false);
  });

  it("evaluates every pre-registered criterion and the verdict follows the decision rule", () => {
    const cmp = report.BASELINE_COMPARISON as {
      acceptance_criteria: Array<{ id: string; kind: string; result: string }>;
      hard_all_pass: boolean;
      comparative_advantages: number;
      comparative_disadvantages: number;
    };
    assert.deepEqual(
      cmp.acceptance_criteria.map((c) => c.id),
      RAYRUN_ACCEPTANCE_CRITERIA.map((c) => c.id),
    );
    const outperforms =
      cmp.hard_all_pass && cmp.comparative_advantages >= 1 && cmp.comparative_disadvantages === 0;
    const go = report.SCIENTIFIC_GO_NO_GO as { verdict: string; rayrun_outperforms_b0_b1: boolean };
    assert.equal(go.rayrun_outperforms_b0_b1, outperforms);
    assert.equal(
      go.verdict,
      outperforms ? "GO_EXPERIMENTAL_RESEARCH_CONTINUATION_ONLY" : "NO_GO_RECOMMEND_B0_B1_BASELINE",
    );
  });

  it("is deterministic and matches the pinned P18B evidence manifest", () => {
    const again = buildP18bExperimentalReport();
    assert.equal(
      stableReportHash(report as Record<string, unknown>),
      stableReportHash(again as Record<string, unknown>),
    );
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, "fixtures/p18b-evidence-manifest.json"), "utf8"),
    ) as { p18b_report_content_sha256_excluding_generated_at: string; scientific_go_no_go: string };
    assert.equal(
      report.content_sha256_excluding_generated_at,
      manifest.p18b_report_content_sha256_excluding_generated_at,
    );
    assert.equal(
      (report.SCIENTIFIC_GO_NO_GO as { verdict: string }).verdict,
      manifest.scientific_go_no_go,
    );
  });

  it("fails closed on a mutated sealed P5 copy without touching the repo file", () => {
    const dir = mkdtempSync(join(tmpdir(), "p18b-mut-"));
    try {
      const copy = join(dir, "p5.csv");
      copyFileSync(p5Path, copy);
      appendFileSync(copy, "\n");
      const failed = buildP18bExperimentalReport({
        sealedPathOverrides: { p5_optical_qc_overlay: copy },
      });
      assert.equal(failed.mandatory_gates_pass, false);
      assert.equal(failed.fail_closed_reason, "SOURCE_INTEGRITY_FAIL_CLOSED");
      assert.equal(
        (failed.SCIENTIFIC_GO_NO_GO as { verdict: string }).verdict,
        "NO_GO_FAIL_CLOSED",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
