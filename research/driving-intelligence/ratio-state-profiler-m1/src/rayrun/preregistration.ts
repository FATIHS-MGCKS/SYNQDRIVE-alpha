/**
 * P18B RAY-RUN V1 pre-registration (research-only).
 *
 * Every threshold and acceptance criterion here is fixed before the experimental
 * evaluation is executed. Values marked FABLE_S9 come from the Fable M1 design
 * (§9 pre-registration / §10 confidence policy); values marked P18B_PREREG are
 * new decisions committed before results were produced. Changing any value after
 * results exist invalidates the comparison and must be recorded as a deviation.
 */
export const RAYRUN_PREREG = {
  id: "DS4_RPM_P18B_RAY_RUN_V1_PREREG",

  /** FABLE_S9: claims adopt the ±500 policy; ±250 is a sensitivity run only (I4). */
  rpmPolicyPrimaryRpm: 500,
  rpmPolicySensitivityRpm: 250,
  /** Uniform half-width h → σ = h/√3 (Fable: ±500 → σ≈289). */
  uniformToSigma: 1 / Math.sqrt(3),

  /** FABLE_S9: separability z (I3). */
  separabilityZ: 2,
  /** FABLE_S9: per-run responsibility gate (I5) — used as a decision gate only, never reported as confidence. */
  responsibilityGate: 0.8,
  /** FABLE_S9: minimum run length (s) for the stronger per-second evidence tier. */
  minRunSecondsForTier: 3,
  /** FABLE_S9: minimum n per driving-context stratum. */
  minContextStratumN: 8,
  /** FABLE_S9: regime acceptance — ≥3 runs and present in both clips. */
  minRunsPerRegime: 3,
  requireBothClips: true,
  /** FABLE_S9: J chosen by BIC with n_eff, capped at 4. No J is assumed. */
  maxRegimes: 4,

  /** P18B_PREREG: background (decoupled/unknown) component is uniform over this k domain. */
  backgroundDomainK: [0, 150] as const,
  /** P18B_PREREG: deterministic EM. */
  emMaxIterations: 500,
  emTolerance: 1e-9,
  emInitRestarts: 8,
  emRestartSeed: 7,
  /** P18B_PREREG: centre variance floor (k units²) to keep EM well-posed. */
  minSigmaK: 0.25,

  /** P18B_PREREG: n_eff from within-run residual autocorrelation (Geyer initial positive sequence). */
  autocorrMaxLag: 10,
  autocorrMinRunSeconds: 3,

  /**
   * P18B_PREREG run-level uncertainty (I2): the I2 gate can chain across large ratio drift,
   * so the policy σ alone is too optimistic. Per run:
   *   σ_k̂ = sqrt(DEFF_clip) · max(σ_policy_rpm, RMS_residual_rpm) / sqrt(Σ v²)
   * where RMS_residual_rpm (ddof=1) is used only for runs with ≥ autocorrMinRunSeconds,
   * and DEFF_clip = n_clip / n_eff_clip ≥ 1.
   */
  runSigmaRule: "SQRT_DEFF_TIMES_MAX_POLICY_OR_RESIDUAL_OVER_SQRT_SUM_V2",

  /**
   * P18B_PREREG per-second consistency (I5): a second inherits its run's regime only if its
   * own reading is inside the rpm policy band of that regime ray, |rpm − k_j·v| ≤ policy;
   * otherwise ABSTAIN (SECOND_OUTSIDE_REGIME_RAY_BAND).
   */
  perSecondRayBandCheck: true,

  /**
   * P18B_PREREG per-second speed resolvability (Fable §2.1): the label is in the stronger tier
   * only if |Δk_nearest|·v > 2·policy against the nearest other accepted regime.
   */
  speedResolvabilityFactor: 2,

  /** P18B_PREREG: one histogram bin = agreement tolerance for centre matching. */
  centreMatchToleranceK: 2.5,
  /** P16 mode family (direction check, Fable §4 adoption rule (i)). */
  p16FamilyCentresK: [22.5, 37.5, 45, 50] as const,

  /** P18B_PREREG: synthetic null / power seeds. */
  syntheticSeeds: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110] as const,
  permutationSeeds: [42, 43, 44, 45, 46] as const,
  /** P18B_PREREG: synthetic two-regime alternation block length (s). */
  syntheticAlternationBlockSeconds: 15,
  /** P18B_PREREG: CVT synthetic k range across each clip. */
  syntheticCvtRangeK: [20, 55] as const,
  /** P18B_PREREG: B0 "major mode" definition for synthetic false-split comparison (matches P18A NC controls). */
  b0MajorModeMinCount: 8,
} as const;

export type AcceptanceCriterionKind = "HARD" | "COMPARATIVE";

export interface AcceptanceCriterionSpec {
  id: string;
  kind: AcceptanceCriterionKind;
  statement: string;
}

