/**
 * RD004-B.6.1 / DI-EV-0035B.6 — HF recovery policy lower-bound semantics correction.
 * Read-only analysis; does NOT modify production runtime or constants.
 *
 * B.5 superseded: availabilityLagLowerBoundSeconds is a LOWER BOUND only —
 * it does NOT prove provider availability by any candidate settlement delay.
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

export const RD004_B6_EVIDENCE_ID = 'DI-EV-0035B.6';
/** @deprecated Use RD004_B6_EVIDENCE_ID */
export const RD004_B5_EVIDENCE_ID = RD004_B6_EVIDENCE_ID;

export const LOWER_BOUND_LEQ_SETTLEMENT_DOES_NOT_PROVE_AVAILABILITY = 'YES';
export const LOWER_BOUND_ALONE_CAN_PROVE_AVAILABILITY_BY_CANDIDATE_DELAY = 'NO';
export const MISLEADING_SETTLEMENT_PROTECTION_API_REMOVED = 'YES';
export const TEMPORAL_QUERY_COVERAGE_SEPARATED_FROM_PROVIDER_AVAILABILITY = 'YES';
export const PROVIDER_AVAILABILITY_AT_NEXT_QUERY_PROVEN = 'NO';
export const B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID = 'NO';
export const B5_EXACT_SETTLEMENT_PARAMETER_VALIDATED = 'NO';

/** Analysis candidates only — not production constants. */
export const CANDIDATE_SETTLEMENT_DELAY_SECONDS = [0, 2, 4, 5, 6, 8, 10] as const;
export const CANDIDATE_RECOVERY_OVERLAP_SECONDS = [2, 4, 6, 8, 10, 15, 20] as const;

export const PROVISIONAL_SETTLEMENT_DELAY_SECONDS = 8;
export const PROVISIONAL_RECOVERY_OVERLAP_SECONDS = 6;

export const CURRENT_PRODUCTION_OVERLAP_MS = HF_QUERY_OVERLAP_MS;
export const CURRENT_PRODUCTION_OVERLAP_SECONDS = HF_QUERY_OVERLAP_MS / 1000;

export type LateBucketTimingSemantics = {
  bucketEnd: string;
  originalRequestCompletedAt: string | null;
  actualProviderFirstAvailabilityAt: 'UNKNOWN';
  availabilityDelayLowerBoundSeconds: number | null;
  availabilityDelayUpperBound: 'UNKNOWN';
};

export type SettlementCoverageResult = {
  settlementDelaySeconds: number;
  closedLateBucketCount: number;
  openLateBucketsNotApplicable: number;
  /** Bucket would be excluded from hot-edge query horizon at this settlement delay. */
  bucketCountDeferredFromHotEdge: number;
  /** Lag lower bound <= delay — CONSISTENT only; does NOT prove availability. */
  bucketCountWithLowerBoundBelowDelay: number;
  bucketCountDefinitelyAvailableByDelay: 0;
  providerAvailabilityByDelay: 'NOT_DETERMINABLE';
  interpretation: 'SETTLEMENT_HORIZON_DEFERRAL_ONLY' | 'NOT_DETERMINABLE';
  note: string;
};

export type OverlapRecoveryResult = {
  recoveryOverlapSeconds: number;
  temporallyExcludedCount: number;
  temporallyReachableCandidateCount: number;
  temporallyPartiallyCoveredCount: number;
  temporalCoverageCandidateCount: number;
  temporalCoverageExcludedCount: number;
  overlapCompletenessGuaranteed: 'NO';
  overlapClassification: 'PROVISIONAL_COVERAGE_CANDIDATE';
  interpretation: 'TEMPORAL_QUERY_COVERAGE_ONLY' | 'NOT_DETERMINABLE';
  providerAvailabilityAtNextQueryProven: 'NO';
  actualRecoveryCount: null;
  note: string;
};

export type CombinedPolicySimulationRow = {
  candidateSettlementDelaySeconds: number;
  candidateRecoveryOverlapSeconds: number;
  bucketCountDeferredFromHotEdge: number;
  bucketCountWithLowerBoundBelowDelay: number;
  temporalCoverageCandidateCount: number;
  temporalCoverageExcludedCount: number;
  queryWindowExpansionSeconds: number;
  estimatedRepeatedQueryCoverageFraction: number;
  expectedDuplicateRetrievalPressure: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  interpretation: 'TEMPORAL_QUERY_COVERAGE_ONLY';
  providerAvailabilityProven: 'NO';
  providerAvailabilityAtNextQueryProven: 'NO';
  actualRecoveryCount: null;
  confidence: 'LOWER_BOUND' | 'NOT_DETERMINABLE';
};

