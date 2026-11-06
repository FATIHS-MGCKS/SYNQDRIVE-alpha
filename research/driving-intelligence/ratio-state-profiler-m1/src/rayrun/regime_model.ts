import { mulberry32 } from "../controls/negative_controls.js";
import { RAYRUN_PREREG } from "./preregistration.js";
import type { RunUnit } from "./run_units.js";

/**
 * I1 origin-ray mixture on run-level rays + I3 separability/merge.
 *
 * Each run contributes k̂_i with its own σ_i (heteroscedastic, from run_units). A regime j
 * is a ray rpm = k_j·v; under the model k̂_i ~ N(k_j, σ_i²). One uniform background
 * component over backgroundDomainK absorbs decoupled/coast/unknown runs.
 */

export interface MixtureFit {
  J: number;
  centres: number[];
  weights: number[];
  background_weight: number;
  log_likelihood: number;
  bic: number;
  /** responsibilities[i][j]; last column is background. Internal only — never reported. */
  responsibilities: number[][];
  centre_se: number[];
  iterations: number;
}

export interface SeparabilityStep {
  k_low: number;
  k_high: number;
  delta_k: number;
  se_low: number;
  se_high: number;
  z: number;
  z_threshold: number;
  action: "MERGED" | "KEPT_SEPARATE";
}

export type RegimeStatus =
  | "ACCEPTED"
  | "REJECTED_INSUFFICIENT_RUNS"
  | "REJECTED_SINGLE_CLIP";

export interface RegimeCandidate {
  id: string;
  centre_k: number;
  centre_se_k: number;
  status: RegimeStatus;
  hard_assigned_runs: number;
  runs_by_clip: Record<string, number>;
  seconds_hard_assigned: number;
  seconds_by_clip: Record<string, number>;
}

export interface RegimeModelResult {
  bic_by_J: Array<{ J: number; bic: number; log_likelihood: number }>;
  n_bic: number;
  selected_J_by_bic: number;
  separability_steps: SeparabilityStep[];
  final_fit: MixtureFit;
  candidates: RegimeCandidate[];
  /** Index into final_fit components (or -1 for background) per unit. */
  hard_assignment: number[];
}

const LOG_2PI = Math.log(2 * Math.PI);

function backgroundLogDensity(k: number): number {
  const [lo, hi] = RAYRUN_PREREG.backgroundDomainK;
  if (k < lo || k > hi) return -1e6;
  return -Math.log(hi - lo);
}

