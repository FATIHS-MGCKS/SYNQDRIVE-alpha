/**
 * LDI-02 — GPS-L3-first multi-signal fusion feasibility (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type FusionEpistemicClass =
  | 'ACCELERATION_OBSERVED'
  | 'DECELERATION_OBSERVED'
  | 'BRAKE_ACTUATION_CONFIRMED'
  | 'NATIVE_BRAKING_EVENT_REPORTED'
  | 'REGEN_CONFIRMED'
  | 'UNKNOWN';

export type FusionMatrixRow = {
  dimension: string;
  gpsL3Qc: string;
  r1Obd: string;
  hf1Hz: string;
  nativeBehavior: string;
  teslaPathA: string;
  ruptelaPathB: string;
  codeOrEvidence: string[];
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function loadRuptelaTransferabilityTrips(repoRoot: string) {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-transferability/PER_TRIP_GAP_EVENTS.json',
  );
  if (!fs.existsSync(p)) return [];
  const rows = readJson<
    Array<{
      tripId: string;
      integrationFamily: string;
      dataCoverage?: {
        shadowIntervalCount?: number;
        positionPresentBuckets?: number;
        positionAbsentBuckets?: number;
        r1ObdNumericBuckets?: number;
        presentFraction?: number;
      };
      gapEvents?: Array<{
        eventId: string;
        windowUtc: { from: string; to: string };
        classification?: string;
      }>;
    }>
  >(p);
  return rows.filter((r) => r.integrationFamily === 'RUPTELA_LTE_R1');
}

export function buildFusionEvidenceMatrix(): FusionMatrixRow[] {
  return [
    {
      dimension: 'Timestamp alignment / clock drift',
      gpsL3Qc: '1s calendar bucket labels; pinned snapshot acquisition window',
      r1Obd: 'INTERVAL_ONLY; R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN (r1-temporal-containment.ts)',
      hf1Hz: 'DIMO query interval 1s — observed spacing variable (CURRENT_STATE.md)',
      nativeBehavior: 'providerTimestamp = DrivingEvent.recordedAt; wallet source metadata',
      teslaPathA: 'POSITION pin only — no R1/native clock cross-check on 186946 pin',
      ruptelaPathB: 'Must align four streams on bucket grid + native event windows',
      codeOrEvidence: [
        'backend/src/modules/vehicle-intelligence/r1-temporal-containment.ts',
        'backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo.ts',
      ],
    },
    {
      dimension: 'Sampling cadence',
      gpsL3Qc: '~1 label/s when POSITION PRESENT',
      r1Obd: 'Sparse vs trip length (e.g. 109/1090 numeric OBD buckets on f502a4a0)',
      hf1Hz: 'Requested 1 Hz; not guaranteed',
      nativeBehavior: 'Event-based (sparse)',
      teslaPathA: 'L3 trusted numeric 775/1136 on dev pin',
      ruptelaPathB: 'Cannot treat HF as full-trip coverage when OBD buckets << shadow count',
      codeOrEvidence: [
        'architecture/.../PER_TRIP_GAP_EVENTS.json trip f502a4a0',
        'architecture/drivingintelligence/CURRENT_STATE.md § cadence',
      ],
    },
    {
      dimension: 'GPS/OBD speed agreement',
      gpsL3Qc: 'Primary L3 estimate',
      r1Obd: 'Corroboration band max(5 km/h, 10% L3)',
      hf1Hz: 'HF speedKmh separate channel',
      nativeBehavior: 'No speed in native event payload (classification only)',
      teslaPathA: 'N/A — R1 channel NOT_APPLICABLE on frozen pin',
      ruptelaPathB: 'QC sets r1CorroboratesL3; conflict → UNTRUSTED or CONFLICTING relation',
      codeOrEvidence: [
        'backend/.../speed-qc/evaluate-di-v0-speed-qc-interval.ts',
        'backend/.../core/claims/cross-source-relation.ts',
      ],
    },
    {
      dimension: 'HF vs L3 acceleration agreement',
      gpsL3Qc: 'Leg-implied m/s from ±1s positions + QC accel cap',
      r1Obd: 'Not direct accel — derived from speed deltas in HF path only',
      hf1Hz: 'hf-acceleration.ts / hf-braking.ts on clean HF segments',
      nativeBehavior: 'Independent severity class — no m/s² ground truth',
      teslaPathA: 'HF schema exists; not in EXP021 S4 pin — prove before use',
      ruptelaPathB: 'Dedupe: HF kinematic events vs native harsh* in ±2s window (design)',
      codeOrEvidence: ['backend/src/modules/vehicle-intelligence/trips/hf-acceleration.ts'],
    },
    {
      dimension: 'Native event temporal overlap',
      gpsL3Qc: 'No native channel on Tesla pin',
      r1Obd: 'Orthogonal',
      hf1Hz: 'May coincide — risk double count',
      nativeBehavior: 'Max claim L1 UNCALIBRATED (native-event-evidence)',
      teslaPathA: 'DISABLED in channel manifest',
      ruptelaPathB: 'Classify as NATIVE_BRAKING_EVENT_REPORTED not BRAKE_ACTUATION_CONFIRMED',
      codeOrEvidence: [
        'backend/.../native-event-evidence/di-v0-native-event-evidence.types.ts',
        'backend/src/modules/dimo/queries/driving-events.query.ts',
      ],
    },
    {
      dimension: 'Missing signal behavior',
      gpsL3Qc: 'ROW_ABSENT → abstention; no interpolation',
      r1Obd: 'ROW_ABSENT / SIGNAL_NULL per S3B',
      hf1Hz: 'INSUFFICIENT_POINTS skip in enrichment',
      nativeBehavior: 'Empty read ≠ proof of no event',
      teslaPathA: '269 ROW_ABSENT on Tesla pin',
      ruptelaPathB: '24deb8af ~52% present — fusion must degrade to UNKNOWN',
      codeOrEvidence: ['EXP021 P22E baseline', 'PER_TRIP_GAP_EVENTS.json 24deb8af'],
    },
    {
      dimension: 'Regeneration',
      gpsL3Qc: 'DECELERATION_OBSERVED only',
      r1Obd: 'No regen field in R1 OBD V0_3',
      hf1Hz: 'tractionBatteryPowerKw + hf-recuperation integration',
      nativeBehavior: 'Not regen-specific',
      teslaPathA: 'Not in frozen pin',
      ruptelaPathB: 'REGEN_CONFIRMED only with HF power series + speed gate',
      codeOrEvidence: ['backend/src/modules/vehicle-intelligence/trips/hf-recuperation.ts'],
    },
  ];
}

export function buildTemporalExamples(repoRoot: string) {
  const ruptela = loadRuptelaTransferabilityTrips(repoRoot);
  const f502 = ruptela.find((t) => t.tripId.startsWith('f502a4a0'));
  const deb = ruptela.find((t) => t.tripId.startsWith('24deb8af'));

  return {
    syntheticQcIllustration: {
      note: 'From unit-test contract (not a production trip export)',
      centerBucket: '2030-01-01T00:05:00Z',
      l3SpeedKmh: 80,
      r1SpeedKmh: 80,
      expected: 'r1CorroboratesL3=true → elevated leg speed cap (evaluate-di-v0-speed-qc-interval)',
      epistemicClass: 'ACCELERATION_OBSERVED or DECELERATION_OBSERVED only after contiguous trusted L3',
    },
    ruptelaTripF502a4a0: {
      tripId: f502?.tripId,
      presentFraction: f502?.dataCoverage?.presentFraction,
      shadowIntervals: f502?.dataCoverage?.shadowIntervalCount,
      r1ObdNumericBuckets: f502?.dataCoverage?.r1ObdNumericBuckets,
      cadenceNote: 'OBD numeric ~10% of shadow seconds — HF-only or native-only views are incomplete',
      exampleGap: f502?.gapEvents?.[0],
      fusionRead: 'UNKNOWN during 4s POSITION gap; native/HF must not fill without pinned samples',
    },
    ruptelaTrip24deb8af: {
      tripId: deb?.tripId,
      presentFraction: deb?.dataCoverage?.presentFraction,
      positionAbsent: deb?.dataCoverage?.positionAbsentBuckets,
      fusionRead: 'GPS-L3 primary but frequently absent — dynamic priority must fall back to UNKNOWN not HF guess',
      exampleGaps: (deb?.gapEvents ?? []).slice(0, 2),
    },
    teslaPathA186946: {
      tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
      channels: 'POSITION only; NATIVE_EVENT off; R1 N/A',
      exampleDecelWindow: { from: '2026-10-16T03:41:42Z', to: '2026-10-16T03:41:47Z', class: 'DECELERATION_OBSERVED from video tacho only (dev)' },
      regen: 'UNKNOWN — no HF power in pin',
    },
  };
}

export function buildLdi02FusionCompletionLines(): string[] {
  return [
    'RUPTELA_FUSION_FEASIBLE=CONDITIONAL_OFFLINE_ARCHITECTURE_READY_PINNED_MULTI_STREAM_EXPORT_REQUIRED',
    'GPS_L3_PRIMARY_REFERENCE=YES_design_default_not_absolute_when_higher_res_proven',
    'OBD_SPEED_OVERLAP=PARTIAL_r1Corroborates_when_sparse_buckets_align_calendar_center',
    'HF_L3_TEMPORAL_ALIGNMENT=PARTIAL_1s_calendar_grid_R1_OBD_often_sparse_vs_shadow_count',
    'NATIVE_EVENT_CORRELATION=NOT_PINNED_IN_REPO_requires_trip_level_DrivingEvent_plus_L3_replay',
    'SIGNAL_CONFLICTS=DOCUMENTED_r1Disagrees_CONFLICT_EXPLAINED_R1_temporal_containment',
    'FUSION_COVERAGE_POTENTIAL=HIGH_when_POSITION_present_LOW_when_ROW_ABSENT_or_OBD_sparse',
    'UNVERIFIED_ASSUMPTIONS=HF_1Hz_cadence;native_event_physics;regen_without_power_series',
    'NEXT_SAFE_ACTION=Pin_one_Ruptela_trip_S4_combined_snapshot_then_offline_overlap_table_no_threshold_tuning',
  ];
}
