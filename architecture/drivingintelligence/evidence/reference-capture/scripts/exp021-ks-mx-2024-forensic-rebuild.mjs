#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..');

export const PERCENTILE_METHOD = 'NEAREST_RANK';

const AUTH = {
  productionSha: 'd1501d171c1cc6dc4b83b2720e3a96549ef24185',
  rc: {
    total: 11413, preT0: 365, A: 1058, B: 938, C: 8792, D: 260,
    firstAt: '2026-09-14T11:40:13.333Z', lastAt: '2026-09-14T13:43:11.191Z',
    byKindTotal: { SESSION_METADATA: 1, SIGNAL_POINT: 11412 },
    byKindPreT0: { SESSION_METADATA: 1, SIGNAL_POINT: 364 },
    byKindA: { SIGNAL_POINT: 1058 }, byKindB: { SIGNAL_POINT: 938 },
    byKindC: { SIGNAL_POINT: 8792 }, byKindD: { SIGNAL_POINT: 260 },
    W1: { count: 487, byKind: { SIGNAL_POINT: 487 } },
    W2: { count: 571, byKind: { SIGNAL_POINT: 571 } },
    inclusionRules: {
      preT0: '[first observation, PHYSICAL_T0)',
      A: '[PHYSICAL_T0, NOMINAL_END)',
      B: '[NOMINAL_END, TRIP_PHYSICAL_END)',
      C: '[TRIP_PHYSICAL_END, FORENSIC_FREEZE)',
      D: '[FORENSIC_FREEZE, CONTROLLED_ABORT] inclusive',
      note: 'PRE_T0 + A + B + C + D = TOTAL',
    },
    rawAuthority: 'reference_capture_observations production DB 2026-09-14',
  },
  provider: { total: 7, success: 5, failure: 2, rate: '71.428571%' },
  providerByWindow: {
    W1: { requests: 4, success: 2, failure: 2 },
    W2: { requests: 3, success: 3, failure: 0 },
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
  lastSettlementAt: '2026-09-14T12:03:53.325Z',
  forensicFreezeAt: '2026-09-14T13:40:26.693Z',
};

const T0_MS = Date.parse('2026-09-14T11:43:53.000Z');
const T0_END_MS = T0_MS + 600_000;
const W1_END_MS = T0_MS + 300_000;
const TRIP_END_MS = Date.parse('2026-09-14T12:04:15.000Z');
const FREEZE_MS = Date.parse(AUTH.forensicFreezeAt);
const ALL_MS = AUTH.timestamps.map((s) => Date.parse(s));

function nearestRankPercentile(sortedGaps, p) {
  const n = sortedGaps.length;
  if (!n) return null;
  return sortedGaps[Math.ceil(p * n) - 1];
}

function buildGapList(ts, thresholdMs = 10_000) {
  const list = [];
  for (let i = 1; i < ts.length; i++) {
    const durationMs = ts[i] - ts[i - 1];
    if (durationMs >= thresholdMs) {
      list.push({
        durationMs,
        start: new Date(ts[i - 1]).toISOString(),
        end: new Date(ts[i]).toISOString(),
      });
    }
  }
  return list;
}

function gapMetrics(msList, windowStartMs, windowEndMs, includeWindowEdges = false) {
  const ts = msList.filter((t) => t >= windowStartMs && t < windowEndMs).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const gapList10s = buildGapList(ts, 10_000);
  const out = {
    count: ts.length,
    first: ts.length ? new Date(ts[0]).toISOString() : null,
    last: ts.length ? new Date(ts[ts.length - 1]).toISOString() : null,
    timestamps: ts.map((t) => new Date(t).toISOString()),
    PERCENTILE_METHOD,
    deltas: {
      p50: nearestRankPercentile(sorted, 0.5),
      p75: nearestRankPercentile(sorted, 0.75),
      p90: nearestRankPercentile(sorted, 0.9),
      p95: nearestRankPercentile(sorted, 0.95),
      p99: nearestRankPercentile(sorted, 0.99),
      max: sorted.length ? sorted[sorted.length - 1] : null,
    },
    gapsGte10s: gaps.filter((g) => g >= 10_000).length,
    gapsGte20s: gaps.filter((g) => g >= 20_000).length,
    gapsGte30s: gaps.filter((g) => g >= 30_000).length,
    gapsGte60s: gaps.filter((g) => g >= 60_000).length,
    gapList10s,
  };
  if (includeWindowEdges && ts.length) {
    const startEdge = ts[0] - windowStartMs;
    const endEdge = windowEndMs - ts[ts.length - 1];
    const fullGaps = [startEdge, ...gaps, endEdge];
    out.windowEdgeGaps = { START_EDGE_GAP_MS: startEdge, END_EDGE_GAP_MS: endEdge };
    out.fullWindowCoverage = {
      FULL_WINDOW_MAX_UNOBSERVED_GAP_MS: Math.max(...fullGaps),
      FULL_WINDOW_GAPS_GTE_10: fullGaps.filter((g) => g >= 10_000).length,
      FULL_WINDOW_GAPS_GTE_20: fullGaps.filter((g) => g >= 20_000).length,
      FULL_WINDOW_GAPS_GTE_30: fullGaps.filter((g) => g >= 30_000).length,
      FULL_WINDOW_GAPS_GTE_60: fullGaps.filter((g) => g >= 60_000).length,
    };
  }
  return out;
}

const nominal = gapMetrics(ALL_MS, T0_MS, T0_END_MS, true);
const w1g = gapMetrics(ALL_MS, T0_MS, W1_END_MS, false);
const w2g = gapMetrics(ALL_MS, W1_END_MS, T0_END_MS, false);

const fullPreFreeze = {
  count: ALL_MS.length,
  first: AUTH.timestamps[0],
  last: AUTH.timestamps[AUTH.timestamps.length - 1],
  timestamps: AUTH.timestamps,
  HF_CONTINUITY_AFTER_NOMINAL_WINDOW: 'NOT_APPLICABLE_NO_HF_SLOTS_SCHEDULED',
  note: 'Bucket inventory only. Last native HF bucket precedes forensic freeze by ~107.7 min; no HF slots scheduled after slot 6.',
};

const v1Path = join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json');
const v1 = JSON.parse(readFileSync(v1Path, 'utf8'));

v1.durations.T0_TO_TRIP_END_WALL_DURATION_MS = TRIP_END_MS - T0_MS;
delete v1.durations.ACTUAL_MOVING_DURATION_MS;

v1.phase4_nativeTelemetry = {
  PERCENTILE_METHOD,
  nativeStartsTotal: 25,
  GAP_LIST_HAS_DUPLICATES: 'NO',
  byWindow: {
    A_nominal: { ...nominal, wallDurationMs: 600_000, bucketsPerMin: 2.5 },
    full_pre_freeze: fullPreFreeze,
    B_overrun: { count: 0, timestamps: [], note: 'No native HF buckets after nominal window' },
    C_tail: { count: 0, timestamps: [], note: 'No native HF buckets in post-trip tail' },
  },
};

v1.phase4_postNominalHf = {
  POST_10_MIN_HF_DETERMINISTIC_REQUESTS: 0,
  POST_10_MIN_NATIVE_HF_BUCKETS: 0,
  POST_10_MIN_RC_CAPTURE_CONTINUED: 'YES',
  POST_10_MIN_RC_SOURCE: 'RC_ACQUISITION_RUNNER_CYCLE',
  SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END: 'YES',
  SETTLEMENT_DURING_POST_TRIP_TAIL: 'NO',
  lastSettlementAt: AUTH.lastSettlementAt,
  tripPhysicalEnd: new Date(TRIP_END_MS).toISOString(),
};

delete v1.phase4_nativeTelemetryLegacy;
delete v1.post10MinAcquisition;
if (v1.phase4_nativeTelemetry?.POST_10_MIN_DATA_SOURCE) {
  delete v1.phase4_nativeTelemetry.POST_10_MIN_DATA_SOURCE;
}

v1.phase5_signalCompleteness = {
  CANONICAL_KEY_AVAILABILITY: 'NOT_ASSESSED',
  PROVIDER_FIELD_PATH_AVAILABILITY: 'NOT_ASSESSED',
  SIGNAL_LEVEL_ASSESSABILITY: 'NOT_ASSESSED',
  note: 'Prior per-signal 0% placeholders removed — canonicalKey path was not valid audit surface.',
};

const sliceMovement = (key) => {
  const w6Start = T0_MS + 25 * 60_000;
  if (key === 'W1' || key === 'W2') {
    return { TRIP_STATE_CLASS: 'ACTIVE_TRIP', PHYSICAL_MOVEMENT_CLASS: key === 'W1' || key === 'W2' ? 'CONFIRMED_MOVEMENT_PRESENT' : 'NOT_ASSESSED' };
  }
  if (key === 'W3' || key === 'W4' || key === 'W5') {
    return { TRIP_STATE_CLASS: 'ACTIVE_TRIP', PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED' };
  }
  if (w6Start >= TRIP_END_MS || key >= 'W6') {
    return { TRIP_STATE_CLASS: 'POST_TRIP_RESTING_COMPLETED', PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED' };
  }
  return { TRIP_STATE_CLASS: 'NOT_ASSESSED', PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED' };
};

v1.phase6_fiveMinuteWindows = {};
for (const [key, g, pw, rc, prov] of [
  ['W1', w1g, 300_000, AUTH.rc.W1, AUTH.providerByWindow.W1],
  ['W2', w2g, 300_000, AUTH.rc.W2, AUTH.providerByWindow.W2],
]) {
  v1.phase6_fiveMinuteWindows[key] = {
    nativeBuckets: g.count,
    rcObservations: rc.count,
    byKind: rc.byKind,
    BY_KIND_COUNTS: 'ASSESSED',
    providerRequests: prov.requests,
    providerSuccesses: prov.success,
    providerFailures: prov.failure,
    gapsGte10s: g.gapsGte10s,
    gapList10s: g.gapList10s,
    PERCENTILE_METHOD,
    deltas: g.deltas,
    wallDurationMs: pw,
    ...sliceMovement(key),
  };
}
for (const k of ['W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10']) {
  const prev = v1.phase6_fiveMinuteWindows?.[k] ?? {};
  v1.phase6_fiveMinuteWindows[k] = {
    ...prev,
    hfSlotsScheduled: 0,
    BY_KIND_COUNTS: 'NOT_ASSESSED',
    nativeBuckets: 0,
    ...sliceMovement(k),
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
  PERCENTILE_METHOD,
  interBucketPercentiles: nominal.deltas,
};
v1.phase7_nominal10min = v1.phase7_nominal10Min;

v1.phase9_postTripTail = {
  TRIP_END_AT: new Date(TRIP_END_MS).toISOString(),
  PHASE_STILL_ACTIVE_UNTIL: AUTH.forensicFreezeAt,
  POST_TRIP_FALSE_MOVEMENT: 'NOT_ASSESSED',
  TRIP_STATE_CLASS: 'POST_TRIP_RESTING_COMPLETED',
  PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED',
  POST_TRIP_NEW_HF_SLOT_EXECUTION: 0,
  POST_TRIP_NATIVE_HF_BUCKETS: 0,
  POST_TRIP_NEW_TRIP_OPENED: 'NO',
  POST_TRIP_SETTLEMENT_EXECUTION: 0,
  SETTLEMENT_DURING_POST_TRIP_TAIL: 'NO',
  TRIP_FSM_RESTING_COMPLETED: 'YES',
};

v1.phase10_settlement = {
  ...v1.phase10_settlement,
  VALUE_REVISIONS: 'NOT_ASSESSED',
  SETTLEMENT_STRUCTURAL_COMPLETENESS: 'PASS',
  GAP_RECONSTRUCTABILITY: 'NOT_PROVEN',
  SETTLEMENT_DURING_POST_TRIP_TAIL: 'NO',
  SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END: 'YES',
  lastSettlementAt: AUTH.lastSettlementAt,
};
delete v1.phase10_settlement.SETTLEMENT_RECOVERY_RATE;

v1.phase11_gapRecovery = { GAP_RECONSTRUCTABILITY: 'NOT_PROVEN' };
v1.phase14_provider = {
  TOTAL_REQUESTS: 7, TOTAL_SUCCESS: 5, TOTAL_FAILURE: 2,
  SUCCESS_RATE_EXACT: AUTH.provider.rate,
  FAILURE_BREAKDOWN: { ZERO_RESULT: 2, HTTP_ERROR: 0, TIMEOUT: 0, AUTH_ERROR: 0 },
};

v1.movementSemantics = {
  CANONICAL_VALID_MOVEMENT_DURATION: null,
  VALID_MOVEMENT_DURATION_BEHAVIOR: 'NOT_ASSESSED',
  VALID_MOVEMENT_DURATION_REASON: 'movement-duration tracker did not produce a canonical duration',
  T0_TO_TRIP_END_WALL_DURATION_MS: TRIP_END_MS - T0_MS,
};

v1.rcObservationAccounting = {
  RC_TOTAL_PERSISTED: AUTH.rc.total,
  RC_PRE_T0: AUTH.rc.preT0,
  RC_A: AUTH.rc.A,
  RC_B: AUTH.rc.B,
  RC_C: AUTH.rc.C,
  RC_D: AUTH.rc.D,
  RC_PARTITION_ARITHMETIC_VALID: true,
  inclusionRules: AUTH.rc.inclusionRules,
  byKindTotal: AUTH.rc.byKindTotal,
};

v1.consistencyArtifactVersion = 'EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4';
v1.correctionNote = 'Derived-evidence integrity fix 2026-09-14: gap tuples, NEAREST_RANK percentiles, movement/settlement semantics';
writeFileSync(v1Path, JSON.stringify(v1, null, 2) + '\n');

const v2Path = join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json');
const v2 = JSON.parse(readFileSync(v2Path, 'utf8'));
v2.consistencyArtifactVersion = 'EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4';
v2.referenceCaptureObservations = {
  totalPreserved: AUTH.rc.total,
  firstAt: AUTH.rc.firstAt,
  lastAt: AUTH.rc.lastAt,
  disjointPartition: {
    preT0: AUTH.rc.preT0, A_nominal: AUTH.rc.A, B_movingOverrun: AUTH.rc.B,
    C_postTripTail: AUTH.rc.C, D_abortArtifact: AUTH.rc.D,
    sumEqualsTotal: true, inclusionRules: AUTH.rc.inclusionRules,
  },
  byWindow: {
    preT0: AUTH.rc.preT0, A_nominal: AUTH.rc.A, B_movingOverrun: AUTH.rc.B,
    C_postTripTail: AUTH.rc.C, D_abortArtifact: AUTH.rc.D,
  },
  byKindByWindow: {
    preT0: AUTH.rc.byKindPreT0, A_nominal: AUTH.rc.byKindA, B_movingOverrun: AUTH.rc.byKindB,
    C_postTripTail: AUTH.rc.byKindC, D_abortArtifact: AUTH.rc.byKindD,
  },
};
v2.nativeHfBuckets = { ...v2.nativeHfBuckets, PERCENTILE_METHOD, interBucketPercentiles: nominal.deltas };
v2.extendedTimeSlices = {
  other: { rcObservations: AUTH.rc.preT0, byKind: AUTH.rc.byKindPreT0, BY_KIND_COUNTS: 'ASSESSED', nativeHfBuckets: 0, TRIP_STATE_CLASS: 'PRE_ROLL_RECORDING', PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED' },
  W1: { rcObservations: AUTH.rc.W1.count, byKind: AUTH.rc.W1.byKind, nativeHfBuckets: w1g.count, ...sliceMovement('W1') },
  W2: { rcObservations: AUTH.rc.W2.count, byKind: AUTH.rc.W2.byKind, nativeHfBuckets: w2g.count, ...sliceMovement('W2') },
};
for (const k of ['W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10']) {
  const prev = v2.extendedTimeSlices?.[k] ?? {};
  v2.extendedTimeSlices[k] = { ...prev, nativeHfBuckets: 0, BY_KIND_COUNTS: 'NOT_ASSESSED', ...sliceMovement(k) };
}
v2.tenCriticalQuestions.Q3_validMovementStopped = {
  VALID_MOVEMENT_DURATION_BEHAVIOR: 'NOT_ASSESSED',
  reason: 'movement-duration tracker did not produce a canonical duration; validMovementDurationMs remained null throughout',
  validMovementDurationMs: null,
};
v2.tenCriticalQuestions.Q5_settlementDuringTail = {
  SETTLEMENT_DURING_POST_TRIP_TAIL: 'NO',
  SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END: 'YES',
  lastSettlementAt: AUTH.lastSettlementAt,
  tripPhysicalEnd: new Date(TRIP_END_MS).toISOString(),
  detail: 'All 114 observations terminal SUCCESS by 12:03:53Z; trip end 12:04:15Z; zero settlement rows executed in Window C',
};
v2.tenCriticalQuestions.Q7_orphanedPhaseAnomalies = {
  falseMovement: 'NOT_ASSESSED',
  falseTripReopening: 'NO',
  POST_TRIP_NEW_HF_SLOT_EXECUTION: 0,
  POST_TRIP_NATIVE_HF_BUCKETS: 0,
  TRIP_STATE_CLASS: 'POST_TRIP_RESTING_COMPLETED',
  PHYSICAL_MOVEMENT_CLASS: 'NOT_ASSESSED',
};
delete v2.consistency;
writeFileSync(v2Path, JSON.stringify(v2, null, 2) + '\n');

console.log(JSON.stringify({ rebuild: 'ok', PERCENTILE_METHOD, p50: nominal.deltas.p50, gapListLen: nominal.gapList10s.length }, null, 2));
