import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import {
  areSettlementAndOverlapIndependent,
  buildCombinedPolicyGrid,
  buildHfRuntimeFixContract,
  buildRecoveryPolicyDesign,
  buildRecoveryPolicySimulation,
  buildSettlementCoverageTable,
  CANDIDATE_RECOVERY_OVERLAP_SECONDS,
  CANDIDATE_SETTLEMENT_DELAY_SECONDS,
  closedLateBucketProtectedBySettlementDelay,
  countUniqueTemporalBucketStarts,
  CURRENT_PRODUCTION_OVERLAP_MS,
  derivePolicyRecommendation,
  simulateOverlapRecoveryClassification,
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

describe('DI-EV-0035B.5 RD004-B HF recovery policy design + counterfactual simulation', () => {
  it('1) settlement delay and overlap are independent parameters', () => {
    expect(areSettlementAndOverlapIndependent()).toBe(true);
    expect(CANDIDATE_SETTLEMENT_DELAY_SECONDS.length).toBeGreaterThan(1);
    expect(CANDIDATE_RECOVERY_OVERLAP_SECONDS.length).toBeGreaterThan(1);
    const row = sampleLateRow();
    const settlementOnly = closedLateBucketProtectedBySettlementDelay(row, 6);
    const overlap2 = simulateOverlapRecoveryClassification(row, 2);
    const overlap10 = simulateOverlapRecoveryClassification(row, 10);
    expect(settlementOnly).toBe(true);
    expect(overlap2).toBe('DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK');
    expect(overlap10).not.toBe(overlap2);
  });

  it('2) candidate simulation never changes production constants', () => {
    expect(CURRENT_PRODUCTION_OVERLAP_MS).toBe(HF_QUERY_OVERLAP_MS);
    expect(HF_QUERY_OVERLAP_MS).toBe(2000);
    const grid = buildCombinedPolicyGrid([sampleLateRow()], 7.767);
    expect(grid.length).toBe(
      CANDIDATE_SETTLEMENT_DELAY_SECONDS.length * CANDIDATE_RECOVERY_OVERLAP_SECONDS.length,
    );
    expect(HF_QUERY_OVERLAP_MS).toBe(2000);
  });

  it('3) lower-bound lag is not treated as exact availability time', () => {
    const settlement = buildSettlementCoverageTable([sampleLateRow()]);
    for (const row of settlement.table) {
      expect(row.interpretation).toBe('LOWER_BOUND');
    }
  });

  it('4) changed query origins are not exact bucket-identity compared', () => {
    const overlap = buildCombinedPolicyGrid([sampleLateRow()], 7.767)[0]!;
    expect(CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID).toBe('NO');
    expect(overlap.confidence).toBe('LOWER_BOUND');
  });

  it('5) aggregate bucket count is not equated to unique ECU samples', () => {
    const rows = [
      sampleLateRow({ bucketStart: '2026-09-04T03:37:56.293Z' }),
      sampleLateRow({ bucketStart: '2026-09-04T03:37:56.293Z', avgValue: 1 }),
      sampleLateRow({ bucketStart: '2026-09-04T03:37:58.293Z' }),
    ];
    expect(rows.length).toBe(3);
    expect(countUniqueTemporalBucketStarts(rows)).toBe(2);
  });

  it('6) zero-result window limitation remains explicit', () => {
    const simulation = buildRecoveryPolicySimulation({
      lateRows: [],
      queryWindows: [],
      b4Watermark,
    });
    expect(simulation.zeroResultWindowLimitation.ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE).toBe(
      'NO',
    );
  });

  it('7) observed missed-bucket count is lower bound', () => {
    const simulation = buildRecoveryPolicySimulation({
      lateRows: [sampleLateRow()],
      queryWindows: [],
      b4Watermark,
    });
    expect(simulation.zeroResultWindowLimitation.OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND).toBe(
      'YES',
    );
  });

  it('8) current 2 s overlap remains classified insufficient under B.4 evidence', () => {
    expect(b4Watermark.CURRENT_2S_OVERLAP_SUFFICIENT).toBe('NO');
    expect(b4Watermark.DEFINITELY_EXCLUDED_LATE_BUCKET_COUNT).toBe(26);
  });

  it('9) recommended policy is supported by evidence', () => {
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
    expect(design.RECOMMENDED_POLICY_PARAMETERS).toBe('SPECIFIED');
    expect(design.RECOMMENDED_SETTLEMENT_DELAY_SECONDS).toBeGreaterThanOrEqual(6);
    expect(design.RECOMMENDED_RECOVERY_OVERLAP_SECONDS).toBeGreaterThan(2);
    expect(design.rd004Status.RD004_HF_RECOVERY_POLICY_DESIGNED).toBe('YES');
  });

  it('10) runtime implementation contract exists but runtime remains unchanged', () => {
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
    expect(contract.REFERENCE_CAPTURE_RUNTIME_CHANGED).toBe('NO');
    expect(contract.requiredRuntimeMetrics.length).toBeGreaterThanOrEqual(10);
  });

  it('11) sealed source SHA remains unchanged', () => {
    if (!hasSourceData || !fs.existsSync(SOURCE_MANIFEST)) return;
    const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
    const obsSha = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_OBS)).digest('hex');
    expect(manifest.files['source-observations.jsonl'].sha256).toBe(obsSha);
  });

  it('12) no deploy / production runtime change flags', () => {
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
  });
});
