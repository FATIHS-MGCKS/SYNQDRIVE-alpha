/**
 * LDI-01 — Longitudinal Driving Intelligence discovery (read-only, offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';

export const LDI01_SCHEMA = 'LDI01_LONGITUDINAL_DISCOVERY_V1';
export const TESLA_TOKEN_186946 = 186946;
export const TESLA_REF_TRIP = '358d0158-b2a9-47ed-af26-33926c5770b4';

export type SignalStatus =
  | 'SCHEMA_DECLARED'
  | 'OBSERVED_IN_RAW_PAYLOAD'
  | 'NORMALIZED_AND_PERSISTED'
  | 'AVAILABLE_IN_FROZEN_EVIDENCE'
  | 'NOT_VERIFIED'
  | 'UNSUPPORTED';

export type SignalRow = {
  signal: string;
  teslaToken186946: SignalStatus;
  ruptelaR1: SignalStatus;
  notes: string;
  codePaths: string[];
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function buildSignalCapabilityMatrix(repoRoot: string): {
  schema: string;
  generatedAtUtc: string;
  sources: string[];
  teslaFrozenExp021Pin: {
    tripId: string;
    s4Channels: unknown;
    note: string;
  };
  signals: SignalRow[];
} {
  const manifestPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json',
  );
  const manifest = fs.existsSync(manifestPath)
    ? readJson<{ identities: { tripId: string }; forensicReplay: { channelManifest: unknown } }>(manifestPath)
    : null;

  const signals: SignalRow[] = [
    {
      signal: 'timestamped_gps_position',
      teslaToken186946: 'AVAILABLE_IN_FROZEN_EVIDENCE',
      ruptelaR1: 'NORMALIZED_AND_PERSISTED',
      notes: 'Tesla EXP021 pin: POSITION snapshot V0_1 only. R1: S3A DIMO currentLocationCoordinates 1s AVG.',
      codePaths: [
        'backend/src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/',
        'architecture/.../pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json channelManifest POSITION',
      ],
    },
    {
      signal: 'gps_speed_kmh',
      teslaToken186946: 'AVAILABLE_IN_FROZEN_EVIDENCE',
      ruptelaR1: 'NORMALIZED_AND_PERSISTED',
      notes: 'Tesla: L3 haversine leg speed from pinned positions (775 trusted / 1136). R1: HF speed + OBD speed field.',
      codePaths: [
        'backend/src/modules/vehicle-intelligence/driving-intelligence/core/',
        'backend/src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/',
        'backend/src/modules/vehicle-intelligence/trips/hf-preprocessing.ts',
      ],
    },
    {
      signal: 'wheel_speed',
      teslaToken186946: 'UNSUPPORTED',
      ruptelaR1: 'NOT_VERIFIED',
      notes: 'No wheel-speed channel in DI V0 S4 pin or R1 five-field OBD query.',
      codePaths: ['backend/src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/'],
    },
    {
      signal: 'longitudinal_acceleration',
      teslaToken186946: 'NOT_VERIFIED',
      ruptelaR1: 'NOT_VERIFIED',
      notes: 'Not a direct DIMO field in pin; derived in production HF detectors from speed deltas.',
      codePaths: [
        'backend/src/modules/vehicle-intelligence/trips/hf-acceleration.ts',
        'backend/src/modules/vehicle-intelligence/driving-intelligence/core/',
      ],
    },
    {
      signal: 'brake_pedal_or_switch',
      teslaToken186946: 'UNSUPPORTED',
      ruptelaR1: 'UNSUPPORTED',
      notes: 'Not in R1 OBD V0_3 allowlist; no friction-brake observation in DI V0 pin.',
      codePaths: ['architecture/drivingintelligence/CURRENT_STATE.md § R1 OBD evidence'],
    },
    {
      signal: 'accelerator_pedal',
      teslaToken186946: 'UNSUPPORTED',
      ruptelaR1: 'OBSERVED_IN_RAW_PAYLOAD',
      notes: 'R1: throttle percent in HF/OBD subset. Tesla software pin: no R1_OBD channel.',
      codePaths: ['backend/src/modules/dimo/dimo-segments.service.ts HighFrequencyReading.throttlePosition'],
    },
    {
      signal: 'gear_drive_state',
      teslaToken186946: 'SCHEMA_DECLARED',
      ruptelaR1: 'NOT_VERIFIED',
      notes: 'HF fetch declares powertrainTransmissionCurrentGear; removed from R1 OBD AVG query (C1D.9).',
      codePaths: ['backend/src/modules/dimo/dimo-segments.service.ts', 'architecture/drivingintelligence/CURRENT_STATE.md'],
    },
    {
      signal: 'hv_battery_power_kw',
      teslaToken186946: 'SCHEMA_DECLARED',
      ruptelaR1: 'SCHEMA_DECLARED',
      notes: 'HF post-trip query maps powertrainTractionBatteryCurrentPower W→kW; not in frozen EXP021 S4 snapshot.',
      codePaths: [
        'backend/src/modules/dimo/dimo-segments.service.ts',
        'backend/src/modules/vehicle-intelligence/trips/hf-recuperation.ts',
      ],
    },
    {
      signal: 'charging_discharging_power',
      teslaToken186946: 'SCHEMA_DECLARED',
      ruptelaR1: 'SCHEMA_DECLARED',
      notes: 'DIMO battery mapper includes chargingPowerKw; separate from traction power sign convention.',
      codePaths: ['backend/src/modules/dimo/mappers/dimo-battery-signal.mapper.ts'],
    },
    {
      signal: 'regenerative_power',
      teslaToken186946: 'NOT_VERIFIED',
      ruptelaR1: 'NOT_VERIFIED',
      notes: 'Inferred from positive tractionBatteryPowerKw while moving in hf-recuperation — not pinned in EXP021 evidence.',
      codePaths: ['backend/src/modules/vehicle-intelligence/trips/hf-recuperation.ts'],
    },
    {
      signal: 'energy_recovered_kwh',
      teslaToken186946: 'NOT_VERIFIED',
      ruptelaR1: 'NOT_VERIFIED',
      notes: 'Trip-level integration in trip-behavior-enrichment; requires HF samples not in frozen DI pin.',
      codePaths: ['backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts'],
    },
    {
      signal: 'battery_soc_percent',
      teslaToken186946: 'SCHEMA_DECLARED',
      ruptelaR1: 'SCHEMA_DECLARED',
      notes: 'HF socPct field; EED recharge/refuel is separate pipeline (not regen proof).',
      codePaths: [
        'backend/src/modules/dimo/dimo-segments.service.ts',
        'backend/src/modules/vehicle-intelligence/energy-events/',
      ],
    },
    {
      signal: 'native_harsh_accel_brake_events',
      teslaToken186946: 'UNSUPPORTED',
      ruptelaR1: 'NORMALIZED_AND_PERSISTED',
      notes: 'behavior.harsh* DIMO events ingested for LTE_R1 only; Tesla API_SYNTHETIC pin has NATIVE_EVENT DISABLED.',
      codePaths: [
        'backend/src/modules/dimo/queries/driving-events.query.ts',
        'backend/src/modules/vehicle-intelligence/trips/lte-r1-behavior-enrichment.service.ts',
      ],
    },
  ];

  return {
    schema: 'LDI01_SIGNAL_CAPABILITY_MATRIX_V1',
    generatedAtUtc: new Date().toISOString(),
    sources: [
      'Code inspection (read-only)',
      'EXP021 pre-deploy manifest (frozen Tesla trip)',
      'architecture/drivingintelligence/CURRENT_STATE.md',
      'No live provider queries in LDI-01',
    ],
    teslaFrozenExp021Pin: {
      tripId: manifest?.identities.tripId ?? TESLA_REF_TRIP,
      s4Channels: manifest?.forensicReplay.channelManifest ?? null,
      note: 'R1_OBD NOT_APPLICABLE; NATIVE_EVENT FLAG_OFF; POSITION PRESENT only.',
    },
    signals,
  };
}

export function analyzeVideoLongitudinalWindows(repoRoot: string) {
  const comparisonPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json',
  );
  const rows = readJson<Array<{ bucketLabelUtc?: string; tachoKmh?: number | null }>>(comparisonPath)
    .filter((r) => r.bucketLabelUtc && r.tachoKmh != null)
    .sort((a, b) => String(a.bucketLabelUtc).localeCompare(String(b.bucketLabelUtc)));

  const strongAccel: Array<{ fromUtc: string; toUtc: string; deltaKmh: number }> = [];
  const strongDecel: Array<{ fromUtc: string; toUtc: string; deltaKmh: number }> = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const d = (cur.tachoKmh as number) - (prev.tachoKmh as number);
    if (d >= 3) {
      strongAccel.push({
        fromUtc: prev.bucketLabelUtc!,
        toUtc: cur.bucketLabelUtc!,
        deltaKmh: d,
      });
    }
    if (d <= -3) {
      strongDecel.push({
        fromUtc: prev.bucketLabelUtc!,
        toUtc: cur.bucketLabelUtc!,
        deltaKmh: d,
      });
    }
  }

  const namedDevWindows = [
    {
      id: 'DEV_DECEL_BERICHT',
      fromUtc: '2026-10-16T03:41:42Z',
      toUtc: '2026-10-16T03:41:47Z',
      source: 'Bericht.md / P22A inventory',
      independentFromDetector: true,
    },
    {
      id: 'DEV_POST_GAP_ACCEL',
      fromUtc: '2026-10-16T03:44:36Z',
      toUtc: '2026-10-16T03:44:41Z',
      source: 'P22A_VIDEO_EVIDENCE_INVENTORY.md',
      independentFromDetector: true,
    },
  ];

  return {
    labeledSeconds: rows.length,
    coarseAccelTransitionsGte3Kmh: strongAccel.length,
    coarseDecelTransitionsLteNeg3Kmh: strongDecel.length,
    namedDevelopmentWindows: namedDevWindows,
    sampleStrongAccel: strongAccel.slice(0, 8),
    sampleStrongDecel: strongDecel.slice(0, 8),
    regenFromSpeedOnly: 'EXPLICITLY_REJECTED — no regen labels from tacho delta alone',
  };
}

export function buildLdi01Payload(repoRoot: string, headSha: string) {
  const freeze = buildFreezeManifest(repoRoot);
  const matrix = buildSignalCapabilityMatrix(repoRoot);
  const video = analyzeVideoLongitudinalWindows(repoRoot);

  return {
    schema: LDI01_SCHEMA,
    headSha,
    separationFromExp021: 'LDI-01 does not modify EXP021 v0_2 halt prototype or RD003 audits',
    v0_2HaltHashUnchanged: freeze.parameterSnapshotHash,
    matrix,
    videoLongitudinal: video,
    baselineInvariantsFromExp021: {
      trustedNumeric: '775/1136',
      realNumericRecovery: 0,
      rowAbsent: 269,
      slowRollGeometrySeconds: 52,
    },
    feasibility: {
      accelOfflineFromL3Qc: 'PARTIAL — trusted numeric segments only; gaps/abstention block interpolation',
      brakingOfflineFromL3Qc: 'PARTIAL — same; driving-impact-braking-provenance documents measured vs proxy end speeds',
      regenConfirmation: 'NOT_FROM_FROZEN_PIN — needs HF traction power time series at trip enrichment',
    },
    productionMutations: 'NONE',
    providerCalls: 'NONE',
  };
}

export function buildLdi01CompletionLines(p: ReturnType<typeof buildLdi01Payload>): string[] {
  return [
    'LDI01_RESULT=DISCOVERY_COMPLETE_OFFLINE',
    'EXISTING_ACCEL_LOGIC=YES_production_hf-acceleration.ts+TripBehaviorEvent;DI_V0_L3_shadow_library',
    'EXISTING_BRAKING_LOGIC=YES_hf-braking.ts+DrivingEvent_HARSH_EXTREME+brake-health_harsh_multipliers',
    'TESLA_ACCEL_DATA_AVAILABLE=PARTIAL_GPS_L3_in_frozen_POSITION_pin_only',
    'TESLA_BRAKE_DATA_AVAILABLE=UNSUPPORTED_no_pedal_no_R1_in_pin',
    'TESLA_REGEN_SIGNAL_AVAILABLE=SCHEMA_IN_HF_FETCH_NOT_IN_FROZEN_EXP021_EVIDENCE',
    'RUPTELA_CAPABILITIES=HF_1s_OBD_5fields+native_behavior_events+LTE_R1_path',
    `VIDEO_ACCEL_WINDOWS=${p.videoLongitudinal.coarseAccelTransitionsGte3Kmh}_coarse_1s_tacho_transitions_plus_named_dev_windows`,
    `VIDEO_DECEL_WINDOWS=${p.videoLongitudinal.coarseDecelTransitionsLteNeg3Kmh}_coarse_1s_tacho_transitions`,
    'ACCEL_DETECTION_FEASIBLE=PARTIAL_offline_trusted_L3_only_production_HF_separate_path',
    'BRAKING_DETECTION_FEASIBLE=PARTIAL_same_constraints_no_new_harsh_thresholds',
    'REGEN_CONFIRMATION_FEASIBLE=RESEARCH_requires_HF_power_sign_sync_not_SOC_or_GPS_decel_alone',
    'SIGNAL_GAPS=wheel_speed;brake_pedal;tesla_native_harsh_events;regen_in_frozen_pin',
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=LDI-02 scoped HF power+speed export on new independent capture OR read-only R1 trip audit without threshold tuning',
  ];
}