function logSumExp(xs: number[]): number {
  const m = Math.max(...xs);
  if (!Number.isFinite(m)) return m;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

function emFromInit(units: RunUnit[], initCentres: number[]): MixtureFit {
  const J = initCentres.length;
  let centres = [...initCentres];
  let weights = J === 0 ? [] : initCentres.map(() => 0.9 / J);
  let bgWeight = J === 0 ? 1 : 0.1;
  let prevLL = -Infinity;
  let resp: number[][] = [];
  let ll = -Infinity;
  let it = 0;

  for (it = 0; it < RAYRUN_PREREG.emMaxIterations; it++) {
    resp = [];
    ll = 0;
    for (const u of units) {
      const terms: number[] = [];
      for (let j = 0; j < J; j++) {
        const s2 = u.sigma_k * u.sigma_k;
        terms.push(
          Math.log(Math.max(weights[j]!, 1e-300)) -
            0.5 * (LOG_2PI + Math.log(s2) + ((u.k_hat - centres[j]!) ** 2) / s2),
        );
      }
      terms.push(Math.log(Math.max(bgWeight, 1e-300)) + backgroundLogDensity(u.k_hat));
      const lse = logSumExp(terms);
      ll += lse;
      resp.push(terms.map((t) => Math.exp(t - lse)));
    }
    if (J === 0 || Math.abs(ll - prevLL) < RAYRUN_PREREG.emTolerance) break;
    prevLL = ll;

    const n = units.length;
    const newCentres: number[] = [];
    const newWeights: number[] = [];
    for (let j = 0; j < J; j++) {
      let num = 0;
      let den = 0;
      let rsum = 0;
      units.forEach((u, i) => {
        const r = resp[i]![j]!;
        const w = r / (u.sigma_k * u.sigma_k);
        num += w * u.k_hat;
        den += w;
        rsum += r;
      });
      newCentres.push(den > 0 ? num / den : centres[j]!);
      newWeights.push(rsum / n);
    }
    centres = newCentres;
    weights = newWeights;
    bgWeight = resp.reduce((a, r) => a + r[J]!, 0) / n;
  }

  const se = centres.map((_, j) => {
    let info = 0;
    units.forEach((u, i) => {
      info += resp[i]![j]! / (u.sigma_k * u.sigma_k);
    });
    return info > 0 ? 1 / Math.sqrt(info) : Number.POSITIVE_INFINITY;
  });

  return {
    J,
    centres,
    weights,
    background_weight: bgWeight,
    log_likelihood: ll,
    bic: Number.NaN,
    responsibilities: resp,
    centre_se: se,
    iterations: it + 1,
  };
}

function quantileInit(units: RunUnit[], J: number): number[] {
  const ks = units.map((u) => u.k_hat).sort((a, b) => a - b);
  return Array.from({ length: J }, (_, m) => ks[Math.floor(((m + 0.5) / J) * ks.length)]!);
}

function bestFitForJ(units: RunUnit[], J: number): MixtureFit {
  if (J === 0) return emFromInit(units, []);
  const inits: number[][] = [quantileInit(units, J)];
  for (let r = 1; r < RAYRUN_PREREG.emInitRestarts; r++) {
    const rng = mulberry32(RAYRUN_PREREG.emRestartSeed * 1000 + J * 10 + r);
    const idx = new Set<number>();
    while (idx.size < J) idx.add(Math.floor(rng() * units.length));
    inits.push([...idx].map((i) => units[i]!.k_hat).sort((a, b) => a - b));
  }
  let best: MixtureFit | null = null;
  for (const init of inits) {
    const fit = emFromInit(units, init);
    if (!best || fit.log_likelihood > best.log_likelihood + 1e-12) best = fit;
  }
  return best!;
}

function withBic(fit: MixtureFit, nBic: number): MixtureFit {
  const p = 2 * fit.J;
  return { ...fit, bic: -2 * fit.log_likelihood + p * Math.log(Math.max(nBic, 2)) };
}

function sortFit(fit: MixtureFit): MixtureFit {
  const order = fit.centres.map((c, j) => [c, j] as const).sort((a, b) => a[0] - b[0]);
  return {
    ...fit,
    centres: order.map(([, j]) => fit.centres[j]!),
    weights: order.map(([, j]) => fit.weights[j]!),
    centre_se: order.map(([, j]) => fit.centre_se[j]!),
    responsibilities: fit.responsibilities.map((r) => [
      ...order.map(([, j]) => r[j]!),
      r[fit.J]!,
    ]),
  };
}

export function fitRegimeModel(
  units: RunUnit[],
  nEffTotal: number,
  opts: { requireBothClips: boolean; clips: string[] },
): RegimeModelResult {
  const nBic = Math.min(units.length, nEffTotal);
  const maxJ = Math.min(RAYRUN_PREREG.maxRegimes, units.length);
  const bicByJ: RegimeModelResult["bic_by_J"] = [];
  let best: MixtureFit | null = null;
  for (let J = 0; J <= maxJ; J++) {
    const fit = withBic(bestFitForJ(units, J), nBic);
    bicByJ.push({ J, bic: fit.bic, log_likelihood: fit.log_likelihood });
    if (!best || fit.bic < best.bic - 1e-9) best = fit;
  }
  const selectedJ = best!.J;
  const { fit, steps } = applySeparabilityMerge(units, best!, nBic);

  const hard = units.map((_, i) => {
    const r = fit.responsibilities[i]!;
    let arg = fit.J;
    for (let j = 0; j <= fit.J; j++) if (r[j]! > r[arg]!) arg = j;
    return arg === fit.J ? -1 : arg;
  });

  const candidates: RegimeCandidate[] = fit.centres.map((c, j) => {
    const runsByClip: Record<string, number> = Object.fromEntries(opts.clips.map((x) => [x, 0]));
    const secByClip: Record<string, number> = Object.fromEntries(opts.clips.map((x) => [x, 0]));
    let runs = 0;
    let secs = 0;
    units.forEach((u, i) => {
      if (hard[i] !== j) return;
      runs++;
      secs += u.n_seconds;
      runsByClip[u.clip] = (runsByClip[u.clip] ?? 0) + 1;
      secByClip[u.clip] = (secByClip[u.clip] ?? 0) + u.n_seconds;
    });
    let status: RegimeStatus = "ACCEPTED";
    if (runs < RAYRUN_PREREG.minRunsPerRegime) status = "REJECTED_INSUFFICIENT_RUNS";
    else if (opts.requireBothClips && opts.clips.some((cl) => (runsByClip[cl] ?? 0) === 0)) {
      status = "REJECTED_SINGLE_CLIP";
    }
    return {
      id: "",
      centre_k: c,
      centre_se_k: fit.centre_se[j]!,
      status,
      hard_assigned_runs: runs,
      runs_by_clip: runsByClip,
      seconds_hard_assigned: secs,
      seconds_by_clip: secByClip,
    };
  });

  let accIdx = 0;
  let rejIdx = 0;
  for (const c of candidates) {
    c.id =
      c.status === "ACCEPTED"
        ? `RATIO_REGIME_${String.fromCharCode(65 + accIdx++)}`
        : `REJECTED_CANDIDATE_${++rejIdx}`;
  }

  return {
    bic_by_J: bicByJ,
    n_bic: nBic,
    selected_J_by_bic: selectedJ,
    separability_steps: steps,
    final_fit: fit,
    candidates,
    hard_assignment: hard,
  };
}

/**
 * I3: repeatedly merge the least-separable adjacent pair while its separation is below
 * z·sqrt(se_a² + se_b²), refitting EM from the merged centres each time.
 */
export function applySeparabilityMerge(
  units: RunUnit[],
  initial: MixtureFit,
  nBic: number,
): { fit: MixtureFit; steps: SeparabilityStep[] } {
  let fit = sortFit(initial);
  const steps: SeparabilityStep[] = [];
  const z = RAYRUN_PREREG.separabilityZ;
  for (;;) {
    if (fit.J < 2) break;
    let worst = -1;
    let worstZ = Infinity;
    for (let j = 0; j + 1 < fit.J; j++) {
      const zj =
        (fit.centres[j + 1]! - fit.centres[j]!) /
        Math.sqrt(fit.centre_se[j]! ** 2 + fit.centre_se[j + 1]! ** 2);
      if (zj < worstZ) {
        worstZ = zj;
        worst = j;
      }
    }
    if (!(worstZ < z)) break;
    const a = worst;
    steps.push(separabilityStep(fit, a, "MERGED"));
    const wa = fit.weights[a]!;
    const wb = fit.weights[a + 1]!;
    const merged =
      wa + wb > 0
        ? (fit.centres[a]! * wa + fit.centres[a + 1]! * wb) / (wa + wb)
        : (fit.centres[a]! + fit.centres[a + 1]!) / 2;
    const init = [...fit.centres.slice(0, a), merged, ...fit.centres.slice(a + 2)];
    fit = sortFit(withBic(emFromInit(units, init), nBic));
  }
  for (let j = 0; j + 1 < fit.J; j++) steps.push(separabilityStep(fit, j, "KEPT_SEPARATE"));
  return { fit, steps };
}

/** Deterministic EM from explicit initial centres (exposed for separability tests). */
export function fitMixtureFromCentres(units: RunUnit[], centres: number[], nBic: number): MixtureFit {
  return withBic(emFromInit(units, centres), nBic);
}

function separabilityStep(
  fit: MixtureFit,
  j: number,
  action: SeparabilityStep["action"],
): SeparabilityStep {
  const seA = fit.centre_se[j]!;
  const seB = fit.centre_se[j + 1]!;
  const dk = fit.centres[j + 1]! - fit.centres[j]!;
  return {
    k_low: fit.centres[j]!,
    k_high: fit.centres[j + 1]!,
    delta_k: dk,
    se_low: seA,
    se_high: seB,
    z: dk / Math.sqrt(seA * seA + seB * seB),
    z_threshold: RAYRUN_PREREG.separabilityZ,
    action,
  };
}
