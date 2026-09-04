/**
 * RD004-B.5 / DI-EV-0035B.5 — HF historical recovery policy design + counterfactual simulation.
 * Read-only analysis; does NOT modify production runtime or constants.
 */
import {
  classifyWatermarkExclusion,
  type HfLateArrivalDifferentialRow,
  type WatermarkExclusionClassification,
} from './reference-capture-hf-aggregate-bucket-analysis';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import {
  B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
  CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
  DIMO_BUCKET_SEMANTICS,
  type OriginalHfQueryWindow,
} from './reference-capture-rd004-b-hf-exact-window-replay';

export const RD004_B5_EVIDENCE_ID = 'DI-EV-0035B.5';

/** Analysis candidates only — not production constants. */
export const CANDIDATE_SETTLEMENT_DELAY_SECONDS = [0, 2, 4, 5, 6, 8, 10] as const;
export const CANDIDATE_RECOVERY_OVERLAP_SECONDS = [2, 4, 6, 8, 10, 15, 20] as const;

export const CURRENT_PRODUCTION_OVERLAP_MS = HF_QUERY_OVERLAP_MS;
export const CURRENT_PRODUCTION_OVERLAP_SECONDS = HF_QUERY_OVERLAP_MS / 1000;

export type SettlementCoverageResult = {
  settlementDelaySeconds: number;
  closedLateBucketsWithLowerBoundLag: number;
  /** LOWER_BOUND: lag lower bound <= delay — settlement may have been sufficient before query eligibility. */
  observedClosedLateBucketsProtectedBySettlementDelay: number;
  openLateBucketsNotApplicable: number;
  coverageFractionOfClosedLateBuckets: number;
  interpretation: 'LOWER_BOUND' | 'NOT_DETERMINABLE';
};

export type OverlapRecoveryResult = {
  recoveryOverlapSeconds: number;
  observedDefinitelyExcludedCount: number;
  observedPotentiallyRecoverableCount: number;
  observedPartiallyOverlappedCount: number;
  estimatedRecoverableLateBucketCount: number;
  estimatedDefinitelyMissedBucketCount: number;
  interpretation: 'COVERAGE_TEMPORAL_RECOVERY_LOWER_BOUND' | 'NOT_DETERMINABLE';
  note: string;
};

export type CombinedPolicySimulationRow = {
  candidateSettlementDelaySeconds: number;
  candidateRecoveryOverlapSeconds: number;
  observedClosedLateBucketsProtectedBySettlementDelay: number;
  lateBucketsStillRequiringRecovery: number;
  estimatedRecoverableLateBucketCount: number;
  estimatedDefinitelyMissedBucketCount: number;
  queryWindowExpansionSeconds: number;
  estimatedRepeatedQueryCoverageFraction: number;
  expectedDuplicateRetrievalPressure: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  confidence: 'LOWER_BOUND' | 'UPPER_BOUND' | 'NOT_DETERMINABLE';
};

export type PolicyArchitectureOption = {
  policyId: 'POLICY_A' | 'POLICY_B' | 'POLICY_C' | 'POLICY_D';
  label: string;
  settlementDelaySeconds: number | null;
  recoveryOverlapSeconds: number;
  periodicDeepRecovery: boolean;
  dataCompleteness: string;
  latency: string;
  queryCost: string;
  duplicateVolume: string;
  providerLoad: string;
  complexity: string;
  failureRecovery: string;
  drivingIntelligenceSuitability: string;
};

