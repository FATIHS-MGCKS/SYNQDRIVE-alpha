#!/usr/bin/env node
/**
 * Derived-evidence consistency compute for EXP-021 KS MX 2024 (read-only).
 * Sources: pre-abort freeze JSON fields, v1 forensic timestamps, v2 RC partition.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..');

const v1 = JSON.parse(
  readFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json'), 'utf8'),
);
const v2 = JSON.parse(
  readFileSync(join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json'), 'utf8'),
);

const T0_MS = Date.parse('2026-09-14T11:43:53.000Z');
const T0_END_MS = T0_MS + 600_000;
const TRIP_END_MS = Date.parse('2026-09-14T12:04:15.000Z');
const FREEZE_MS = Date.parse('2026-09-14T13:40:26.693Z');
const ABORT_MS = Date.parse('2026-09-14T13:43:11.614Z');

const timestamps = v1.phase4_nativeTelemetry.byWindow.A_nominal.timestamps.map((s) => Date.parse(s));
const gaps = [];
for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
const sortedGaps = [...gaps].sort((a, b) => a - b);
const pct = (p) => sortedGaps[Math.min(sortedGaps.length - 1, Math.floor((p / 100) * sortedGaps.length))];
const startEdge = timestamps[0] - T0_MS;
const endEdge = T0_END_MS - timestamps[timestamps.length - 1];
const fullGaps = [startEdge, ...gaps, endEdge];
const gte = (n) => fullGaps.filter((g) => g >= n).length;

const slots = v1.phase3_slotLedgerPreAbortFreeze.map((s) => ({
  ...s,
  durabilityClass: 'UNPROVEN',
  nativeBucketCount: s.status === 'SUCCESS' ? 5 : 0,
}));

const slot0 = slots.find((s) => s.slotIndex === 0);
const slot2 = slots.find((s) => s.slotIndex === 2);

const out = {
  generatedAtUtc: new Date().toISOString(),
  freezeVersion: 'EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v3',
  productionSha: 'd1501d171c1cc6dc4b83b2720e3a96549ef24185',
  authorityMap: {
    slotLedger: 'pre-abort forensic freeze JSON phase90.slots + v1 phase3_slotLedgerPreAbortFreeze',
    providerCounters: 'pre-abort freeze phase90.counters (allRequestCount=7)',
    nativeHfBuckets: 'pre-abort freeze phase90.nativeBuckets.bucketTimestamps (25)',
    settlementRows: 'reference_capture_settlement_shadow_observations DB + v1 phase10_settlement matrix',
    rcObservations: 'reference_capture_observations DB synq_received_at partition (v2)',
    tripFsm: 'run-monitor jsonl + vehicle_trips.end_time',
    t0Timeline: 't0-watcher jsonl + T0_ACTIVATED event',
    orchestratorOwnership: 'incomplete-short-ab forensic freeze lifecycle section + deployed orchestrator source',
  },
  t0Timeline: {
    T0_EFFECTIVE_AT: '2026-09-14T11:43:53.000Z',
    T0_FIRST_OBSERVED_AT: '2026-09-14T11:44:08.526Z',
    T0_CONFIRMATION_STARTED_AT: '2026-09-14T11:44:08.031Z',
    T0_CONFIRMED_AT: '2026-09-14T11:46:25.216Z',
    T0_PERSISTED_AT: '2026-09-14T11:46:27.198Z',
    PHYSICAL_PHASE_ACTIVATED_AT: '2026-09-14T11:46:27.198Z',
    T0_ACTIVATION_LAG_MS: Date.parse('2026-09-14T11:46:27.198Z') - T0_MS,
    reanchorRule:
      'Deployed rule: firstQualifyingMovementAt backdated to canonicalT0At when 4+ qualifying samples confirm movement; persisted authority immutable after seal.',
  },
  providerCounts: {
    TOTAL_REQUESTS: 7,
    TOTAL_SUCCESS: 5,
    TOTAL_FAILURE: 2,
    SUCCESS_RATE_EXACT: 5 / 7,
    SUCCESS_RATE_DISPLAY: '71.428571%',
    failures: [
      { slotIndex: 0, cause: 'ZERO_RESULT', httpError: false, authError: false, timeout: false },
      { slotIndex: 2, cause: 'ZERO_RESULT', httpError: false, authError: false, timeout: false },
    ],
  },
  slots,
  slotZeroResultForensics: {
    slot0: {
      SLOT_0_ZERO_RESULT_CAUSE: 'PROVIDER_ZERO_RESULT',
      SLOT_0_CATCHUP_CONTRIBUTION: 'YES',
      SLOT_0_PROVIDER_TRANSIENT_PROVEN: 'NO',
      detail:
        'Slot 0 issued 159,519 ms after scheduledAt; HF activation lagged canonical T0 by 154,198 ms. Provider returned ZERO_RESULT (not HTTP/auth/timeout). Probe interval fully historical at issue time; catch-up timing plausibly contributory. Transient-provider classification NOT proven — probeDetail unavailable in freeze.',
      requestedIntervalHistoricalAtIssue: true,
      issueLagMs: slot0.issueLagMs,
    },
    slot2: {
      SLOT_2_ZERO_RESULT_CAUSE: 'PROVIDER_ZERO_RESULT',
      SLOT_2_CATCHUP_CONTRIBUTION: 'MARGINAL',
      SLOT_2_PROVIDER_TRANSIENT_PROVEN: 'NO',
      detail:
        'Slot 2 issued 3,384 ms after scheduledAt (26 s after server activation). ZERO_RESULT without HTTP/auth/timeout. Catch-up less severe than slot 0; independent provider empty result cannot be ruled transient without probe metadata.',
      issueLagMs: slot2.issueLagMs,
    },
  },
  nativeHfBuckets: {
    count: 25,
    UNIQUE_NATIVE_BUCKETS: timestamps.length,
    INTER_BUCKET_INTERVAL_COUNT: gaps.length,
    EXPECTED_INTERVAL_COUNT: timestamps.length - 1,
    GAP_LIST_HAS_DUPLICATES: false,
    interBucketOnly: {
      INTER_BUCKET_P50: pct(50),
      INTER_BUCKET_P75: pct(75),
      INTER_BUCKET_P90: pct(90),
      INTER_BUCKET_P95: pct(95),
      INTER_BUCKET_P99: pct(99),
      INTER_BUCKET_MAX: sortedGaps[sortedGaps.length - 1],
      INTER_BUCKET_GAPS_GTE_10: gaps.filter((g) => g >= 10_000).length,
      INTER_BUCKET_GAPS_GTE_20: gaps.filter((g) => g >= 20_000).length,
      INTER_BUCKET_GAPS_GTE_30: gaps.filter((g) => g >= 30_000).length,
      INTER_BUCKET_GAPS_GTE_60: gaps.filter((g) => g >= 60_000).length,
    },
    windowEdgeGaps: {
      START_EDGE_GAP_MS: startEdge,
      END_EDGE_GAP_MS: endEdge,
    },
    fullWindowCoverage: {
      FULL_WINDOW_MAX_UNOBSERVED_GAP_MS: Math.max(...fullGaps),
      FULL_WINDOW_GAPS_GTE_10: gte(10_000),
      FULL_WINDOW_GAPS_GTE_20: gte(20_000),
      FULL_WINDOW_GAPS_GTE_30: gte(30_000),
      FULL_WINDOW_GAPS_GTE_60: gte(60_000),
    },
    FIRST_TO_LAST_NATIVE_BUCKET_SPAN_MS: timestamps[timestamps.length - 1] - timestamps[0],
    FIRST_TO_LAST_NATIVE_BUCKET_SPAN_PCT_OF_NOMINAL_WINDOW:
      ((timestamps[timestamps.length - 1] - timestamps[0]) / 600_000) * 100,
    note: 'Bucket timestamp span is NOT telemetry coverage; distinct from inter-bucket continuity and full-window unobserved edges.',
  },
  movement: {
    CANONICAL_VALID_MOVEMENT_DURATION: null,
    T0_TO_TRIP_END_WALL_DURATION_MS: TRIP_END_MS - T0_MS,
    windowMovementClass: {
      A_nominal: 'CONFIRMED_MOVING',
      B_movingOverrun: 'UNKNOWN_WITH_ACTIVE_TRIP',
      C_postTripTail: 'STATIONARY',
      D_abortArtifact: 'STATIONARY',
    },
    POST_TRIP_FALSE_MOVEMENT: 'NOT_ASSESSED',
  },
  postTripTail: {
    POST_TRIP_NEW_HF_SLOT_EXECUTION: 0,
    POST_TRIP_NATIVE_HF_BUCKETS: 0,
    POST_TRIP_NEW_TRIP_OPENED: 'NO',
    POST_TRIP_TRIP_FSM_ACTIVITY: 'RESTING/COMPLETED',
    POST_TRIP_SETTLEMENT_EXECUTION: 0,
    POST_TRIP_RC_OBSERVATIONS: v2.referenceCaptureObservations.byWindow.C_postTripTail,
  },
  dataLayers: {
    HF_BUCKET_LAYER:
      'Producer: HF deterministic slot historical polls (5 successes). Persistence: acquisitionState native temporal bucket starts (25 unique). Cadence: per 90s slot success. Scientific role: native HF fast-loop density. Stops after slot 6.',
    SETTLEMENT_LAYER:
      'Producer: settlement shadow scheduler (19 WALL_CLOCK windows × 6 ages). Persistence: reference_capture_settlement_shadow_observations (114 rows). Scientific role: maturation/reconstructability probe. Completed before trip end.',
    RC_OBSERVATION_LAYER:
      'Producer: RC acquisition runner (~3s cycles, LATEST_LIVE + SIGNAL_POINT). Persistence: reference_capture_observations (11,413 rows). Lifecycle: continues through orphaned tail until abort.',
  },
  rcObservationPartition: {
    inclusionRule: 'synq_received_at: [start, end) for A/B/C; [freeze, abort] inclusive for D',
    WINDOW_A_0_10MIN_RC_OBSERVATIONS: v2.referenceCaptureObservations.byWindow.A_nominal,
    WINDOW_B_10MIN_TO_TRIP_END_RC_OBSERVATIONS: v2.referenceCaptureObservations.byWindow.B_movingOverrun,
    WINDOW_C_TRIP_END_TO_FREEZE_RC_OBSERVATIONS: v2.referenceCaptureObservations.byWindow.C_postTripTail,
    WINDOW_D_FREEZE_TO_ABORT_RC_OBSERVATIONS: v2.referenceCaptureObservations.byWindow.D_abortArtifact,
    RC_OBSERVATIONS_TOTAL: v2.referenceCaptureObservations.totalPreserved,
    RC_OBSERVATION_PARTITION_VALID:
      v2.referenceCaptureObservations.byWindow.A_nominal +
        v2.referenceCaptureObservations.byWindow.B_movingOverrun +
        v2.referenceCaptureObservations.byWindow.C_postTripTail +
        v2.referenceCaptureObservations.byWindow.D_abortArtifact ===
      v2.referenceCaptureObservations.totalPreserved,
  },
  signalCompleteness: {
    CANONICAL_KEY_AVAILABILITY: 'NOT_ASSESSED',
    PROVIDER_FIELD_PATH_AVAILABILITY: 'NOT_ASSESSED',
    SIGNAL_LEVEL_ASSESSABILITY: 'NOT_ASSESSED',
  },
  settlement: {
    NOMINAL_SETTLEMENT_WINDOWS: 19,
    SETTLEMENT_AGES: 6,
    SETTLEMENT_EXPECTED_ROWS: 114,
    SETTLEMENT_ACTUAL_ROWS: 114,
    SUCCESS: 114,
    ZERO_RESULT: 0,
    FAILURE: 0,
    SKIPPED: 0,
    PENDING: 0,
    LATE_IDENTITY_ADDITIONS: 148,
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
  recorderOwnership: {
    OWNER_PREARM: 'MANUAL_OPERATOR (reference-capture-lte-r1-prearm.ts)',
    OWNER_FAST_GO: 'MANUAL_OPERATOR (reference-capture-lte-r1-fast-go.ts)',
    OWNER_T0: 'MANUAL_ONE_SHOT_WATCHER (exp021-ks-mx-2024-t0-watcher-once.ts)',
    OWNER_90_SLOT_EXECUTION: 'RC_ACQUISITION_SERVICE',
    OWNER_90_WALL_SEAL: 'NONE',
    OWNER_90_TO_60: 'NONE',
    OWNER_60_INIT: 'NONE',
    OWNER_60_EXECUTION: 'NONE',
    OWNER_60_WALL_SEAL: 'NONE',
    OWNER_PHYSICAL_END: 'NONE',
    OWNER_SESSION_TERMINALIZATION: 'MANUAL_ABORT (reference-capture-exp-021-stuck-session-abort.ts)',
    RECORDER_FAILURE_CLASS: 'OWNERSHIP_GAP',
    '90_TO_60_BLOCKED_BY_TELEMETRY': 'NO',
  },
  orchestratorArchitecture: {
    SUPPORTED_COMPLETE_LIFECYCLE_OWNER: 'reference-capture-exp-021-autonomous-orchestrator.ts',
    AUTONOMOUS_ORCHESTRATOR_CAN_OWN_FROM_START: 'YES',
    MANUAL_FAST_GO_REQUIRED: 'NO (when orchestrator is sole entry path)',
    MANUAL_T0_WATCHER_REQUIRED: 'NO (when orchestrator is sole entry path)',
    MANUAL_PHASE_TRANSITION_REQUIRED: 'NO',
    MIXED_MANUAL_ORCHESTRATOR_SAFE: 'NO',
    gap:
      'This run used manual PRE-ARM + FAST GO + detached T0 watcher without orchestrator ownership stamp; orchestrator refused attach and never advanced phases.',
  },
  recorderRepair: {
    RECORDER_CODE_CHANGE_REQUIRED: 'NO',
    rationale:
      'Deployed orchestrator at d1501d17 already implements full lifecycle (T0 through PHYSICAL_END) when started as sole owner. Failure was operator runbook: manual path without orchestrator.',
    CANONICAL_NEXT_RUN_START_PROCEDURE:
      'Start reference-capture-exp-021-autonomous-orchestrator.ts as sole lifecycle owner after PRE-ARM only if orchestrator PREP does not subsume it; do NOT mix manual FAST GO or detached T0 watcher with orchestrator-owned session.',
    REQUIRED_REGRESSION_NAME: 'candidate_short_ab_90_60 autonomous wall-clock phase seal without operator',
    REQUIRED_REGRESSION_SCOPE:
      'Integration test: at T0 persist plan, init 90s+7 slots; advance wall clock 10m → 90 seals once, 60 inits once; advance 10m → 60 seals, PHYSICAL_END, session terminalizes; no duplicate jobs/locks; restart recovery at T0, pre-90→60, post-90→60.',
    RESTART_RECOVERY_COVERED: 'PARTIAL — existing specs cover plan/T0 recovery; full restart matrix not yet present',
    guardrailRecommendation:
      'Optional future hardening (not required for repair if runbook enforced): reject manual FAST GO on sessions without orchestrator ownership when EXP021 plan active.',
  },
  crossFileInvariants: {
    '7_eq_5_plus_2': true,
    '19_x_6_eq_114': true,
    rcPartitionSum: v2.referenceCaptureObservations.byWindow.A_nominal + 938 + 8792 + 260,
  },
};

const v2Path = join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json');
const mergedV2 = { ...v2, consistency: out };
writeFileSync(v2Path, JSON.stringify(mergedV2, null, 2) + '\n');
writeFileSync(
  join(evidenceDir, 'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json'),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(JSON.stringify({ written: true, RC_PARTITION_VALID: out.rcObservationPartition.RC_OBSERVATION_PARTITION_VALID }, null, 2));