export type PolicyArchitectureOption = {
  policyId: 'POLICY_A' | 'POLICY_B' | 'POLICY_C' | 'POLICY_D';
  label: string;
  provisionalSettlementDelaySeconds: number | null;
  provisionalRecoveryOverlapSeconds: number;
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
  RECOMMENDED_HF_RECOVERY_ARCHITECTURE: 'SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP';
  RECOMMENDED_POLICY_PARAMETERS: 'REQUIRES_LIVE_AVAILABILITY_VALIDATION';
  PROVISIONAL_SETTLEMENT_DELAY_SECONDS: number;
  PROVISIONAL_RECOVERY_OVERLAP_SECONDS: number;
  PARAMETERS_VALIDATED: 'NO';
  PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED: 'NO';
  PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS: 'YES';
  MINIMUM_OBSERVED_TEMPORAL_RECOVERY_NEED_GT_2S: 'YES';
  OBSERVED_MAX_LAG_LOWER_BOUND_SECONDS: number;
  justification: string;
  b5SupersededNote: string;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function areSettlementAndOverlapIndependent(): boolean {
  return true;
}

/** Per-bucket timing semantics for RD004 historical evidence. */
export function analyzeLateBucketTiming(row: HfLateArrivalDifferentialRow): LateBucketTimingSemantics {
  return {
    bucketEnd: row.bucketEnd,
    originalRequestCompletedAt: row.originalRequestCompletedAt,
    actualProviderFirstAvailabilityAt: 'UNKNOWN',
    availabilityDelayLowerBoundSeconds: row.availabilityLagLowerBoundSeconds,
    availabilityDelayUpperBound: 'UNKNOWN',
  };
}

export function isLowerBoundConsistentWithCandidateDelay(
  row: HfLateArrivalDifferentialRow,
  settlementDelaySeconds: number,
): boolean {
  if (row.bucketClosureAtOriginalResponse !== 'CLOSED') return false;
  const lag = row.availabilityLagLowerBoundSeconds;
  if (lag == null) return false;
  return lag <= settlementDelaySeconds;
}

/**
 * Would this bucket be deferred from the original hot-edge query at this settlement delay?
 * Does NOT prove provider would supply the bucket after the delay.
 */
export function isDeferredFromHotEdgeBySettlementHorizon(
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
  const deferred = closed.filter((r) =>
    isDeferredFromHotEdgeBySettlementHorizon(r, settlementDelaySeconds),
  ).length;
  const consistentWithDelay = closed.filter((r) =>
    isLowerBoundConsistentWithCandidateDelay(r, settlementDelaySeconds),
  ).length;

  return {
    settlementDelaySeconds,
    closedLateBucketCount: closed.length,
    openLateBucketsNotApplicable: open.length,
    bucketCountDeferredFromHotEdge: deferred,
    bucketCountWithLowerBoundBelowDelay: consistentWithDelay,
    bucketCountDefinitelyAvailableByDelay: 0,
    providerAvailabilityByDelay: 'NOT_DETERMINABLE',
    interpretation: 'SETTLEMENT_HORIZON_DEFERRAL_ONLY',
    note:
      'SETTLEMENT_HORIZON_DEFERRAL ≠ PROVIDER_AVAILABILITY_RECOVERY. Lower bound <= delay does NOT prove bucket available after delay.',
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
  const reachableCandidates = classifications.filter(
    (c) => c === 'POTENTIALLY_REQUERYABLE',
  ).length;
  const partiallyCovered = classifications.filter(
    (c) => c === 'PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW',
  ).length;
  const coverageCandidates = lateRows.length - definitelyExcluded;

  return {
    recoveryOverlapSeconds,
    temporallyExcludedCount: definitelyExcluded,
    temporallyReachableCandidateCount: reachableCandidates,
    temporallyPartiallyCoveredCount: partiallyCovered,
    temporalCoverageCandidateCount: coverageCandidates,
    temporalCoverageExcludedCount: definitelyExcluded,
    overlapCompletenessGuaranteed: 'NO',
    overlapClassification: 'PROVISIONAL_COVERAGE_CANDIDATE',
    interpretation: 'TEMPORAL_QUERY_COVERAGE_ONLY',
    providerAvailabilityAtNextQueryProven: 'NO',
    actualRecoveryCount: null,
    note:
      'TEMPORAL_QUERY_COVERAGE_ONLY — next query window may include bucket time range; actualProviderFirstAvailabilityAt UNKNOWN.',
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

  const excluded = lateRows.filter((row) => {
    const cls = simulateOverlapRecoveryClassification(row, recoveryOverlapSeconds);
    return cls === 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK';
  }).length;

  const coverageCandidates = lateRows.length - excluded;
  const repeatedFraction =
    medianWindowDurationSeconds > 0
      ? Math.min(1, recoveryOverlapSeconds / medianWindowDurationSeconds)
      : 0;

  return {
    candidateSettlementDelaySeconds: settlementDelaySeconds,
    candidateRecoveryOverlapSeconds: recoveryOverlapSeconds,
    bucketCountDeferredFromHotEdge: settlement.bucketCountDeferredFromHotEdge,
    bucketCountWithLowerBoundBelowDelay: settlement.bucketCountWithLowerBoundBelowDelay,
    temporalCoverageCandidateCount: coverageCandidates,
    temporalCoverageExcludedCount: excluded,
    queryWindowExpansionSeconds: settlementDelaySeconds,
    estimatedRepeatedQueryCoverageFraction: repeatedFraction,
    expectedDuplicateRetrievalPressure: estimateDuplicatePressure(
      recoveryOverlapSeconds,
      medianWindowDurationSeconds,
    ),
    interpretation: 'TEMPORAL_QUERY_COVERAGE_ONLY',
    providerAvailabilityProven: 'NO',
    providerAvailabilityAtNextQueryProven: 'NO',
    actualRecoveryCount: null,
    confidence: lateRows.length > 0 ? 'LOWER_BOUND' : 'NOT_DETERMINABLE',
  };
}

export function buildSettlementCoverageTable(lateRows: HfLateArrivalDifferentialRow[]) {
  const table = CANDIDATE_SETTLEMENT_DELAY_SECONDS.map((s) => simulateSettlementCoverage(lateRows, s));
  const keyed: Record<string, number> = {};
  for (const row of table) {
    keyed[`SETTLEMENT_${row.settlementDelaySeconds}S_DEFERRED_FROM_HOT_EDGE`] =
      row.bucketCountDeferredFromHotEdge;
    keyed[`SETTLEMENT_${row.settlementDelaySeconds}S_LOWER_BOUND_BELOW_DELAY`] =
      row.bucketCountWithLowerBoundBelowDelay;
    keyed[`SETTLEMENT_${row.settlementDelaySeconds}S_DEFINITELY_AVAILABLE`] = 0;
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
}): HfRecoveryPolicyRecommendation {
  return {
    RECOMMENDED_HF_RECOVERY_ARCHITECTURE: 'SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP',
    RECOMMENDED_POLICY_PARAMETERS: 'REQUIRES_LIVE_AVAILABILITY_VALIDATION',
    PROVISIONAL_SETTLEMENT_DELAY_SECONDS: PROVISIONAL_SETTLEMENT_DELAY_SECONDS,
    PROVISIONAL_RECOVERY_OVERLAP_SECONDS: PROVISIONAL_RECOVERY_OVERLAP_SECONDS,
    PARAMETERS_VALIDATED: 'NO',
    PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED: 'NO',
    PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS: 'YES',
    MINIMUM_OBSERVED_TEMPORAL_RECOVERY_NEED_GT_2S: 'YES',
    OBSERVED_MAX_LAG_LOWER_BOUND_SECONDS: args.observedMaxLagSeconds,
    b5SupersededNote:
      'B.5 claim "8s protects 50/50" invalidated — lower bound ≤ delay does not prove availability (B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID=NO).',
    justification:
      `B.4: ${args.lateRows.length} late aggregate bucket observations; 26 definitely excluded at 2s overlap (PROVEN insufficient). ` +
      `Availability delay lower-bound max ${args.observedMaxLagSeconds}s is NOT an upper bound — actual delay may be greater. ` +
      `Architecture SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP justified; provisional start values ${PROVISIONAL_SETTLEMENT_DELAY_SECONDS}s/${PROVISIONAL_RECOVERY_OVERLAP_SECONDS}s require live calibration before validation.`,
  };
}

export function buildPolicyArchitectureOptions(
  recommendation: HfRecoveryPolicyRecommendation,
  medianWindowDurationSeconds: number,
): PolicyArchitectureOption[] {
  const recOverlap = recommendation.PROVISIONAL_RECOVERY_OVERLAP_SECONDS;
  const recSettlement = recommendation.PROVISIONAL_SETTLEMENT_DELAY_SECONDS;
  return [
    {
      policyId: 'POLICY_A',
      label: '0s settlement delay + larger overlap only',
      provisionalSettlementDelaySeconds: 0,
      provisionalRecoveryOverlapSeconds: 15,
      periodicDeepRecovery: false,
      dataCompleteness: 'Still queries live edge; overlap-only does not address unsettled horizon.',
      latency: 'Minimal additional latency.',
      queryCost: 'VERY_HIGH duplicate pressure.',
      duplicateVolume: 'VERY_HIGH',
      providerLoad: 'Elevated.',
      complexity: 'Low.',
      failureRecovery: 'Weak — no eventual sweep for >overlap late arrivals.',
      drivingIntelligenceSuitability: 'Poor alone.',
    },
    {
      policyId: 'POLICY_B',
      label: 'Settled horizon + moderate overlap (provisional parameters)',
      provisionalSettlementDelaySeconds: recSettlement,
      provisionalRecoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: false,
      dataCompleteness: 'Defers hot-edge queries; overlap addresses watermark gap — parameters unvalidated.',
      latency: `~${recSettlement}s HF historical latency (provisional).`,
      queryCost: `~${recOverlap}s overlap on ~${medianWindowDurationSeconds.toFixed(1)}s window.`,
      duplicateVolume: estimateDuplicatePressure(recOverlap, medianWindowDurationSeconds),
      providerLoad: 'Moderate.',
      complexity: 'Moderate.',
      failureRecovery: 'Incomplete without sweep when actual delay > provisional settlement.',
      drivingIntelligenceSuitability: 'Baseline candidate pending calibration.',
    },
    {
      policyId: 'POLICY_C',
      label: 'Settled horizon + overlap + periodic deep recovery sweep (recommended)',
      provisionalSettlementDelaySeconds: recSettlement,
      provisionalRecoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: true,
      dataCompleteness:
        'Eventual completeness robust even when late bucket > provisional settlement or fast-loop overlap.',
      latency: `Fast loop ~${recSettlement}s behind; async sweep for closed intervals.`,
      queryCost: 'Moderate fast loop + bounded sweep load.',
      duplicateVolume: 'Moderate — fingerprint-idempotent.',
      providerLoad: 'Spread over time.',
      complexity: 'Higher.',
      failureRecovery: 'Required for robust eventual completeness when first-availability unknown.',
      drivingIntelligenceSuitability: 'Recommended architecture class.',
    },
    {
      policyId: 'POLICY_D',
      label: 'DATA watermark + QUERY COVERAGE watermark + RECOVERY cursor',
      provisionalSettlementDelaySeconds: recSettlement,
      provisionalRecoveryOverlapSeconds: recOverlap,
      periodicDeepRecovery: true,
      dataCompleteness: 'Triple-cursor model extends 3A.3.2 with explicit recovery cursor.',
      latency: 'Same as Policy C.',
      queryCost: 'Similar to C with better observability.',
      duplicateVolume: 'Moderate.',
      providerLoad: 'Moderate.',
      complexity: 'Highest.',
      failureRecovery: 'Best auditability for late revisions and sweeps.',
      drivingIntelligenceSuitability: 'Preferred long-term if implementation cost acceptable.',
    },
  ];
}

export function buildLiveAvailabilityCalibrationContract() {
  return {
    evidenceId: RD004_B6_EVIDENCE_ID,
    mode: 'HF_LIVE_AVAILABILITY_CALIBRATION_EXPERIMENT',
    status: 'DESIGN_ONLY_NOT_EXECUTED',
    purpose:
      'Determine actual provider first-availability delay distribution — required before validating settlement/overlap seconds.',
    methodology: {
      approach:
        'For each newly closed 1s historical bucket, re-query SAME query origin at controlled delays after bucketEnd.',
      suggestedDelayOffsetsSeconds: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30],
      rateLimit:
        'Bounded, rate-conscious — no high-frequency abusive provider queries; staging/reference capture only.',
      perAttemptRecord: [
        'bucketEnd',
        'queryOrigin',
        'queryAttemptAt',
        'bucketPresent',
        'value',
        'firstObservedPresentAt',
      ],
      derivedMetrics: [
        'actualAvailabilityDelaySeconds',
        'availability P50',
        'availability P90',
        'availability P95',
        'max observed',
      ],
    },
    constraints: {
      doNotUseReplayTimestampAsUpperBound: 'YES',
      sameQueryOriginRequired: 'YES',
      productionNotRequiredForExperiment: 'Staging or short reference capture sufficient',
    },
    outcomeEnables: [
      'PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED=YES',
      'Validated HF_SETTLEMENT_DELAY_MS',
      'Validated HF_RECOVERY_OVERLAP_MS',
    ],
  };
}

export function buildHfRuntimeFixContract(recommendation: HfRecoveryPolicyRecommendation) {
  return {
    evidenceId: RD004_B6_EVIDENCE_ID,
    mode: 'HF_RUNTIME_FIX_IMPLEMENTATION_CONTRACT',
    status: 'DESIGN_ONLY_NOT_IMPLEMENTED',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED: 'NO',
    targetModule: 'reference-capture-acquisition.service.ts',
    relatedModules: [
      'reference-capture-hf-watermark-policy.ts',
      'reference-capture-query-builder.ts',
      'reference-capture-physical-sample-identity.util.ts',
    ],
    configurableParameters: {
      HF_SETTLEMENT_DELAY_MS: {
        provisionalDefault: recommendation.PROVISIONAL_SETTLEMENT_DELAY_SECONDS * 1000,
        validated: false,
        tunableWithoutCodeChange: 'REQUIRED',
      },
      HF_RECOVERY_OVERLAP_MS: {
        provisionalDefault: recommendation.PROVISIONAL_RECOVERY_OVERLAP_SECONDS * 1000,
        validated: false,
        tunableWithoutCodeChange: 'REQUIRED',
      },
    },
    expectedChanges: {
      resolveHfActualQueryTo:
        'safeQueryTo = requestStartedAt - settlementDelayMs (configurable, provisional default only).',
      computeHfQueryFrom:
        'recoveryOverlapMs configurable at call site — do not hardcode validated 8/6.',
      hfQueryCoverageByField: 'Advance to safeQueryTo; QUERY COVERAGE watermark separate from DATA watermark.',
      watermarkAdvancement:
        'DATA watermark (hfWatermarkByField) on durable persist; QUERY COVERAGE tracks safeQueryTo; RECOVERY cursor for sweep.',
      periodicRecoverySweep:
        'Required for robust eventual completeness — idempotent replay of closed intervals behind recovery cursor.',
      idempotency: 'physicalSampleFingerprint + revision semantics unchanged.',
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
      'recovered_late_bucket_count',
      'recovery_sweep_count',
      'hf_first_availability_delay_ms',
    ],
    provisionalParameters: {
      PROVISIONAL_SETTLEMENT_DELAY_SECONDS: recommendation.PROVISIONAL_SETTLEMENT_DELAY_SECONDS,
      PROVISIONAL_RECOVERY_OVERLAP_SECONDS: recommendation.PROVISIONAL_RECOVERY_OVERLAP_SECONDS,
      PARAMETERS_VALIDATED: recommendation.PARAMETERS_VALIDATED,
    },
    validationPlan: {
      unitTests: 'Settlement deferral vs availability separation; overlap watermark classification.',
      deterministicReplayTests: 'RD004 counterfactual grid regression.',
      liveAvailabilityCalibration: 'Execute buildLiveAvailabilityCalibrationContract experiment in staging.',
      controlledLiveCapture: 'Short reference capture with provisional config + observability.',
      densityComparison: 'Provider replay density vs sealed capture after fix.',
      videoTelemetryGate:
        'RD004 absolute speed/clock/acceleration ONLY after dense fresh capture — not incomplete sealed series.',
    },
    implementationPrerequisite:
      'Separate production PR: configurable architecture + provisional defaults + calibration follow-up.',
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
  const combinedGrid = buildCombinedPolicyGrid(args.lateRows, medianWindowDurationSeconds);

  return {
    evidenceId: RD004_B6_EVIDENCE_ID,
    mode: 'HF_RECOVERY_POLICY_COUNTERFACTUAL_SIMULATION',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    b5Superseded: {
      B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID: 'NO',
      B5_EXACT_SETTLEMENT_PARAMETER_VALIDATED: 'NO',
      correction:
        'Lower-bound lag ≤ settlement delay does NOT prove provider availability by that delay.',
    },
    semanticHygiene: {
      MISLEADING_SETTLEMENT_PROTECTION_API_REMOVED: 'YES',
      LOWER_BOUND_ALONE_CAN_PROVE_AVAILABILITY_BY_CANDIDATE_DELAY: 'NO',
      TEMPORAL_QUERY_COVERAGE_SEPARATED_FROM_PROVIDER_AVAILABILITY: 'YES',
      PROVIDER_AVAILABILITY_AT_NEXT_QUERY_PROVEN: 'NO',
    },
    availabilitySemantics: {
      AVAILABILITY_DELAY_IS_LOWER_BOUND_ONLY: 'YES',
      AVAILABILITY_DELAY_UPPER_BOUND_KNOWN: 'NO',
      ACTUAL_FIRST_PROVIDER_AVAILABILITY_KNOWN: 'NO',
      LOWER_BOUND_LEQ_SETTLEMENT_DOES_NOT_PROVE_AVAILABILITY: 'YES',
      threeTimesDistinction: {
        bucketEnd: 'KNOWN',
        originalRequestCompletedAt: 'KNOWN',
        actualProviderFirstAvailabilityAt: 'UNKNOWN',
      },
    },
    b4EvidencePreserved: {
      DIMO_BUCKET_SEMANTICS,
      CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
      B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
      HF_CAPTURE_ROOT_CAUSE: args.b4Watermark.HF_CAPTURE_ROOT_CAUSE,
      CURRENT_2S_OVERLAP_SUFFICIENT: 'NO',
      MINIMUM_OBSERVED_TEMPORAL_RECOVERY_NEED_GT_2S: 'YES',
    },
    currentCaptureBehavior: {
      queryToApproximation: 'QUERY_TO ≈ requestStartedAt (live edge)',
      coverageAdvance: 'hfQueryCoverageByField → actualQueryTo after successful query',
      nextQueryFrom: 'previousQueryCoverage - HF_QUERY_OVERLAP_MS (2000ms)',
      HF_QUERY_OVERLAP_MS: CURRENT_PRODUCTION_OVERLAP_MS,
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
      closedLateBucketCount: args.b4Watermark.CLOSED_LATE_ARRIVAL_BUCKET_COUNT,
      lagLowerBoundStats: {
        p50Seconds: args.b4Watermark.LATE_ARRIVAL_LAG_P50_SECONDS,
        p95Seconds: args.b4Watermark.LATE_ARRIVAL_LAG_P95_SECONDS,
        maxSeconds: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS,
        interpretation:
          'LOWER_BOUND only — actual provider availability delay may be arbitrarily larger',
      },
      definitelyExcludedAt2sOverlap: args.b4Watermark.DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT,
    },
    zeroResultWindowLimitation: {
      ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: 'NO',
      OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND: 'YES',
    },
    medianWindowDurationSeconds,
    settlementDelayAnalysis: settlement,
    recoveryOverlapAnalysis: overlap,
    combinedPolicyGrid: combinedGrid,
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
  });

  const architectureOptions = buildPolicyArchitectureOptions(
    recommendation,
    args.simulation.medianWindowDurationSeconds,
  );

  return {
    evidenceId: RD004_B6_EVIDENCE_ID,
    mode: 'HF_RECOVERY_POLICY_DESIGN',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    HF_CAPTURE_DEFECT_CHARACTERIZED: 'YES',
    PROVIDER_LATE_ARRIVAL_CONFIRMED: 'YES',
    HF_RUNTIME_FIX_CONTRACT_CREATED: 'YES',
    LIVE_AVAILABILITY_CALIBRATION_CONTRACT_CREATED: 'YES',
    AVAILABILITY_DELAY_IS_LOWER_BOUND_ONLY: 'YES',
    AVAILABILITY_DELAY_UPPER_BOUND_KNOWN: 'NO',
    ACTUAL_FIRST_PROVIDER_AVAILABILITY_KNOWN: 'NO',
    B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID: 'NO',
    B5_EXACT_SETTLEMENT_PARAMETER_VALIDATED: 'NO',
    ...recommendation,
    policyArchitectureOptions: architectureOptions,
    liveAvailabilityCalibration: buildLiveAvailabilityCalibrationContract(),
    drivingIntelligenceImpact: {
      rule:
        'Missing HF lowers reconstruction confidence — no interpolation across giant gaps. RD004 sealed series must not calibrate production thresholds.',
      physicalValidationBlocked:
        'RD004_ABSOLUTE_SPEED_VALIDATION_COMPLETE=NO until fresh dense capture after recovery fix.',
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
      PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED: 'NO',
    },
    periodicDeepRecoveryDesign: {
      PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS: 'YES',
      rationale:
        'Unknown first-availability distribution — sweep recovers buckets when actual delay > provisional settlement or fast-loop overlap.',
      cadence: 'NOT_SPECIFIED — design only',
    },
  };
}

export function buildRecoveryPolicyFlags(args: {
  design: ReturnType<typeof buildRecoveryPolicyDesign>;
  b4Watermark: B4WatermarkEvidence;
}) {
  return {
    RD004_PHASE: 'RD004-B.6.1',
    MISLEADING_SETTLEMENT_PROTECTION_API_REMOVED: 'YES',
    LOWER_BOUND_ALONE_CAN_PROVE_AVAILABILITY_BY_CANDIDATE_DELAY: 'NO',
    TEMPORAL_QUERY_COVERAGE_SEPARATED_FROM_PROVIDER_AVAILABILITY: 'YES',
    PROVIDER_AVAILABILITY_AT_NEXT_QUERY_PROVEN: 'NO',
    PROVIDER_LATE_ARRIVAL_CONFIRMED: 'YES',
    AVAILABILITY_DELAY_IS_LOWER_BOUND_ONLY: 'YES',
    AVAILABILITY_DELAY_UPPER_BOUND_KNOWN: 'NO',
    ACTUAL_FIRST_PROVIDER_AVAILABILITY_KNOWN: 'NO',
    B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID: 'NO',
    B5_EXACT_SETTLEMENT_PARAMETER_VALIDATED: 'NO',
    CURRENT_2S_OVERLAP_SUFFICIENT: 'NO',
    MINIMUM_OBSERVED_TEMPORAL_RECOVERY_NEED_GT_2S: 'YES',
    RECOMMENDED_HF_RECOVERY_ARCHITECTURE: args.design.RECOMMENDED_HF_RECOVERY_ARCHITECTURE,
    RECOMMENDED_POLICY_PARAMETERS: args.design.RECOMMENDED_POLICY_PARAMETERS,
    PROVISIONAL_SETTLEMENT_DELAY_SECONDS: args.design.PROVISIONAL_SETTLEMENT_DELAY_SECONDS,
    PROVISIONAL_RECOVERY_OVERLAP_SECONDS: args.design.PROVISIONAL_RECOVERY_OVERLAP_SECONDS,
    PARAMETERS_VALIDATED: args.design.PARAMETERS_VALIDATED,
    PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED: 'NO',
    PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS: 'YES',
    LIVE_AVAILABILITY_CALIBRATION_CONTRACT_CREATED: 'YES',
    HF_RUNTIME_FIX_CONTRACT_CREATED: 'YES',
    OBSERVED_CLOSED_LATE_BUCKET_COUNT: args.b4Watermark.CLOSED_LATE_ARRIVAL_BUCKET_COUNT,
    OBSERVED_LATE_ARRIVAL_LAG_MAX_SECONDS: args.b4Watermark.LATE_ARRIVAL_LAG_MAX_SECONDS,
    OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND: 'YES',
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

/** @deprecated Use buildRecoveryPolicyFlags */
export const buildB5Flags = buildRecoveryPolicyFlags;