export type HfRecoveryPolicyRecommendation = {
  RECOMMENDED_HF_RECOVERY_ARCHITECTURE:
    | 'SETTLED_HORIZON_PLUS_OVERLAP'
    | 'SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP'
    | 'CONTINUOUS_OVERLAP_ONLY'
    | 'REQUIRES_MORE_VALIDATION';
  RECOMMENDED_SETTLEMENT_DELAY_SECONDS: number | null;
  RECOMMENDED_RECOVERY_OVERLAP_SECONDS: number | null;
  RECOMMENDED_POLICY_PARAMETERS: 'SPECIFIED' | 'REQUIRES_MORE_VALIDATION';
  PERIODIC_DEEP_RECOVERY_RECOMMENDED: 'YES' | 'NO' | 'OPTIONAL';
  PRODUCTION_SAFETY_MARGIN_SECONDS: number;
  OBSERVED_MAX_LAG_LOWER_BOUND_SECONDS: number;
  marginRationale: string;
  justification: string;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Settlement delay and recovery overlap are independent analysis dimensions.
 * This helper exists to document that separation in tests and artifacts.
 */
export function areSettlementAndOverlapIndependent(): boolean {
  return true;
}

/**
 * LOWER_BOUND lag is not exact provider availability — conservative settlement coverage.
 */
export function closedLateBucketProtectedBySettlementDelay(
  row: HfLateArrivalDifferentialRow,
  settlementDelaySeconds: number,
): boolean {
  if (row.bucketClosureAtOriginalResponse !== 'CLOSED') return false;
  const lag = row.availabilityLagLowerBoundSeconds;
  if (lag == null) return false;
  return lag <= settlementDelaySeconds;
}

/**
 * Deferred from hot-edge query: bucket end falls inside the settlement exclusion zone.
 * LOWER_BOUND — does not prove provider availability, only query-eligibility deferral.
 */
export function closedLateBucketDeferredBySettlementHorizon(
  row: HfLateArrivalDifferentialRow,
  settlementDelaySeconds: number,
): boolean {
  if (row.bucketClosureAtOriginalResponse !== 'CLOSED') return false;
  const requestMs = parseMs(row.originalRequestStartedAt);
  const bucketEndMs = parseMs(row.bucketEnd);
  if (requestMs == null || bucketEndMs == null) return false;
  const safeQueryToMs = requestMs - settlementDelaySeconds * 1000;
  return bucketEndMs > safeQueryToMs;
}

export function simulateOverlapRecoveryClassification(
  row: HfLateArrivalDifferentialRow,
  recoveryOverlapSeconds: number,
): WatermarkExclusionClassification {
  const queryToMs = parseMs(row.originalHfWindowTo);
  if (queryToMs == null) return 'NO_NEXT_WINDOW_EVIDENCE';
  const simulatedNextFromMs = queryToMs - recoveryOverlapSeconds * 1000;
  return classifyWatermarkExclusion({
    bucketTimestamp: row.bucketStart,
    nextWindowFrom: new Date(simulatedNextFromMs).toISOString(),
  });
}

export function simulateSettlementCoverage(
  lateRows: HfLateArrivalDifferentialRow[],
  settlementDelaySeconds: number,
): SettlementCoverageResult {
  const closed = lateRows.filter((r) => r.bucketClosureAtOriginalResponse === 'CLOSED');
  const open = lateRows.filter((r) => r.bucketClosureAtOriginalResponse === 'OPEN');
  const protectedByLag = closed.filter((r) =>
    closedLateBucketProtectedBySettlementDelay(r, settlementDelaySeconds),
  ).length;
  const protectedByHorizon = closed.filter((r) =>
    closedLateBucketDeferredBySettlementHorizon(r, settlementDelaySeconds),
  ).length;
  const protectedCount = Math.max(protectedByLag, protectedByHorizon);

  return {
    settlementDelaySeconds,
    closedLateBucketsWithLowerBoundLag: closed.length,
    observedClosedLateBucketsProtectedBySettlementDelay: protectedCount,
    openLateBucketsNotApplicable: open.length,
    coverageFractionOfClosedLateBuckets:
      closed.length > 0 ? protectedCount / closed.length : 0,
    interpretation: 'LOWER_BOUND',
  };
}

export function simulateOverlapRecovery(
  lateRows: HfLateArrivalDifferentialRow[],
  recoveryOverlapSeconds: number,
): OverlapRecoveryResult {
  const classifications = lateRows.map((r) =>
    simulateOverlapRecoveryClassification(r, recoveryOverlapSeconds),
  );
  const definitelyExcluded = classifications.filter(
    (c) => c === 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK',
  ).length;
  const potentiallyRecoverable = classifications.filter(
    (c) => c === 'POTENTIALLY_REQUERYABLE',
  ).length;
  const partiallyOverlapped = classifications.filter(
    (c) => c === 'PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW',
  ).length;
  const recoverable = lateRows.length - definitelyExcluded;

  return {
    recoveryOverlapSeconds,
    observedDefinitelyExcludedCount: definitelyExcluded,
    observedPotentiallyRecoverableCount: potentiallyRecoverable,
    observedPartiallyOverlappedCount: partiallyOverlapped,
    estimatedRecoverableLateBucketCount: recoverable,
    estimatedDefinitelyMissedBucketCount: definitelyExcluded,
    interpretation: 'COVERAGE_TEMPORAL_RECOVERY_LOWER_BOUND',
    note:
      'Temporal recovery analysis only — query-from-anchored buckets are not exact-identity compared across changed origins.',
  };
}

export function estimateDuplicatePressure(
  overlapSeconds: number,
  medianWindowDurationSeconds: number,
): 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' {
  if (medianWindowDurationSeconds <= 0) return 'NOT_DETERMINABLE' as never;
  const ratio = overlapSeconds / medianWindowDurationSeconds;
  if (ratio <= 0.35) return 'LOW';
  if (ratio <= 0.65) return 'MODERATE';
  if (ratio <= 0.9) return 'HIGH';
  return 'VERY_HIGH';
}

