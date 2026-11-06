import type { RatioStableRun, VideoEligibleRow } from "../types.js";
import { segmentRatioStableRuns } from "../compute/segment_runs.js";
import { RAYRUN_PREREG } from "./preregistration.js";

export interface RunUnit {
  run_id: string;
  clip: string;
  start_second: number;
  end_second: number;
  n_seconds: number;
  k_hat: number;
  sigma_k: number;
  sigma_k_policy_only: number;
  rms_residual_rpm: number | null;
  mean_speed_kmh: number;
  deff_clip: number;
  rows: VideoEligibleRow[];
}

export interface TemporalDependence {
  clip: string;
  n: number;
  lag_autocorrelation: number[];
  summed_positive_lags: number;
  n_eff: number;
  deff: number;
  pairs_used_lag1: number;
}

export interface RunUnitBuild {
  rpm_policy_rpm: number;
  units: RunUnit[];
  runs: RatioStableRun[];
  temporal_dependence: TemporalDependence[];
  n_eff_total: number;
}

function slopeThroughOrigin(rows: VideoEligibleRow[]): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.rpm * r.speed_kmh;
    den += r.speed_kmh * r.speed_kmh;
  }
  return den > 0 ? num / den : 0;
}

function rowsOfRun(rows: VideoEligibleRow[], run: RatioStableRun): VideoEligibleRow[] {
  return rows.filter(
    (r) =>
      r.source_clip === run.clip &&
      r.video_second >= run.start_second &&
      r.video_second <= run.end_second,
  );
}

/**
 * Within-run residual autocorrelation per clip; n_eff via Geyer's initial positive
 * sequence (sum lags until the first non-positive ρ, capped at autocorrMaxLag).
 * Only runs with ≥ autocorrMinRunSeconds contribute pairs (shorter runs have
 * residuals forced toward zero by their own fit).
 */
export function clipTemporalDependence(
  clip: string,
  clipRowCount: number,
  runRows: VideoEligibleRow[][],
): TemporalDependence {
  const series: number[][] = [];
  for (const rows of runRows) {
    if (rows.length < RAYRUN_PREREG.autocorrMinRunSeconds) continue;
    const k = slopeThroughOrigin(rows);
    const resid = rows.map((r) => r.rpm - k * r.speed_kmh);
    const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
    series.push(resid.map((e) => e - mean));
  }
  let ss = 0;
  let n0 = 0;
  for (const s of series) {
    for (const e of s) {
      ss += e * e;
      n0++;
    }
  }
  const variance = n0 > 0 ? ss / n0 : 0;
  const rhos: number[] = [];
  let pairsLag1 = 0;
  for (let h = 1; h <= RAYRUN_PREREG.autocorrMaxLag; h++) {
    let acc = 0;
    let pairs = 0;
    for (const s of series) {
      for (let t = 0; t + h < s.length; t++) {
        acc += s[t]! * s[t + h]!;
        pairs++;
      }
    }
    if (h === 1) pairsLag1 = pairs;
    if (pairs === 0 || variance === 0) break;
    rhos.push(acc / pairs / variance);
  }
  let summed = 0;
  for (const rho of rhos) {
    if (rho <= 0) break;
    summed += rho;
  }
  const nEff = clipRowCount / (1 + 2 * summed);
  return {
    clip,
    n: clipRowCount,
    lag_autocorrelation: rhos.map((x) => round(x, 4)),
    summed_positive_lags: round(summed, 4),
    n_eff: round(nEff, 2),
    deff: round(Math.max(1, clipRowCount / nEff), 4),
    pairs_used_lag1: pairsLag1,
  };
}

export function buildRunUnits(
  rows: VideoEligibleRow[],
  rpmPolicy: number = RAYRUN_PREREG.rpmPolicyPrimaryRpm,
): RunUnitBuild {
  const { runs } = segmentRatioStableRuns(rows, rpmPolicy);
  const sigmaRpm = rpmPolicy * RAYRUN_PREREG.uniformToSigma;
  const clips = [...new Set(rows.map((r) => r.source_clip))].sort();

  const runRowsByClip = new Map<string, VideoEligibleRow[][]>();
  const runRows = runs.map((run) => {
    const rr = rowsOfRun(rows, run);
    const list = runRowsByClip.get(run.clip) ?? [];
    list.push(rr);
    runRowsByClip.set(run.clip, list);
    return rr;
  });

  const temporal = clips.map((clip) =>
    clipTemporalDependence(
      clip,
      rows.filter((r) => r.source_clip === clip).length,
      runRowsByClip.get(clip) ?? [],
    ),
  );
  const deffByClip = new Map(temporal.map((t) => [t.clip, t.deff]));

  const units: RunUnit[] = runs.map((run, i) => {
    const rr = runRows[i]!;
    const k = slopeThroughOrigin(rr);
    const sumV2 = rr.reduce((a, r) => a + r.speed_kmh * r.speed_kmh, 0);
    let rms: number | null = null;
    if (rr.length >= RAYRUN_PREREG.autocorrMinRunSeconds) {
      const ss = rr.reduce((a, r) => a + (r.rpm - k * r.speed_kmh) ** 2, 0);
      rms = Math.sqrt(ss / (rr.length - 1));
    }
    const deff = deffByClip.get(run.clip) ?? 1;
    const sigmaPolicyOnly = sigmaRpm / Math.sqrt(sumV2);
    const sigma = (Math.sqrt(deff) * Math.max(sigmaRpm, rms ?? 0)) / Math.sqrt(sumV2);
    return {
      run_id: `${run.clip}|${run.start_second}-${run.end_second}`,
      clip: run.clip,
      start_second: run.start_second,
      end_second: run.end_second,
      n_seconds: rr.length,
      k_hat: k,
      sigma_k: Math.max(sigma, RAYRUN_PREREG.minSigmaK),
      sigma_k_policy_only: sigmaPolicyOnly,
      rms_residual_rpm: rms,
      mean_speed_kmh: rr.reduce((a, r) => a + r.speed_kmh, 0) / rr.length,
      deff_clip: deff,
      rows: rr,
    };
  });

  return {
    rpm_policy_rpm: rpmPolicy,
    units,
    runs,
    temporal_dependence: temporal,
    n_eff_total: round(
      temporal.reduce((a, t) => a + t.n_eff, 0),
      2,
    ),
  };
}

export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