/**
 * P18B_PREREG acceptance criteria. RAY-RUN is reported as outperforming B0/B1
 * only if every HARD criterion passes AND at least one COMPARATIVE criterion
 * shows an advantage with no COMPARATIVE disadvantage. Otherwise the verdict
 * recommends the simpler B0/B1 baseline.
 */
export const RAYRUN_ACCEPTANCE_CRITERIA: AcceptanceCriterionSpec[] = [
  {
    id: "AC1_SEALED_INTEGRITY",
    kind: "HARD",
    statement: "P16 gate PASS; 242 video pairs / 49 block-5 / 442 R1 same-row counts unchanged.",
  },
  {
    id: "AC2_P16_FAMILY_DIRECTION",
    kind: "HARD",
    statement:
      "≥1 accepted regime, and every accepted regime centre lies within 2.5 rpm/(km/h) of a P16 family centre (22.5/37.5/45/50).",
  },
  {
    id: "AC3_BOTH_CLIP_SUPPORT",
    kind: "HARD",
    statement: "Every accepted regime has ≥3 hard-assigned runs and ≥1 run in each eligible clip.",
  },
  {
    id: "AC4_SYNTHETIC_SINGLE_RATIO_NO_FALSE_SPLIT",
    kind: "HARD",
    statement:
      "Synthetic single k=37.5 on real speed trajectories (±500 uniform noise, 250-rpm quantization): exactly 1 accepted regime within 2.5 of 37.5 in ≥90% of seeds.",
  },
  {
    id: "AC5_QUANTIZATION_ONLY_NULL",
    kind: "HARD",
    statement:
      "Quantization-only null (k=37.5, v∈[20,40] integer, rpm rounded to 250): ≤1 accepted regime (no comb).",
  },
  {
    id: "AC6_PERMUTATION_NULL_COLLAPSE",
    kind: "HARD",
    statement:
      "Within-clip rpm permutation: in ≥4/5 seeds, fewer accepted regimes than real data OR seconds-weighted background/abstain share higher by ≥0.10.",
  },
  {
    id: "AC7_LEAVE_ONE_CLIP_OUT",
    kind: "HARD",
    statement:
      "Each accepted trip regime has a post-merge regime centre within 2.5 in an independent fit of each single clip (or is dropped → criterion fails).",
  },
  {
    id: "AC8_CVT_NO_FALSE_REGIMES",
    kind: "HARD",
    statement:
      "Synthetic continuous-ratio (CVT) k ramp 20→55 per clip: ≤1 accepted regime OR background/abstain share ≥0.5 in ≥80% of seeds.",
  },
  {
    id: "AC9_TWO_REGIME_POWER",
    kind: "HARD",
    statement:
      "Synthetic two regimes k=22.5/37.5 alternating every 15 s: exactly 2 accepted regimes, each within 2.5 of truth, in ≥80% of seeds.",
  },
  {
    id: "CMP1_FALSE_SPLIT_VS_B0",
    kind: "COMPARATIVE",
    statement:
      "On the synthetic single-ratio null, RAY-RUN mean accepted regime count is closer to 1 than B0 mean major-mode count.",
  },
  {
    id: "CMP2_QUANTIZATION_VS_B0",
    kind: "COMPARATIVE",
    statement: "On the quantization-only null, RAY-RUN regime count < B0 histogram peak count.",
  },
  {
    id: "CMP3_CVT_VS_B0",
    kind: "COMPARATIVE",
    statement: "On the CVT synthetic, RAY-RUN mean accepted regime count < B0 mean major-mode count.",
  },
  {
    id: "CMP4_LOCO_VS_B0",
    kind: "COMPARATIVE",
    statement:
      "Leave-one-clip-out: RAY-RUN fraction of accepted regimes replicated in both single-clip fits ≥ B0 min trip-major coverage (P18A NC-D). Lower = disadvantage.",
  },
  {
    id: "CMP5_SPLIT_HALF_VS_B0",
    kind: "COMPARATIVE",
    statement:
      "Split-half: RAY-RUN first-half vs second-half accepted-centre replication ≥ B0 min half-to-half coverage (P18A NC-E). Descriptive only; NC-E remains SCIENTIFIC_NEGATIVE.",
  },
];

/**
 * Mandatory NC-E governance (owner instruction): temporal split-half replication of
 * the frozen baseline failed. RAY-RUN must not present regimes as stable across time.
 */
export const NC_E_GOVERNANCE = {
  requiredVerdict: "SCIENTIFIC_NEGATIVE" as const,
  regimeTemporalStatus: "TRIP_POOLED_NOT_TEMPORALLY_REPLICATED" as const,
  maxPopulationEvidenceTier: "MEDIUM" as const,
  maxPerSecondEvidenceTier: "MEDIUM" as const,
};