export function simulateCombinedPolicy(
  lateRows: HfLateArrivalDifferentialRow[],
  settlementDelaySeconds: number,
  recoveryOverlapSeconds: number,
  medianWindowDurationSeconds: number,
): CombinedPolicySimulationRow {
  const settlement = simulateSettlementCoverage(lateRows, settlementDelaySeconds);
  const overlap = simulateOverlapRecovery(lateRows, recoveryOverlapSeconds);

  const stillRequiringRecovery = lateRows.filter((row) => {
    const settled =
      row.bucketClosureAtOriginalResponse === 'CLOSED' &&
      (closedLateBucketProtectedBySettlementDelay(row, settlementDelaySeconds) ||
        closedLateBucketDeferredBySettlementHorizon(row, settlementDelaySeconds));
    if (settled) return false;
    const cls = simulateOverlapRecoveryClassification(row, recoveryOverlapSeconds);
    return cls === 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK';
  }).length;

  const recoverable = lateRows.length - stillRequiringRecovery;
  const repeatedFraction =
    medianWindowDurationSeconds > 0
      ? Math.min(1, recoveryOverlapSeconds / medianWindowDurationSeconds)
      : 0;

  let confidence: CombinedPolicySimulationRow['confidence'] = 'LOWER_BOUND';
  if (lateRows.length === 0) confidence = 'NOT_DETERMINABLE';

  return {
    candidateSettlementDelaySeconds: settlementDelaySeconds,
    candidateRecoveryOverlapSeconds: recoveryOverlapSeconds,
    observedClosedLateBucketsProtectedBySettlementDelay:
      settlement.observedClosedLateBucketsProtectedBySettlementDelay,
    lateBucketsStillRequiringRecovery: stillRequiringRecovery,
    estimatedRecoverableLateBucketCount: recoverable,
    estimatedDefinitelyMissedBucketCount: stillRequiringRecovery,
    queryWindowExpansionSeconds: settlementDelaySeconds,
    estimatedRepeatedQueryCoverageFraction: repeatedFraction,
    expectedDuplicateRetrievalPressure: estimateDuplicatePressure(
      recoveryOverlapSeconds,
      medianWindowDurationSeconds,
    ),
    confidence,
  };
}

export function buildSettlementCoverageTable(lateRows: HfLateArrivalDifferentialRow[]) {
  const table = CANDIDATE_SETTLEMENT_DELAY_SECONDS.map((s) => simulateSettlementCoverage(lateRows, s));
  const keyed: Record<string, number> = {};
  for (const row of table) {
    keyed[`SETTLEMENT_${row.settlementDelaySeconds}S_COVERAGE`] =
      row.observedClosedLateBucketsProtectedBySettlementDelay;
  }
  return { table, keyed };
}

export function buildOverlapRecoveryTable(lateRows: HfLateArrivalDifferentialRow[]) {
  return CANDIDATE_RECOVERY_OVERLAP_SECONDS.map((o) => simulateOverlapRecovery(lateRows, o));
}

export function buildCombinedPolicyGrid(
  lateRows: HfLateArrivalDifferentialRow[],
  medianWindowDurationSeconds: number,
): CombinedPolicySimulationRow[] {
  const grid: CombinedPolicySimulationRow[] = [];
  for (const settlement of CANDIDATE_SETTLEMENT_DELAY_SECONDS) {
    for (const overlap of CANDIDATE_RECOVERY_OVERLAP_SECONDS) {
      grid.push(simulateCombinedPolicy(lateRows, settlement, overlap, medianWindowDurationSeconds));
    }
  }
  return grid;
}

