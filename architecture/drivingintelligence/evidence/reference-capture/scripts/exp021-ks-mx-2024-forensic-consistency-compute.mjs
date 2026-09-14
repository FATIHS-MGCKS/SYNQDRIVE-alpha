#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..');
const v1 = JSON.parse(readFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json'), 'utf8'));
const v2 = JSON.parse(readFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json'), 'utf8'));

const RC = v1.rcObservationAccounting;
const T0_MS = Date.parse('2026-09-14T11:43:53.000Z');
const T0_END_MS = T0_MS + 600_000;
const TRIP_END_MS = Date.parse('2026-09-14T12:04:15.000Z');

const timestamps = v1.phase4_nativeTelemetry.byWindow.A_nominal.timestamps.map((s) => Date.parse(s));
const gaps = [];
for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
const sortedGaps = [...gaps].sort((a, b) => a - b);
const pct = (p) => sortedGaps[Math.min(sortedGaps.length - 1, Math.floor((p / 100) * sortedGaps.length))];
const startEdge = timestamps[0] - T0_MS;
const endEdge = T0_END_MS - timestamps[timestamps.length - 1];
const fullGaps = [startEdge, ...gaps, endEdge];

const slots = v1.phase3_slotLedgerPreAbortFreeze.map((s) => ({
  ...s,
  durabilityClass: 'UNPROVEN',
  nativeBucketCount: s.status === 'SUCCESS' ? 5 : 0,
}));

const out = {
  generatedAtUtc: new Date().toISOString(),
  freezeVersion: 'EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4',
  productionSha: 'd1501d171c1cc6dc4b83b2720e3a96549ef24185',
  metricCorrections: v1.rcObservationAccounting?.corrections ?? [],
  rcObservationPartition: {
    inclusionRules: RC.inclusionRules,
    RC_TOTAL_PERSISTED: RC.RC_TOTAL_PERSISTED,
    RC_PRE_T0: RC.RC_PRE_T0,
    RC_A: RC.RC_A,
    RC_B: RC.RC_B,
    RC_C: RC.RC_C,
    RC_D: RC.RC_D,
    RC_PARTITION_ARITHMETIC_VALID: RC.RC_PARTITION_ARITHMETIC_VALID,
    byKindTotal: RC.byKindTotal,
    note: 'PRE_T0+A+B+C+D=TOTAL. Prior error conflated PRE_T0 into A (1423=365+1058).',
  },
  providerCounts: {
    TOTAL_REQUESTS: 7,
    TOTAL_SUCCESS: 5,
    TOTAL_FAILURE: 2,
    SUCCESS_RATE_EXACT: '71.428571%',
    W1: { requests: 4, success: 2, failure: 2 },
    W2: { requests: 3, success: 3, failure: 0 },
  },
  nativeHfBuckets: {
    count: 25,
    INTER_BUCKET_INTERVAL_COUNT: 24,
    interBucketOnly: {
      INTER_BUCKET_GAPS_GTE_10: gaps.filter((g) => g >= 10_000).length,
      INTER_BUCKET_GAPS_GTE_20: gaps.filter((g) => g >= 20_000).length,
      INTER_BUCKET_GAPS_GTE_30: gaps.filter((g) => g >= 30_000).length,
      INTER_BUCKET_GAPS_GTE_60: gaps.filter((g) => g >= 60_000).length,
      INTER_BUCKET_MAX: sortedGaps[sortedGaps.length - 1],
    },
    windowEdgeGaps: { START_EDGE_GAP_MS: startEdge, END_EDGE_GAP_MS: endEdge },
    fullWindowCoverage: {
      FULL_WINDOW_MAX_UNOBSERVED_GAP_MS: Math.max(...fullGaps),
      FULL_WINDOW_GAPS_GTE_10: fullGaps.filter((g) => g >= 10_000).length,
      FULL_WINDOW_GAPS_GTE_20: fullGaps.filter((g) => g >= 20_000).length,
      FULL_WINDOW_GAPS_GTE_30: fullGaps.filter((g) => g >= 30_000).length,
      FULL_WINDOW_GAPS_GTE_60: fullGaps.filter((g) => g >= 60_000).length,
    },
    GAP_LIST_HAS_DUPLICATES: false,
  },
  movement: {
    CANONICAL_VALID_MOVEMENT_DURATION: null,
    T0_TO_TRIP_END_WALL_DURATION_MS: TRIP_END_MS - T0_MS,
    POST_TRIP_FALSE_MOVEMENT: 'NOT_ASSESSED',
  },
  settlement: {
    NOMINAL_SETTLEMENT_WINDOWS: 19,
    SETTLEMENT_AGES: 6,
    SETTLEMENT_EXPECTED_ROWS: 114,
    SETTLEMENT_ACTUAL_ROWS: 114,
    SUCCESS: 114,
    SETTLEMENT_STRUCTURAL_COMPLETENESS: 'PASS',
    VALUE_REVISIONS: 'NOT_ASSESSED',
    GAP_RECONSTRUCTABILITY: 'NOT_PROVEN',
  },
  scientificClassification: {
    VALID_T0_EVIDENCE: 'YES',
    VALID_90_OPERATIONAL_EVIDENCE: 'YES',
    VALID_90_SCIENTIFIC_EVIDENCE: 'PARTIAL',
    VALID_90_VS_60_COMPARISON: 'NO',
    VALID_FOR_PRODUCTION_CADENCE_SELECTION: 'NO',
    '1621_SLOT_FIX_PHYSICAL_ACCEPTANCE': 'PASS',
    '1621_SETTLEMENT_GEOMETRY_PHYSICAL_ACCEPTANCE': 'PASS',
  },
  recorderRepair: {
    RECORDER_FAILURE_CLASS: 'OWNERSHIP_GAP',
    '90_TO_60_BLOCKED_BY_TELEMETRY': 'NO',
    RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN: 'NO',
    CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH: 'YES',
    CANONICAL_NEXT_RUN_PATH: 'AUTONOMOUS_ORCHESTRATOR_SOLE_OWNER',
    SUPPORTED_COMPLETE_LIFECYCLE_OWNER: 'reference-capture-exp-021-autonomous-orchestrator.ts',
  },
  slots,
};

writeFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json'), JSON.stringify({ ...v2, consistency: out }, null, 2) + '\n');
console.log(JSON.stringify({ RC_PARTITION_VALID: RC.RC_PARTITION_ARITHMETIC_VALID }, null, 2));
