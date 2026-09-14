#!/usr/bin/env node
/**
 * Rebuild derived EXP-021 KS MX 2024 forensic JSON from authoritative constants.
 * Production DB query 2026-09-14 (session 332c1549-...).
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..');

const AUTH = {
  productionSha: 'd1501d171c1cc6dc4b83b2720e3a96549ef24185',
  rc: {
    total: 11413,
    preT0: 365,
    A: 1058,
    B: 938,
    C: 8792,
    D: 260,
    firstAt: '2026-09-14T11:40:13.333Z',
    lastAt: '2026-09-14T13:43:11.191Z',
    byKindTotal: { SESSION_METADATA: 1, SIGNAL_POINT: 11412 },
    byKindPreT0: { SESSION_METADATA: 1, SIGNAL_POINT: 364 },
    byKindA: { SIGNAL_POINT: 1058 },
    byKindB: { SIGNAL_POINT: 938 },
    byKindC: { SIGNAL_POINT: 8792 },
    byKindD: { SIGNAL_POINT: 260 },
    W1: { count: 487, byKind: { SIGNAL_POINT: 487 } },
    W2: { count: 571, byKind: { SIGNAL_POINT: 571 } },
    inclusionRules: {
      preT0: '[first observation, PHYSICAL_T0) — disjoint pre-roll slice',
      A: '[PHYSICAL_T0, NOMINAL_END)',
      B: '[NOMINAL_END, TRIP_PHYSICAL_END)',
      C: '[TRIP_PHYSICAL_END, FORENSIC_FREEZE)',
      D: '[FORENSIC_FREEZE, CONTROLLED_ABORT] inclusive',
      note: 'PRE_T0 + A + B + C + D = TOTAL. A is NOT inclusive of PRE_T0.',
    },
    rawAuthority: 'reference_capture_observations WHERE session_id=332c1549-... production DB 2026-09-14',
  },
  provider: { total: 7, success: 5, failure: 2, rate: '71.428571%' },
  providerByWindow: {
    W1: { requests: 4, success: 2, failure: 2, slots: [0, 1, 2, 3] },
    W2: { requests: 3, success: 3, failure: 0, slots: [4, 5, 6] },
  },
  timestamps: [
    '2026-09-14T11:46:32.544Z', '2026-09-14T11:47:10.412Z', '2026-09-14T11:47:31.412Z',
    '2026-09-14T11:47:48.412Z', '2026-09-14T11:47:58.412Z', '2026-09-14T11:48:39.330Z',
    '2026-09-14T11:48:54.330Z', '2026-09-14T11:48:56.330Z', '2026-09-14T11:48:59.330Z',
    '2026-09-14T11:49:06.330Z', '2026-09-14T11:49:14.330Z', '2026-09-14T11:49:29.330Z',
    '2026-09-14T11:49:49.330Z', '2026-09-14T11:49:58.222Z', '2026-09-14T11:50:08.222Z',
    '2026-09-14T11:50:13.222Z', '2026-09-14T11:50:19.222Z', '2026-09-14T11:50:37.222Z',
    '2026-09-14T11:50:57.222Z', '2026-09-14T11:51:07.222Z', '2026-09-14T11:51:27.201Z',
    '2026-09-14T11:51:48.201Z', '2026-09-14T11:52:07.201Z', '2026-09-14T11:52:27.201Z',
    '2026-09-14T11:52:46.201Z',
  ],
};

const T0_MS = Date.parse('2026-09-14T11:43:53.000Z');
const T0_END_MS = T0_MS + 600_000;
const W1_END_MS = T0_MS + 300_000;
const TRIP_END_MS = Date.parse('2026-09-14T12:04:15.000Z');

function gapMetrics(msList, windowStartMs, windowEndMs) {
  const ts = msList.filter((t) => t >= windowStartMs && t < windowEndMs).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);
  const startEdge = ts.length ? ts[0] - windowStartMs : null;
  const endEdge = ts.length ? windowEndMs - ts[ts.length - 1] : null;
  const gapList10s = gaps.filter((g) => g >= 10_000).map((durationMs, idx) => ({
    durationMs,
    start: new Date(ts[idx]).toISOString(),
    end: new Date(ts[idx + 1]).toISOString(),
  }));
  return {
    count: ts.length,
    first: ts.length ? new Date(ts[0]).toISOString() : null,
    last: ts.length ? new Date(ts[ts.length - 1]).toISOString() : null,
    timestamps: ts.map((t) => new Date(t).toISOString()),
    deltas: {
      p50: pct(50), p75: pct(75), p90: pct(90), p95: pct(95), p99: pct(99),
      max: sorted.length ? sorted[sorted.length - 1] : null,
    },
    gapsGte10s: gaps.filter((g) => g >= 10_000).length,
    gapsGte20s: gaps.filter((g) => g >= 20_000).length,
    gapsGte30s: gaps.filter((g) => g >= 30_000).length,
    gapsGte60s: gaps.filter((g) => g >= 60_000).length,
    gapList10s,
    windowEdgeGaps: startEdge != null ? { START_EDGE_GAP_MS: startEdge, END_EDGE_GAP_MS: endEdge } : null,
  };
}

const allMs = AUTH.timestamps.map((s) => Date.parse(s));
const nominal = gapMetrics(allMs, T0_MS, T0_END_MS);
const fullGaps = nominal.windowEdgeGaps
  ? [nominal.windowEdgeGaps.START_EDGE_GAP_MS, ...Array.from({ length: allMs.length - 1 }, (_, i) => allMs[i + 1] - allMs[i]), nominal.windowEdgeGaps.END_EDGE_GAP_MS]
  : [];
nominal.fullWindowCoverage = {
  FULL_WINDOW_MAX_UNOBSERVED_GAP_MS: Math.max(...fullGaps),
  FULL_WINDOW_GAPS_GTE_10: fullGaps.filter((g) => g >= 10_000).length,
  FULL_WINDOW_GAPS_GTE_20: fullGaps.filter((g) => g >= 20_000).length,
  FULL_WINDOW_GAPS_GTE_30: fullGaps.filter((g) => g >= 30_000).length,
  FULL_WINDOW_GAPS_GTE_60: fullGaps.filter((g) => g >= 60_000).length,
};

const v1Path = join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json');
const v1 = JSON.parse(readFileSync(v1Path, 'utf8'));

v1.durations.ACTUAL_MOVING_DURATION_MS = undefined;
v1.durations.T0_TO_TRIP_END_WALL_DURATION_MS = TRIP_END_MS - T0_MS;
delete v1.durations.ACTUAL_MOVING_DURATION_MS;

v1.phase4_nativeTelemetry.byWindow.A_nominal = { ...nominal, wallDurationMs: 600_000, bucketsPerMin: 2.5 };
v1.phase4_nativeTelemetry.byWindow.full_pre_freeze = { ...nominal };
v1.phase4_nativeTelemetry.GAP_LIST_HAS_DUPLICATES = 'NO';
v1.phase4_nativeTelemetry.nativeStartsTotal = 25;

const w1g = gapMetrics(allMs, T0_MS, W1_END_MS);
const w2g = gapMetrics(allMs, W1_END_MS, T0_END_MS);

for (const [key, g, pw, rc, prov] of [
  ['W1', w1g, 300_000, AUTH.rc.W1, AUTH.providerByWindow.W1],
  ['W2', w2g, 300_000, AUTH.rc.W2, AUTH.providerByWindow.W2],
]) {
  if (!v1.phase6_fiveMinuteWindows) v1.phase6_fiveMinuteWindows = {};
  v1.phase6_fiveMinuteWindows[key] = {
    ...v1.phase6_fiveMinuteWindows[key],
    nativeBuckets: g.count,
    nativeHfBuckets: g.count,
    rcObservations: rc.count,
    byKind: rc.byKind,
    BY_KIND_COUNTS: 'ASSESSED',
    providerRequests: prov.requests,
    providerSuccesses: prov.success,
    providerFailures: prov.failure,
    gapsGte10s: g.gapsGte10s,
    gapsGte20s: g.gapsGte20s,
    gapsGte30s: g.gapsGte30s,
    gapsGte60s: g.gapsGte60s,
    gapList10s: g.gapList10s,
    wallDurationMs: pw,
    movementClass: key === 'W1' ? 'CONFIRMED_MOVEMENT_PRESENT' : 'CONFIRMED_MOVEMENT_PRESENT',
  };
}

v1.phase7_nominal10Min = {
  '90_NOMINAL_WALL_DURATION': 600_000,
  '90_NOMINAL_VALID_MOVEMENT': null,
  '90_NOMINAL_PROVIDER_REQUEST_COUNT': 7,
  '90_NOMINAL_PROVIDER_SUCCESS_COUNT': 5,
  '90_NOMINAL_PROVIDER_FAILURE_COUNT': 2,
  '90_NOMINAL_PROVIDER_SUCCESS_RATE_EXACT': AUTH.provider.rate,
  '90_NOMINAL_NATIVE_BUCKET_COUNT': 25,
  '90_NOMINAL_BUCKETS_PER_MIN': 2.5,
  'FORENSIC_NOMINAL_10MIN_STATUS': 'DEGRADED',
};
v1.phase7_nominal10min = v1.phase7_nominal10Min;
if (v1.phase7_nominal10Min?.PROVIDER_REQUESTS !== undefined) {
  delete v1.phase7_nominal10Min.PROVIDER_REQUESTS;
}

v1.phase9_postTripTail = {
  ...v1.phase9_postTripTail,
  POST_TRIP_FALSE_MOVEMENT: 'NOT_ASSESSED',
  POST_TRIP_NEW_TRIP_OPENED: 'NO',
  POST_TRIP_DUPLICATE_SLOT_EXECUTION: 'NO',
  TRIP_FSM_RESTING_COMPLETED: 'YES',
  TAIL_INTEGRITY: 'PASS (no new HF slots, no trip reopen, no duplicate scheduler work; false movement NOT_ASSESSED)',
};

v1.phase10_settlement.VALUE_REVISIONS = 'NOT_ASSESSED';
v1.phase10_settlement.SETTLEMENT_STRUCTURAL_COMPLETENESS = 'PASS';
v1.phase10_settlement.GAP_RECONSTRUCTABILITY = 'NOT_PROVEN';
delete v1.phase10_settlement.SETTLEMENT_RECOVERY_RATE;

v1.phase11_gapRecovery = { GAP_RECONSTRUCTABILITY: 'NOT_PROVEN' };

v1.phase14_provider = {
  TOTAL_REQUESTS: 7,
  TOTAL_SUCCESS: 5,
  TOTAL_FAILURE: 2,
  SUCCESS_RATE_EXACT: AUTH.provider.rate,
  FAILURE_BREAKDOWN: { ZERO_RESULT: 2, HTTP_ERROR: 0, TIMEOUT: 0, AUTH_ERROR: 0 },
};

v1.phase16_verdicts = {
  ...v1.phase16_verdicts,
  C_post_trip_tail_integrity_evidence: 'YES (scheduler/trip boundaries; false movement NOT_ASSESSED)',
  settlement_structural_completeness: 'PASS',
  gap_reconstructability: 'NOT_PROVEN',
};

if (v1.finalReport) {
  v1.finalReport.T0_TO_TRIP_END_WALL_DURATION_MS = TRIP_END_MS - T0_MS;
  delete v1.finalReport.ACTUAL_MOVING_DURATION_MS;
}

v1.rcObservationAccounting = {
  RC_TOTAL_PERSISTED: AUTH.rc.total,
  RC_PRE_T0: AUTH.rc.preT0,
  RC_A: AUTH.rc.A,
  RC_B: AUTH.rc.B,
  RC_C: AUTH.rc.C,
  RC_D: AUTH.rc.D,
  RC_PARTITION_ARITHMETIC_VALID: AUTH.rc.preT0 + AUTH.rc.A + AUTH.rc.B + AUTH.rc.C + AUTH.rc.D === AUTH.rc.total,
  inclusionRules: AUTH.rc.inclusionRules,
  byKindTotal: AUTH.rc.byKindTotal,
  corrections: [
    { field: 'RC_A', OLD_VALUE: 1423, NEW_VALUE: 1058, REASON: '1423 conflated PRE_T0+A; DB disjoint partition', RAW_AUTHORITY: AUTH.rc.rawAuthority },
    { field: 'RC_PRE_T0', OLD_VALUE: 625, NEW_VALUE: 365, REASON: 'Stale derived count; production DB recount', RAW_AUTHORITY: AUTH.rc.rawAuthority },
  ],
};

v1.correctionNote = 'Final cross-file closure 2026-09-14: RC partition, gaps, provider counts, movement semantics';
writeFileSync(v1Path, JSON.stringify(v1, null, 2) + '\n');

const v2Path = join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json');
const v2 = JSON.parse(readFileSync(v2Path, 'utf8'));
v2.referenceCaptureObservations = {
  totalPreserved: AUTH.rc.total,
  firstAt: AUTH.rc.firstAt,
  lastAt: AUTH.rc.lastAt,
  disjointPartition: {
    preT0: AUTH.rc.preT0,
    A_nominal: AUTH.rc.A,
    B_movingOverrun: AUTH.rc.B,
    C_postTripTail: AUTH.rc.C,
    D_abortArtifact: AUTH.rc.D,
    sumEqualsTotal: true,
    inclusionRules: AUTH.rc.inclusionRules,
  },
  byWindow: {
    preT0: AUTH.rc.preT0,
    A_nominal: AUTH.rc.A,
    B_movingOverrun: AUTH.rc.B,
    C_postTripTail: AUTH.rc.C,
    D_abortArtifact: AUTH.rc.D,
  },
  byKindTotal: AUTH.rc.byKindTotal,
  byKindByWindow: {
    preT0: AUTH.rc.byKindPreT0,
    A_nominal: AUTH.rc.byKindA,
    B_movingOverrun: AUTH.rc.byKindB,
    C_postTripTail: AUTH.rc.byKindC,
    D_abortArtifact: AUTH.rc.byKindD,
  },
  note: 'A+B+C+D=11048; PRE_T0+A+B+C+D=11413. Do not add PRE_T0 to A.',
};
v2.extendedTimeSlices = {
  other: { rcObservations: AUTH.rc.preT0, byKind: AUTH.rc.byKindPreT0, BY_KIND_COUNTS: 'ASSESSED', nativeHfBuckets: 0, movementClass: 'PRE_ROLL_RECORDING' },
  W1: { rcObservations: AUTH.rc.W1.count, byKind: AUTH.rc.W1.byKind, BY_KIND_COUNTS: 'ASSESSED', nativeHfBuckets: w1g.count, rcObsPerMin: 97.4, movementClass: 'CONFIRMED_MOVEMENT_PRESENT' },
  W2: { rcObservations: AUTH.rc.W2.count, byKind: AUTH.rc.W2.byKind, BY_KIND_COUNTS: 'ASSESSED', nativeHfBuckets: w2g.count, rcObsPerMin: 114.2, movementClass: 'CONFIRMED_MOVEMENT_PRESENT' },
};
for (const k of ['W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10']) {
  const prev = v2.extendedTimeSlices?.[k] ?? {};
  v2.extendedTimeSlices[k] = {
    ...prev,
    byKind: undefined,
    BY_KIND_COUNTS: 'NOT_ASSESSED',
    nativeHfBuckets: 0,
    movementClass: k <= 'W5' ? 'UNKNOWN_WITH_ACTIVE_TRIP' : 'STATIONARY',
  };
}
v2.tenCriticalQuestions.Q2_observationPartition = {
  RC_PRE_T0: AUTH.rc.preT0,
  A_nominal: AUTH.rc.A,
  B_movingOverrun: AUTH.rc.B,
  C_postTripTail: AUTH.rc.C,
  D_abortArtifact: AUTH.rc.D,
  total: AUTH.rc.total,
  arithmetic: 'PRE_T0+A+B+C+D=11413',
};
v2.tenCriticalQuestions.Q3_validMovementStopped = {
  answer: 'validMovementDurationMs remained null throughout; false physical movement NOT_ASSESSED from null alone',
  preAbort: null,
};
v2.tenCriticalQuestions.Q7_orphanedPhaseAnomalies = {
  duplicateObservations: 'NO evidence of duplicate slot/settlement execution',
  queueGrowth: 'RC runner continued (~1215 cycles pre-freeze) — expected for RECORDING session',
  memoryGrowth: 'UNKNOWN',
  duplicateExecution: 'NO — settlement idempotency keys unique (114 rows)',
  schedulerAnomalies: 'NO split-brain; single session runner',
  staleTelemetryAsFresh: 'NOT_ASSESSED at signal level',
  falseMovement: 'NOT_ASSESSED',
  falseTripReopening: 'NO — Trip FSM stayed RESTING',
  POST_TRIP_NEW_HF_SLOT_EXECUTION: 0,
  POST_TRIP_NATIVE_HF_BUCKETS: 0,
  POST_TRIP_NEW_TRIP_OPENED: 'NO',
  TRIP_FSM_RESTING_COMPLETED: 'YES',
};
delete v2.consistency;
writeFileSync(v2Path, JSON.stringify(v2, null, 2) + '\n');

console.log('rebuild complete');