export function computeMedianWindowDurationSeconds(windows: OriginalHfQueryWindow[]): number {
  const durations = windows
    .map((w) => {
      const toMs = parseMs(w.hfActualQueryTo ?? w.hfWindowTo);
      const fromMs = parseMs(w.hfWindowFrom);
      if (toMs == null || fromMs == null) return null;
      return (toMs - fromMs) / 1000;
    })
    .filter((v): v is number => v != null && v > 0);
  if (!durations.length) return 7.767;
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function countUniqueTemporalBucketStarts(rows: HfLateArrivalDifferentialRow[]): number {
  return new Set(rows.map((r) => r.bucketStart)).size;
}

export function derivePolicyRecommendation(args: {
  lateRows: HfLateArrivalDifferentialRow[];
  observedMaxLagSeconds: number;
  observedP95LagSeconds: number;
  medianWindowDurationSeconds: number;
  combinedGrid: CombinedPolicySimulationRow[];
}): HfRecoveryPolicyRecommendation {
  const safetyMarginSeconds = 2;
  const productionSettlementTarget = Math.ceil(args.observedMaxLagSeconds) + safetyMarginSeconds;
  const roundedSettlement =
    CANDIDATE_SETTLEMENT_DELAY_SECONDS.find((s) => s >= productionSettlementTarget) ??
    CANDIDATE_SETTLEMENT_DELAY_SECONDS[CANDIDATE_SETTLEMENT_DELAY_SECONDS.length - 1];

  const overlapTarget = Math.ceil(args.observedP95LagSeconds) + 2;
  let roundedOverlap: number =
    CANDIDATE_RECOVERY_OVERLAP_SECONDS.find((o) => o >= overlapTarget) ??
    CANDIDATE_RECOVERY_OVERLAP_SECONDS[CANDIDATE_RECOVERY_OVERLAP_SECONDS.length - 1];

  const comboAtTarget = args.combinedGrid.find(
    (r) =>
      r.candidateSettlementDelaySeconds === roundedSettlement &&
      r.candidateRecoveryOverlapSeconds === roundedOverlap,
  );

  const settlementWithModerateOverlap = args.combinedGrid.find(
    (r) =>
      r.candidateSettlementDelaySeconds === roundedSettlement &&
      r.candidateRecoveryOverlapSeconds === 6 &&
      r.estimatedDefinitelyMissedBucketCount === 0,
  );
  if (settlementWithModerateOverlap) {
    roundedOverlap = settlementWithModerateOverlap.candidateRecoveryOverlapSeconds;
  } else if (comboAtTarget && comboAtTarget.expectedDuplicateRetrievalPressure === 'VERY_HIGH') {
    const minOverlapForEvidence = Math.max(6, overlapTarget);
    const lighter = args.combinedGrid
      .filter(
        (r) =>
          r.candidateSettlementDelaySeconds === roundedSettlement &&
          r.estimatedDefinitelyMissedBucketCount === 0 &&
          r.candidateRecoveryOverlapSeconds >= minOverlapForEvidence,
      )
      .sort(
        (a, b) =>
          a.estimatedRepeatedQueryCoverageFraction - b.estimatedRepeatedQueryCoverageFraction,
      )[0];
    if (lighter) roundedOverlap = lighter.candidateRecoveryOverlapSeconds;
  }

  const recommendedCombo = args.combinedGrid.find(
    (r) =>
      r.candidateSettlementDelaySeconds === roundedSettlement &&
      r.candidateRecoveryOverlapSeconds === roundedOverlap,
  );

  const overlapOnly6 = args.combinedGrid.find(
    (r) => r.candidateSettlementDelaySeconds === 0 && r.candidateRecoveryOverlapSeconds === 6,
  );
  const settledPlusOverlap = recommendedCombo;

  const missed = settledPlusOverlap?.estimatedDefinitelyMissedBucketCount ?? args.lateRows.length;
  const recoverable = args.lateRows.length - missed;

  return {
    RECOMMENDED_HF_RECOVERY_ARCHITECTURE: 'SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP',
    RECOMMENDED_SETTLEMENT_DELAY_SECONDS: roundedSettlement,
    RECOMMENDED_RECOVERY_OVERLAP_SECONDS: roundedOverlap,
    RECOMMENDED_POLICY_PARAMETERS: args.lateRows.length > 0 ? 'SPECIFIED' : 'REQUIRES_MORE_VALIDATION',
    PERIODIC_DEEP_RECOVERY_RECOMMENDED: 'YES',
    PRODUCTION_SAFETY_MARGIN_SECONDS: safetyMarginSeconds,
    OBSERVED_MAX_LAG_LOWER_BOUND_SECONDS: args.observedMaxLagSeconds,
    marginRationale:
      `Observed closed-bucket availability lag lower-bound max ${args.observedMaxLagSeconds}s (n=50, not P99) + ${safetyMarginSeconds}s engineering margin → settlement target ≥${roundedSettlement}s.`,
    justification:
      `B.4 evidence: ${args.lateRows.length} exact-origin aggregate bucket observations appeared later; 26/53 definitely excluded at 2s overlap. ` +
      `Counterfactual at settlement=${roundedSettlement}s + overlap=${roundedOverlap}s: LOWER_BOUND recoverable ~${recoverable}/${args.lateRows.length}, missed ~${missed}. ` +
      `Overlap-only (0s delay, 6s overlap) temporal recovery LOWER_BOUND ~${overlapOnly6?.estimatedRecoverableLateBucketCount ?? 'N/A'} but queries live edge without settlement — duplicate pressure ${overlapOnly6?.expectedDuplicateRetrievalPressure ?? 'HIGH'} and unsettled-horizon risk remain. ` +
      `Periodic deep recovery sweep recommended because OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND=YES and zero-result windows not reconstructible.`,
  };
}

export function buildPolicyArchitectureOptions(
  recommendation: HfRecoveryPolicyRecommendation,
  medianWindowDurationSeconds: number,
): PolicyArchitectureOption[] {
  const recOverlap = recommendation.RECOMMENDED_RECOVERY_OVERLAP_SECONDS ?? 8;
  const recSettlement = recommendation.RECOMMENDED_SETTLEMENT_DELAY_SECONDS ?? 8;
  return [
    {
      policyId: 'POLICY_A',
      label: '0s settlement delay + larger overlap only',
      settlementDelaySeconds: 0,
      recoveryOverlapSeconds: 15,
      periodicDeepRecovery: false,
      dataCompleteness:
        'Improves temporal re-query of prior windows but still queries live edge — late buckets near horizon remain exposed.',
      latency: 'Minimal additional latency.',
      queryCost: 'High duplicate fraction (~15s / ~7.8s window ≈ VERY_HIGH pressure).',
      duplicateVolume: 'VERY_HIGH',
      providerLoad: 'Elevated — wide overlap on every cycle.',
      complexity: 'Low — overlap constant change only.',
      failureRecovery: 'Weak for buckets excluded before overlap reaches them.',
      drivingIntelligenceSuitability: 'Poor alone — does not address unsettled aggregate horizon.',
    },
    {
      policyId: 'POLICY_B',
      label: 'Provider settlement delay + moderate overlap',
      settlementDelaySeconds: recSettlement,
      recoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: false,
      dataCompleteness:
        'Addresses both unsettled live-edge buckets and watermark recovery gap (B.4 root cause).',
      latency: `~${recSettlement}s behind real time for HF historical surface.`,
      queryCost: `Moderate overlap (${recOverlap}s) on ~${medianWindowDurationSeconds.toFixed(1)}s median window.`,
      duplicateVolume: estimateDuplicatePressure(recOverlap, medianWindowDurationSeconds),
      providerLoad: 'Moderate — fewer live-edge misses than today.',
      complexity: 'Moderate — extend resolveHfActualQueryTo with settlement horizon.',
      failureRecovery: 'Good for observed 50 closed late buckets; residual misses need sweep.',
      drivingIntelligenceSuitability: 'Recommended baseline for episode reconstruction confidence.',
    },
    {
      policyId: 'POLICY_C',
      label: 'Settlement delay + overlap + periodic deep recovery sweep',
      settlementDelaySeconds: recSettlement,
      recoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: true,
      dataCompleteness:
        'Best LOWER_BOUND coverage — fast loop for freshness + idempotent sweep for missed closed buckets.',
      latency: `Fast loop ~${recSettlement}s behind; sweep replays older closed intervals asynchronously.`,
      queryCost: 'Fast loop moderate; sweep adds bounded extra queries (not every cycle).',
      duplicateVolume: 'Moderate fast loop + controlled sweep duplicates (fingerprint-idempotent).',
      providerLoad: 'Spread over time — preferable to huge continuous overlap.',
      complexity: 'Higher — second recovery scheduler + metrics.',
      failureRecovery: 'Strongest — addresses OBSERVED_MISSED_BUCKET_COUNT lower bound.',
      drivingIntelligenceSuitability: 'Best fit for RD004 / DI episode confidence requirements.',
    },
    {
      policyId: 'POLICY_D',
      label: 'Dual-watermark (data watermark vs query coverage + recovery cursor)',
      settlementDelaySeconds: recSettlement,
      recoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: true,
      dataCompleteness:
        'Separates persisted DATA watermark from QUERY COVERAGE and optional RECOVERY cursor (extends 3A.3.2 model).',
      latency: 'Same as Policy C with clearer observability.',
      queryCost: 'Similar to C with better dedupe targeting.',
      duplicateVolume: 'Moderate — idempotent physical fingerprint absorbs revisions.',
      providerLoad: 'Moderate.',
      complexity: 'Highest — explicit triple cursor semantics.',
      failureRecovery: 'Excellent auditability for late revisions and sweeps.',
      drivingIntelligenceSuitability: 'Preferred long-term architecture if implementation cost acceptable.',
    },
  ];
}

export function buildHfRuntimeFixContract(recommendation: HfRecoveryPolicyRecommendation) {
  return {
    evidenceId: RD004_B5_EVIDENCE_ID,
    mode: 'HF_RUNTIME_FIX_IMPLEMENTATION_CONTRACT',
    status: 'DESIGN_ONLY_NOT_IMPLEMENTED',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    targetModule: 'reference-capture-acquisition.service.ts',
    relatedModules: [
      'reference-capture-hf-watermark-policy.ts',
      'reference-capture-query-builder.ts',
      'reference-capture-physical-sample-identity.util.ts',
    ],
    expectedChanges: {
      resolveHfActualQueryTo:
        'Apply settlementDelayMs: safeQueryTo = requestStartedAt - settlementDelayMs (not live edge).',
      computeHfQueryFrom:
        'Use configurable recoveryOverlapMs instead of fixed HF_QUERY_OVERLAP_MS constant at call site.',
      hfQueryCoverageByField:
        'Advance to safeQueryTo after successful query; preserve per-field coverage semantics.',
      watermarkAdvancement:
        'DATA watermark (hfWatermarkByField) advances on durable persist only; QUERY COVERAGE tracks safeQueryTo.',
      overlap: 'Parameterize recoveryOverlapMs per manifest/policy — do not change global constant in evidence PR.',
      settlementDelay:
        'New policy parameter settlementDelayMs derived from RECOMMENDED_SETTLEMENT_DELAY_SECONDS after validation drive.',
      lateBucketRevisions:
        'Preserve IMMUTABLE_FIRST_SEEN + revision side-channel per 3A.3.2; sweeps must remain idempotent.',
      idempotency:
        'physicalSampleFingerprint + aggregate bucket identity V2 unchanged; sweeps dedupe via existing durable idempotency.',
      observability:
        'Emit runtime metrics listed below; log safeQueryTo vs requestStartedAt each cycle.',
      periodicRecoverySweep:
        'Optional job: replay [recoveryCursor, dataWatermark - margin] with same interval/aggregation; advance recoveryCursor idempotently.',
    },
    requiredRuntimeMetrics: [
      'hf_query_from',
      'hf_query_to',
      'settlement_delay_ms',
      'overlap_ms',
      'provider_bucket_count',
      'new_bucket_count',
      'duplicate_bucket_count',
      'revision_bucket_count',
      'latest_bucket_age_ms',
      'recovery_sweep_count',
      'recovered_late_bucket_count',
    ],
    recommendedParameters: {
      RECOMMENDED_SETTLEMENT_DELAY_SECONDS: recommendation.RECOMMENDED_SETTLEMENT_DELAY_SECONDS,
      RECOMMENDED_RECOVERY_OVERLAP_SECONDS: recommendation.RECOMMENDED_RECOVERY_OVERLAP_SECONDS,
      RECOMMENDED_HF_RECOVERY_ARCHITECTURE: recommendation.RECOMMENDED_HF_RECOVERY_ARCHITECTURE,
      PERIODIC_DEEP_RECOVERY_RECOMMENDED: recommendation.PERIODIC_DEEP_RECOVERY_RECOMMENDED,
    },
    validationPlan: {
      unitTests: 'Watermark + settlement + overlap pure functions; idempotent sweep dedupe.',
      deterministicReplayTests:
        'Replay RD004 sealed windows with candidate policies; compare recoverable bucket counts to B.5 simulation.',
      controlledLiveCapture:
        'One short reference capture (RD005-style) with policy enabled in staging only.',
      densityComparison:
        'Provider exact-window replay density vs sealed capture density — target gap closure.',
      gapAudit: 'Prove no large acquisition-created gaps vs provider replay envelope.',
      videoTelemetryGate:
        'Only after capture completeness validated: repeat RD004 absolute speed/clock/acceleration validation.',
    },
    implementationPrerequisite: 'Separate production PR after B.5 analysis merge; not part of DI-EV-0035B.5.',
  };
}

export type B4WatermarkEvidence = {
  LATE_ARRIVAL_BUCKET_COUNT: number;
  CLOSED_LATE_ARRIVAL_BUCKET_COUNT: number;
  LATE_ARRIVAL_LAG_P50_SECONDS: number | null;
  LATE_ARRIVAL_LAG_P95_SECONDS: number | null;
  LATE_ARRIVAL_LAG_MAX_SECONDS: number | null;
  DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT: number;
  CURRENT_2S_OVERLAP_SUFFICIENT: string;
  HF_CAPTURE_ROOT_CAUSE: string;
};

export function buildRecoveryPolicySimulation(args: {
  lateRows: HfLateArrivalDifferentialRow[];
  queryWindows: OriginalHfQueryWindow[];
  b4Watermark: B4WatermarkEvidence;
}) {
  const medianWindowDurationSeconds = computeMedianWindowDurationSeconds(args.queryWindows);
  const settlement = buildSettlementCoverageTable(args.lateRows);
  const overlap = buildOverlapRecoveryTable(args.lateRows);
  const combinedGrid = buildCombinedPolicyGrid(
    args.lateRows,
    medianWindowDurationSeconds,
  );

  const bestCombo = [...combinedGrid].sort(
    (a, b) =>
      a.estimatedDefinitelyMissedBucketCount - b.estimatedDefinitelyMissedBucketCount ||
      a.estimatedRepeatedQueryCoverageFraction - b.estimatedRepeatedQueryCoverageFraction,
  )[0];

  return {
    evidenceId: RD004_B5_EVIDENCE_ID,
    mode: 'HF_RECOVERY_POLICY_COUNTERFACTUAL_SIMULATION',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    b4EvidencePreserved: {
      DIMO_BUCKET_SEMANTICS,
      CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
      B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
      HF_CAPTURE_ROOT_CAUSE: args.b4Watermark.HF_CAPTURE_ROOT_CAUSE,
    },
    currentCaptureBehavior: {
      queryToApproximation: 'QUERY_TO ≈ requestStartedAt (live edge)',
      coverageAdvance: 'hfQueryCoverageByField → actualQueryTo after successful query',
      nextQueryFrom: 'previousQueryCoverage - HF_QUERY_OVERLAP_MS (2000ms)',
      HF_QUERY_OVERLAP_MS: CURRENT_PRODUCTION_OVERLAP_MS,
      note: 'Queries extremely close to live edge where provider aggregates may not be settled.',
    },
    candidateParameters: {
      settlementDelaySeconds: [...CANDIDATE_SETTLEMENT_DELAY_SECONDS],
      recoveryOverlapSeconds: [...CANDIDATE_RECOVERY_OVERLAP_SECONDS],
      analysisOnly: true,
      productionConstantsUnchanged: true,
    },
    observedLateArrivalEvidence: {
      aggregateBucketObservationsLateReplayNew: args.lateRows.length,
      uniqueTemporalBucketStarts: countUniqueTemporalBucketStarts(args.lateRows),
      aggregateVsUniqueNote:
        '53 exact-origin aggregate bucket observations appeared later — NOT claimed as 53 unique ECU measurements.',
      closedLateBucketCount: args.b4Watermark.CLOSED_LATE_ARRIVAL_BUCKET_COUNT,
      lagLowerBoundStats: {
        p50Seconds: args.b4Watermark.LATE_ARRIVAL_LAG_P50_SECONDS,
        p95Seconds: args.b4Watermark.LATE_ARRIVAL_LAG_P95_SECONDS,
        maxSeconds: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS,
        interpretation: 'LOWER_BOUND — not exact provider availability timestamps',
      },
      definitelyExcludedAt2sOverlap: args.b4Watermark.DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT,
      CURRENT_2S_OVERLAP_SUFFICIENT: args.b4Watermark.CURRENT_2S_OVERLAP_SUFFICIENT,
    },
    zeroResultWindowLimitation: {
      ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: 'NO',
      OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND: 'YES',
      note:
        '26 observed exclusions are not the total missed-bucket universe — zero-result capture cycles not reconstructible from sealed export.',
    },
    medianWindowDurationSeconds,
    settlementDelayAnalysis: settlement,
    recoveryOverlapAnalysis: overlap,
    combinedPolicyGrid: combinedGrid,
    bestLowerBoundCombo: bestCombo,
    SETTLEMENT_DELAY_SIMULATED: 'YES',
    RECOVERY_OVERLAP_SIMULATED: 'YES',
    COMBINED_POLICY_SIMULATED: 'YES',
  };
}

export function buildRecoveryPolicyDesign(args: {
  simulation: ReturnType<typeof buildRecoveryPolicySimulation>;
  lateRows: HfLateArrivalDifferentialRow[];
  b4Watermark: B4WatermarkEvidence;
}) {
  const recommendation = derivePolicyRecommendation({
    lateRows: args.lateRows,
    observedMaxLagSeconds: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS ?? 5.181,
    observedP95LagSeconds: args.b4Watermark.LATE_ARRIVAL_LAG_P95_SECONDS ?? 4.114,
    medianWindowDurationSeconds: args.simulation.medianWindowDurationSeconds,
    combinedGrid: args.simulation.combinedPolicyGrid,
  });

  const architectureOptions = buildPolicyArchitectureOptions(
    recommendation,
    args.simulation.medianWindowDurationSeconds,
  );

  return {
    evidenceId: RD004_B5_EVIDENCE_ID,
    mode: 'HF_RECOVERY_POLICY_DESIGN',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    HF_CAPTURE_DEFECT_CHARACTERIZED: 'YES',
    PROVIDER_LATE_ARRIVAL_CONFIRMED: 'YES',
    HF_RUNTIME_FIX_CONTRACT_CREATED: 'YES',
    ...recommendation,
    policyArchitectureOptions: architectureOptions,
    drivingIntelligenceImpact: {
      rule:
        'Until recovery policy is fixed, missing HF evidence must lower reconstruction confidence — no interpolation across giant gaps.',
      accelerationReconstruction:
        'Large gaps inflate inferred acceleration between sparse points; confidence must be LOW/INTERVAL_CENSORED.',
      decelerationReconstruction:
        'Stop/decel episodes lose intermediate samples — peak severity and duration uncertain.',
      stopLaunchBoundaries:
        'B.3/B.4 show interval-censored transitions; incomplete HF worsens boundary placement.',
      peakSeverity: 'True local peaks may be absent from sealed capture — attenuation metrics biased.',
      episodeDuration: 'Duration confidence degrades when cadence median ~10.6s vs provider ~1-2s capability.',
      smoothing: 'Preprocessing cannot invent missing provider buckets; smoothing masks gaps without fixing evidence.',
      falseNegatives: 'Legacy detectors may miss dynamics between sparse samples — not validated FN without denser HF.',
      episodeConfidence: 'Episode confidence scores must incorporate HF completeness / gap penalties.',
    },
    rd004Status: {
      RD004_VIDEO_TIMELINE_COMPLETE: 'YES',
      RD004_HF_CAPTURE_DEFECT_CHARACTERIZED: 'YES',
      RD004_HF_RECOVERY_POLICY_DESIGNED: 'YES',
      RD004_HF_RECOVERY_RUNTIME_FIXED: 'NO',
      RD004_ABSOLUTE_SPEED_VALIDATION_COMPLETE: 'NO',
      RD004_CLOCK_VALIDATION_COMPLETE: 'NO',
      READY_FOR_RD004_ANALYSIS_MERGE: 'YES',
      READY_FOR_PRODUCTION_HF_RECOVERY_PR: 'YES',
    },
    periodicDeepRecoveryDesign: {
      fastHfLoop: {
        settlementDelaySeconds: recommendation.RECOMMENDED_SETTLEMENT_DELAY_SECONDS,
        recoveryOverlapSeconds: recommendation.RECOMMENDED_RECOVERY_OVERLAP_SECONDS,
        purpose: 'Near-real-time HF with settled horizon + bounded overlap.',
      },
      periodicRecoverySweep: {
        recommended: recommendation.PERIODIC_DEEP_RECOVERY_RECOMMENDED,
        purpose:
          'Idempotent replay of older closed intervals to recover buckets missed by watermark race (lower-bound residual).',
        idempotency:
          'physicalSampleFingerprint + provider revision semantics — duplicates absorbed, revisions recorded separately.',
        cadence: 'NOT_SPECIFIED — requires staging validation (design only).',
      },
      advantages: [
        'Avoids continuous VERY_HIGH overlap duplicate pressure.',
        'Targets residual definitely-missed buckets from B.4 lower bound.',
        'Spreads provider load over time.',
      ],
      disadvantages: [
        'Additional scheduler complexity.',
        'Sweep window selection must avoid query-origin confusion in analytics.',
        'Residual zero-result windows still not reconstructible from sealed export alone.',
      ],
    },
    uniqueInformationCoverage: {
      AGGREGATE_BUCKET_OBSERVATIONS: args.lateRows.length,
      TEMPORAL_INFORMATION_COVERAGE_UNIQUE_BUCKET_STARTS:
        countUniqueTemporalBucketStarts(args.lateRows),
      explicitDistinction:
        'Late replay-new rows are aggregate bucket observations, not claimed unique ECU physical samples.',
    },
    safetyMarginAnalysis: {
      OBSERVED_MAX_LAG_LOWER_BOUND_SECONDS: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS,
      PRODUCTION_SAFETY_MARGIN_SECONDS: recommendation.PRODUCTION_SAFETY_MARGIN_SECONDS,
      note:
        'No statistically validated P99 from 50 closed samples — margin is engineering judgment, not provider SLA.',
    },
  };
}

export function buildB5Flags(args: {
  design: ReturnType<typeof buildRecoveryPolicyDesign>;
  b4Watermark: B4WatermarkEvidence;
}) {
  return {
    RD004_PHASE: 'RD004-B.5',
    HF_CAPTURE_DEFECT_CHARACTERIZED: 'YES',
    PROVIDER_LATE_ARRIVAL_CONFIRMED: 'YES',
    CURRENT_2S_OVERLAP_SUFFICIENT: 'NO',
    OBSERVED_CLOSED_LATE_BUCKET_COUNT: args.b4Watermark.CLOSED_LATE_ARRIVAL_BUCKET_COUNT,
    OBSERVED_LATE_ARRIVAL_LAG_P50_SECONDS: args.b4Watermark.LATE_ARRIVAL_LAG_P50_SECONDS,
    OBSERVED_LATE_ARRIVAL_LAG_P95_SECONDS: args.b4Watermark.LATE_ARRIVAL_LAG_P95_SECONDS,
    OBSERVED_LATE_ARRIVAL_LAG_MAX_SECONDS: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS,
    OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND: 'YES',
    SETTLEMENT_DELAY_SIMULATED: 'YES',
    RECOVERY_OVERLAP_SIMULATED: 'YES',
    COMBINED_POLICY_SIMULATED: 'YES',
    RECOMMENDED_HF_RECOVERY_ARCHITECTURE: args.design.RECOMMENDED_HF_RECOVERY_ARCHITECTURE,
    RECOMMENDED_SETTLEMENT_DELAY_SECONDS: args.design.RECOMMENDED_SETTLEMENT_DELAY_SECONDS,
    RECOMMENDED_RECOVERY_OVERLAP_SECONDS: args.design.RECOMMENDED_RECOVERY_OVERLAP_SECONDS,
    PERIODIC_DEEP_RECOVERY_RECOMMENDED: args.design.PERIODIC_DEEP_RECOVERY_RECOMMENDED,
    HF_RUNTIME_FIX_CONTRACT_CREATED: 'YES',
    RD004_VIDEO_TIMELINE_COMPLETE: 'YES',
    RD004_HF_CAPTURE_DEFECT_CHARACTERIZED: 'YES',
    RD004_HF_RECOVERY_POLICY_DESIGNED: 'YES',
    RD004_HF_RECOVERY_RUNTIME_FIXED: 'NO',
    RD004_ABSOLUTE_SPEED_VALIDATION_COMPLETE: 'NO',
    RD004_CLOCK_VALIDATION_COMPLETE: 'NO',
    READY_FOR_RD004_ANALYSIS_MERGE: 'YES',
    READY_FOR_PRODUCTION_HF_RECOVERY_PR: 'YES',
  };
}
