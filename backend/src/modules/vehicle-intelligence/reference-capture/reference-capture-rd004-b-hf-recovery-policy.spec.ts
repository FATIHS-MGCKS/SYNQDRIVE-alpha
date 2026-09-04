import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import {
  analyzeLateBucketTiming,
  areSettlementAndOverlapIndependent,
  B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID,
  buildCombinedPolicyGrid,
  buildHfRuntimeFixContract,
  buildLiveAvailabilityCalibrationContract,
  buildRecoveryPolicyDesign,
  buildRecoveryPolicyFlags,
  buildRecoveryPolicySimulation,
  buildSettlementCoverageTable,
  CANDIDATE_RECOVERY_OVERLAP_SECONDS,
  CANDIDATE_SETTLEMENT_DELAY_SECONDS,
  closedLateBucketProtectedBySettlementDelay,
  countUniqueTemporalBucketStarts,
  CURRENT_PRODUCTION_OVERLAP_MS,
  derivePolicyRecommendation,
  isDeferredFromHotEdgeBySettlementHorizon,
  isLowerBoundConsistentWithCandidateDelay,
  lowerBoundDoesNotProveAvailabilityBySettlement,
  simulateOverlapRecoveryClassification,
  simulateSettlementCoverage,
  type B4WatermarkEvidence,
} from './reference-capture-rd004-b-hf-recovery-policy';
import type { HfLateArrivalDifferentialRow } from './reference-capture-hf-aggregate-bucket-analysis';
import { CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID } from './reference-capture-rd004-b-hf-exact-window-replay';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SOURCE_OBS = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a/source-observations.jsonl',
);
const SOURCE_MANIFEST = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a/source-manifest.json',
);
const hasSourceData = fs.existsSync(SOURCE_OBS);

function sampleLateRow(overrides: Partial<HfLateArrivalDifferentialRow> = {}): HfLateArrivalDifferentialRow {
  return {
    observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
    providerField: 'speed',
    bucketStart: '2026-09-04T03:37:56.293Z',
    bucketEnd: '2026-09-04T03:37:57.293Z',
    avgValue: 0,
    originalHfWindowFrom: '2026-09-04T03:37:51.293Z',
    originalHfWindowTo: '2026-09-04T03:37:59.416Z',
    originalRequestStartedAt: '2026-09-04T03:37:59.416Z',
    originalRequestCompletedAt: '2026-09-04T03:37:59.608Z',
    nextKnownHfWindowFrom: '2026-09-04T03:37:57.416Z',
    watermarkClassification: 'DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK',
    bucketClosureAtOriginalResponse: 'CLOSED',
    availabilityLagLowerBoundSeconds: 2.315,
    replayExperimentGeneratedAt: '2026-09-04T14:58:53.667Z',
    ...overrides,
  };
}

const b4Watermark: B4WatermarkEvidence = {
  LATE_ARRIVAL_BUCKET_COUNT: 53,
  CLOSED_LATE_ARRIVAL_BUCKET_COUNT: 50,
  LATE_ARRIVAL_LAG_P50_SECONDS: 2.129,
  LATE_ARRIVAL_LAG_P95_SECONDS: 4.114,
  LATE_ARRIVAL_LAG_MAX_SECONDS: 5.181,
  DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT: 26,
  CURRENT_2S_OVERLAP_SUFFICIENT: 'NO',
  HF_CAPTURE_ROOT_CAUSE: 'PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP',
};

describe('DI-EV-0035B.6 RD004-B HF recovery policy lower-bound semantics correction', () => {
  it('1) lower-bound availability delay cannot prove bucket available by larger settlement delay', () => {
    const lowerBound = 5;
    const candidateDelay = 8;
    expect(lowerBoundDoesNotProveAvailabilityBySettlement(lowerBound, candidateDelay)).toBe(true);
    const row = sampleLateRow({ availabilityLagLowerBoundSeconds: lowerBound });
    expect(isLowerBoundConsistentWithCandidateDelay(row, candidateDelay)).toBe(true);
    expect(closedLateBucketProtectedBySettlementDelay(row, candidateDelay)).toBe(true);
    const coverage = simulateSettlementCoverage([row], candidateDelay);
    expect(coverage.bucketCountDefinitelyAvailableByDelay).toBe(0);
    expect(coverage.providerAvailabilityByDelay).toBe('NOT_DETERMINABLE');
    expect(coverage.interpretation).toBe('SETTLEMENT_HORIZON_DEFERRAL_ONLY');
  });

  it('2) actualProviderFirstAvailabilityAt remains unknown for historical B.4', () => {
    const timing = analyzeLateBucketTiming(sampleLateRow());
    expect(timing.actualProviderFirstAvailabilityAt).toBe('UNKNOWN');
    expect(timing.availabilityDelayUpperBound).toBe('UNKNOWN');
    expect(timing.availabilityDelayLowerBoundSeconds).toBe(2.315);
  });

  it('3) settlement deferral and provider availability are separate concepts', () => {
    const row = sampleLateRow({ availabilityLagLowerBoundSeconds: 5.181 });
    const settlement = simulateSettlementCoverage([row], 8);
    expect(settlement.bucketCountDeferredFromHotEdge).toBeGreaterThanOrEqual(0);
    expect(settlement.bucketCountDefinitelyAvailableByDelay).toBe(0);
    expect(isDeferredFromHotEdgeBySettlementHorizon(row, 8)).toBeDefined();
    expect(settlement.providerAvailabilityByDelay).toBe('NOT_DETERMINABLE');
  });

  it('4) 8 s candidate is provisional, not validated', () => {
    const recommendation = derivePolicyRecommendation({
      lateRows: [sampleLateRow()],
      observedMaxLagSeconds: 5.181,
    });
    expect(recommendation.PROVISIONAL_SETTLEMENT_DELAY_SECONDS).toBe(8);
    expect(recommendation.PARAMETERS_VALIDATED).toBe('NO');
    expect(recommendation.PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED).toBe('NO');
    expect(recommendation.RECOMMENDED_POLICY_PARAMETERS).toBe('REQUIRES_LIVE_AVAILABILITY_VALIDATION');
    expect(B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID).toBe('NO');
  });

  it('5) 6 s overlap is provisional, not completeness-guaranteeing', () => {
    const recommendation = derivePolicyRecommendation({
      lateRows: [sampleLateRow()],
      observedMaxLagSeconds: 5.181,
    });
    expect(recommendation.PROVISIONAL_RECOVERY_OVERLAP_SECONDS).toBe(6);
    const grid = buildCombinedPolicyGrid([sampleLateRow()], 7.767);
    const overlap6 = grid.find((r) => r.candidateRecoveryOverlapSeconds === 6);
    expect(overlap6?.providerAvailabilityProven).toBe('NO');
    expect(overlap6?.confidence).toBe('LOWER_BOUND');
  });

  it('6) current 2 s overlap remains proven insufficient', () => {
    expect(b4Watermark.CURRENT_2S_OVERLAP_SUFFICIENT).toBe('NO');
    expect(b4Watermark.DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT).toBe(26);
    const row = sampleLateRow();
    expect(simulateOverlapRecoveryClassification(row, 2)).toBe('DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK');
  });

  it('7) architecture recommendation does not depend on exact 8/6 values', () => {
    const recommendation = derivePolicyRecommendation({
      lateRows: [sampleLateRow()],
      observedMaxLagSeconds: 5.181,
    });
    expect(recommendation.RECOMMENDED_HF_RECOVERY_ARCHITECTURE).toBe(
      'SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP',
    );
    expect(recommendation.RECOMMENDED_POLICY_PARAMETERS).toBe('REQUIRES_LIVE_AVAILABILITY_VALIDATION');
    expect(recommendation.PARAMETERS_VALIDATED).toBe('NO');
  });

  it('8) periodic sweep provides eventual recovery path for >fast-loop-delay late arrivals', () => {
    const design = buildRecoveryPolicyDesign({
      simulation: buildRecoveryPolicySimulation({
        lateRows: [sampleLateRow()],
        queryWindows: [],
        b4Watermark,
      }),
      lateRows: [sampleLateRow()],
      b4Watermark,
    });
    expect(
      design.periodicDeepRecoveryDesign.PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS,
    ).toBe('YES');
    expect(design.PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS).toBe('YES');
  });

  it('9) no production constants changed', () => {
    expect(CURRENT_PRODUCTION_OVERLAP_MS).toBe(HF_QUERY_OVERLAP_MS);
    expect(HF_QUERY_OVERLAP_MS).toBe(2000);
    expect(areSettlementAndOverlapIndependent()).toBe(true);
    const grid = buildCombinedPolicyGrid([sampleLateRow()], 7.767);
    expect(grid.length).toBe(
      CANDIDATE_SETTLEMENT_DELAY_SECONDS.length * CANDIDATE_RECOVERY_OVERLAP_SECONDS.length,
    );
    expect(HF_QUERY_OVERLAP_MS).toBe(2000);
  });

  it('10) raw evidence remains unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
  });

  it('11) no deploy / production runtime change flags', () => {
    const design = buildRecoveryPolicyDesign({
      simulation: buildRecoveryPolicySimulation({
        lateRows: [],
        queryWindows: [],
        b4Watermark,
      }),
      lateRows: [],
      b4Watermark,
    });
    expect(design.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(design.rd004Status.RD004_HF_RECOVERY_RUNTIME_FIXED).toBe('NO');
    expect(design.rd004Status.READY_FOR_PRODUCTION_HF_RECOVERY_PR).toBe('YES');
    expect(design.rd004Status.READY_FOR_RD004_ANALYSIS_MERGE).toBe('YES');
    const flags = buildRecoveryPolicyFlags({ design, b4Watermark });
    expect(flags.RD004_PHASE).toBe('RD004-B.6');
    expect(flags.PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED).toBe('NO');
  });

  it('12) live availability calibration contract exists', () => {
    const contract = buildLiveAvailabilityCalibrationContract();
    expect(contract.status).toBe('DESIGN_ONLY_NOT_EXECUTED');
    expect(contract.methodology.suggestedDelayOffsetsSeconds).toContain(8);
    expect(contract.constraints.doNotUseReplayTimestampAsUpperBound).toBe('YES');
  });

  it('13) runtime fix contract exposes configurable provisional parameters', () => {
    const design = buildRecoveryPolicyDesign({
      simulation: buildRecoveryPolicySimulation({
        lateRows: [sampleLateRow()],
        queryWindows: [],
        b4Watermark,
      }),
      lateRows: [sampleLateRow()],
      b4Watermark,
    });
    const contract = buildHfRuntimeFixContract(design);
    expect(contract.status).toBe('DESIGN_ONLY_NOT_IMPLEMENTED');
    expect(contract.PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED).toBe('NO');
    expect(contract.configurableParameters.HF_SETTLEMENT_DELAY_MS.validated).toBe(false);
    expect(contract.configurableParameters.HF_RECOVERY_OVERLAP_MS.tunableWithoutCodeChange).toBe(
      'REQUIRED',
    );
    expect(contract.requiredRuntimeMetrics).toContain('hf_first_availability_delay_ms');
  });

  it('14) settlement table uses deferral semantics, not protection language', () => {
    const settlement = buildSettlementCoverageTable([sampleLateRow()]);
    for (const row of settlement.table) {
      expect(row.bucketCountDefinitelyAvailableByDelay).toBe(0);
      expect(row.providerAvailabilityByDelay).toBe('NOT_DETERMINABLE');
      expect(row.interpretation).toBe('SETTLEMENT_HORIZON_DEFERRAL_ONLY');
    }
  });

  it('15) aggregate bucket count is not equated to unique ECU samples', () => {
    const rows = [
      sampleLateRow({ bucketStart: '2026-09-04T03:37:56.293Z' }),
      sampleLateRow({ bucketStart: '2026-09-04T03:37:56.293Z', avgValue: 1 }),
      sampleLateRow({ bucketStart: '2026-09-04T03:37:58.293Z' }),
    ];
    expect(rows.length).toBe(3);
    expect(countUniqueTemporalBucketStarts(rows)).toBe(2);
  });

  it('16) changed query origins are not exact bucket-identity compared', () => {
    const overlap = buildCombinedPolicyGrid([sampleLateRow()], 7.767)[0]!;
    expect(CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID).toBe('NO');
    expect(overlap.confidence).toBe('LOWER_BOUND');
  });

  it('17) recommended policy supported by evidence with B.6 semantics', () => {
    if (!hasSourceData) return;
    const late = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b/rd004-b-hf-late-arrival-analysis.json'),
        'utf8',
      ),
    ) as { rows: HfLateArrivalDifferentialRow[] };
    const replay = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b/rd004-b-hf-exact-window-replay.json'),
        'utf8',
      ),
    ) as { ORIGINAL_HF_QUERY_WINDOWS: unknown[] };
    const simulation = buildRecoveryPolicySimulation({
      lateRows: late.rows,
      queryWindows: replay.ORIGINAL_HF_QUERY_WINDOWS as never,
      b4Watermark,
    });
    const design = buildRecoveryPolicyDesign({
      simulation,
      lateRows: late.rows,
      b4Watermark,
    });
    expect(design.RECOMMENDED_POLICY_PARAMETERS).toBe('REQUIRES_LIVE_AVAILABILITY_VALIDATION');
    expect(design.PROVISIONAL_SETTLEMENT_DELAY_SECONDS).toBe(8);
    expect(design.PROVISIONAL_RECOVERY_OVERLAP_SECONDS).toBe(6);
    expect(design.PARAMETERS_VALIDATED).toBe('NO');
    expect(design.B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID).toBe('NO');
    expect(design.rd004Status.RD004_HF_RECOVERY_POLICY_DESIGNED).toBe('YES');
    expect(simulation.b5Superseded.B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID).toBe('NO');
  });
});
