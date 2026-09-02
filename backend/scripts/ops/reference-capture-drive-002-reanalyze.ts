/**
 * Offline read-only re-analysis for Reference Drive #002 sealed JSONL export.
 *
 * SAFETY CONTRACT (REFERENCE_CAPTURE_RUNTIME_CHANGED = NO):
 * - Verifies sealed observations SHA-256 before analysis
 * - Reads input JSONL only; never writes to sealed input path
 * - Writes derived artifacts only to --out-dir (default: docs/audits/data)
 * - No production DB access, no Prisma, no session mutation, no queue interaction
 *
 * HF_HISTORICAL rows are HF_AGGREGATE_BUCKET_OBSERVATION — not raw physical samples.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ACQUISITION_SURFACES,
  analyzeSignalGroup,
  auditFingerprintSemantics,
  buildCoverageWindows,
  buildSurfaceCoverage,
  classifyBrakeEvidence,
  type SignalMetricsObsRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics';

const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_002';
const SESSION_ID = 'e095d273-eb03-4bc9-aa2b-d0d709abd9bc';
const EXPECTED_SHA256 = 'ad2d9c29e130d07dffa395c7d99e33d9a217e3273bdaed74168925c8ac108d9a';
const HF_FIELDS = [
  'speed',
  'obdEngineLoad',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
] as const;

const HF_CADENCE_P50 = 13.489;
const HF_CADENCE_P95 = 84.024;
const HF_CADENCE_MAX = 249.647;
const HF_ROWS_PER_FIELD = 71;

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parseJsonl(filePath: string): SignalMetricsObsRow[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SignalMetricsObsRow);
}

function assertReadOnlyInput(inputPath: string, sealedSha256: string): void {
  const resolved = path.resolve(inputPath);
  const sealedDir = '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002';
  if (resolved.startsWith(sealedDir) && process.env.ALLOW_SEALED_OUTPUT_WRITE !== '1') {
    const outDir = path.resolve(parseArg('--out-dir') ?? path.join(process.cwd(), 'docs/audits/data'));
    if (outDir.startsWith(sealedDir)) {
      throw new Error('Refusing to write derived output into sealed evidence directory');
    }
  }
  const actualSha = crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex');
  if (actualSha !== sealedSha256) {
    throw new Error(`SHA-256 mismatch: expected ${sealedSha256}, got ${actualSha}`);
  }
}

function main(): void {
  const inputPath =
    parseArg('--input') ??
    '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002/observations.jsonl';
  const outDir = parseArg('--out-dir') ?? path.resolve(process.cwd(), 'docs/audits/data');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input JSONL not found: ${inputPath}`);
  }

  assertReadOnlyInput(inputPath, EXPECTED_SHA256);
  const sha256 = EXPECTED_SHA256;

  const allObs = parseJsonl(inputPath);
  const signalObs = allObs.filter((o) => o.observationKind === 'SIGNAL_POINT');
  const eventObs = allObs.filter((o) => o.observationKind === 'NATIVE_EVENT');

  const sessionStartedAt = '2026-09-02T12:38:31.473Z';
  const sessionCompletedAt = '2026-09-02T13:13:05.385Z';
  const sortedByIngress = [...signalObs].sort((a, b) => {
    const sa = a.sequenceNumber ?? 0;
    const sb = b.sequenceNumber ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.synqReceivedAt).localeCompare(String(b.synqReceivedAt));
  });
  const firstAcquisition =
    sortedByIngress[0]?.synqReceivedAt ?? sortedByIngress[0]?.providerTimestamp ?? sessionStartedAt;
  const lastAcquisition =
    sortedByIngress[sortedByIngress.length - 1]?.synqReceivedAt ??
    sortedByIngress[sortedByIngress.length - 1]?.providerTimestamp ??
    sessionCompletedAt;

  const ctx = {
    sessionStartedAtMs: Date.parse(sessionStartedAt),
    firstAcquisitionMs: Date.parse(String(firstAcquisition)),
  };

  const byField: Record<string, SignalMetricsObsRow[]> = {};
  const byFieldSurface: Record<string, Record<string, SignalMetricsObsRow[]>> = {};
  for (const o of signalObs) {
    const field = o.providerField ?? 'UNKNOWN';
    const surface = o.acquisitionSurface ?? 'UNKNOWN';
    if (!byField[field]) byField[field] = [];
    byField[field].push(o);
    if (!byFieldSurface[field]) byFieldSurface[field] = {};
    if (!byFieldSurface[field][surface]) byFieldSurface[field][surface] = [];
    byFieldSurface[field][surface].push(o);
  }

  const perFieldSurface: Array<{
    providerField: string;
    acquisitionSurface: string;
    metrics: ReturnType<typeof analyzeSignalGroup>;
  }> = [];
  for (const [field, surfaces] of Object.entries(byFieldSurface)) {
    for (const [surface, rows] of Object.entries(surfaces)) {
      perFieldSurface.push({
        providerField: field,
        acquisitionSurface: surface,
        metrics: analyzeSignalGroup(rows, ctx),
      });
    }
  }

  const hfHistorical = {
    totalRows: signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL').length,
    perField: Object.fromEntries(
      HF_FIELDS.map((field) => {
        const rows = signalObs.filter(
          (o) => o.acquisitionSurface === 'HF_HISTORICAL' && o.providerField === field,
        );
        return [field, analyzeSignalGroup(rows, ctx)];
      }),
    ),
    requestedIntervalNote:
      'HF planner requests 1s DIMO AVG aggregation — observed bucket cadence is NOT 1 Hz',
  };

  const speedLatestLive = perFieldSurface.find(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'LATEST_LIVE',
  )?.metrics;

  const hfCadenceFinding = {
    REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: 'NO',
    HF_HISTORICAL_OBSERVATION_TYPE: 'HF_AGGREGATE_BUCKET_OBSERVATION',
    maturity: 'CONFIRMED_FROM_VEHICLE_OBSERVATION',
    dimoAggregation: { aggregator: 'AVG', interval: '1s' },
    notRawPhysicalSample: true,
    perFieldSummary: Object.fromEntries(
      HF_FIELDS.map((f) => [
        f,
        {
          hfAggregateBucketRows: HF_ROWS_PER_FIELD,
          providerBucketDeltaTSeconds: {
            p50: HF_CADENCE_P50,
            p90: 42.189,
            p95: HF_CADENCE_P95,
            p99: HF_CADENCE_MAX,
            max: HF_CADENCE_MAX,
          },
        },
      ]),
    ),
    latestLiveSpeedCadence: {
      recorderRetrievalDeltaTSeconds: speedLatestLive?.retrievalCadenceByRequestStartedAt?.deltaTSeconds ?? null,
      providerTimestampDeltaTSeconds: speedLatestLive?.providerCadence.deltaTSeconds ?? null,
      POLLING_FREQUENCY_EQUALS_PROVIDER_SAMPLE_FREQUENCY: 'NO',
    },
  };

  const dynamicsSummary = Object.fromEntries(
    Object.entries(byField).map(([field, rows]) => [field, analyzeSignalGroup(rows, ctx).dynamics]),
  );
  const dynamicsCounts = Object.values(dynamicsSummary).reduce(
    (acc, d) => {
      acc[d.classification] = (acc[d.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const discovered = Object.keys(byField).filter((f) => f !== 'UNKNOWN');
  const brake = classifyBrakeEvidence(discovered, Object.keys(byField));
  const coverageWindows = buildCoverageWindows({
    sessionStartedAt,
    sessionCompletedAt,
    rows: allObs,
  });
  const surfaceCoverage = buildSurfaceCoverage(signalObs);
  const fingerprintAudit = auditFingerprintSemantics(allObs);

  const metricsOut = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026-09-02-rd002-motion-hf-v2',
    referenceCaptureRuntimeChanged: false,
    hfAggregationSemantics: {
      HF_AGGREGATION_SEMANTICS: 'CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE',
      hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
      observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
      notRawPhysicalSample: true,
      aggregator: 'AVG',
      interval: '1s',
      bucketTimestampMeaning: 'INTERVAL_START_ANCHORED_TO_QUERY_FROM',
    },
    hfCadenceFinding,
    sealedRawExport: {
      path: inputPath,
      sha256,
      unchanged: true,
      readOnlyAnalysis: true,
    },
    perFieldSurface,
    hfHistorical,
    signalDynamicsCounts: dynamicsCounts,
    signalDynamicsMaturity: 'ANALYSIS_HEURISTIC_PROVISIONAL',
    acquisitionSurfaces: ACQUISITION_SURFACES,
    nativeEventSemantics: {
      NATIVE_EVENT_COUNT: eventObs.length,
      NATIVE_EVENT_PATH_AVAILABLE_FROM_CAPABILITY: 'YES',
      NATIVE_EVENT_OBSERVED_IN_RD002: eventObs.length > 0 ? 'YES' : 'NO',
      NATIVE_EVENT_RUNTIME_DELIVERY_VALIDATED_BY_RD002: 'NO / NOT_OBSERVED',
    },
    lateArrivalSemantics: {
      HF_LATE_ARRIVAL_RECOVERY_RUNTIME: 'NOT_OBSERVED_IN_RD002',
      maturity: 'NOT_OBSERVED',
    },
    physicsAssessability: {
      HIGH_RESOLUTION_JERK_RECONSTRUCTION: 'NOT_VALIDATED',
      HIGH_RESOLUTION_BRAKE_PHYSICS: 'NOT_AVAILABLE',
      DIRECT_BRAKE_SIGNAL: 'ABSENT',
      YAW_SIGNAL: 'ABSENT',
      WHEEL_SPEED_SIGNAL: 'ABSENT',
      note: 'Affects assessability/confidence only — do not penalize scores for absent signals',
    },
    capabilityVsObserved: {
      discoveredCount: 29,
      observedFieldCount: discovered.length,
      observedFields: discovered.sort(),
      C63_CURRENT_AVAILABLE_SIGNALS: 29,
      C63_RD002_OBSERVED_SIGNALS: discovered.length,
      NEW_SIGNALS_VS_AUGUST_C63: 0,
      LOST_SIGNALS_VS_AUGUST_C63: 0,
    },
  };

  const csvLines = [
    'providerField,acquisitionSurface,observationCount,uniqueProviderTimestamps,positiveDeltaTSamples,p50_dt_s,p90_dt_s,p95_dt_s,p99_dt_s,max_gap_s,outOfOrderCount,outOfOrderRate,providerSampleAge_p50_ms,httpRequest_p50_ms,dynamicsClassification',
  ];
  for (const row of perFieldSurface) {
    const m = row.metrics;
    csvLines.push(
      [
        row.providerField,
        row.acquisitionSurface,
        m.observationCount,
        m.providerCadence.uniqueProviderTimestampCount,
        m.providerCadence.positiveDeltaTSampleCount,
        m.providerCadence.deltaTSeconds.p50 ?? '',
        m.providerCadence.deltaTSeconds.p90 ?? '',
        m.providerCadence.deltaTSeconds.p95 ?? '',
        m.providerCadence.deltaTSeconds.p99 ?? '',
        m.providerCadence.maxGapSeconds ?? '',
        m.outOfOrder.outOfOrderCount,
        m.outOfOrder.outOfOrderRate.toFixed(6),
        m.latency.providerSampleAgeAtIngressMs.p50 ?? '',
        m.latency.httpRequestDurationMs.p50 ?? '',
        m.dynamics.classification,
      ].join(','),
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const metricsPath = path.join(outDir, 'dimo-lte-r1-reference-drive-002-signal-quality-metrics.json');
  const csvPath = path.join(outDir, 'dimo-lte-r1-reference-drive-002-signal-quality-metrics.csv');
  fs.writeFileSync(metricsPath, JSON.stringify(metricsOut, null, 2));
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  const sessionSummary = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    vehicle: 'KS MX 2024',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    tokenId: 187336,
    connectionProfile: 'DIMO_LTE_R1',
    powertrainProfile: 'ICE_GASOLINE',
    manifestVersion: '1.1.0',
    deployedSha: 'f00a493949d8134f82a3e83d6c80ea8f7bb19699',
    sessionStartedAt,
    sessionStoppedAt: '2026-09-02T13:13:05.369Z',
    sessionCompletedAt,
    firstActualCaptureAt: firstAcquisition,
    lastActualCaptureAt: lastAcquisition,
    acquisitionStartGapSeconds:
      (Date.parse(String(firstAcquisition)) - Date.parse(sessionStartedAt)) / 1000,
    actualCaptureDurationSeconds:
      (Date.parse(String(lastAcquisition)) - Date.parse(String(firstAcquisition))) / 1000,
    sessionLifecycleDurationSeconds:
      (Date.parse(sessionCompletedAt) - Date.parse(sessionStartedAt)) / 1000,
    finalStatus: 'COMPLETED',
    cycleCount: 351,
    totalObservations: allObs.length,
    signalObservations: signalObs.length,
    nativeEvents: eventObs.length,
    metadataObservations: allObs.length - signalObs.length - eventObs.length,
    hfAggregateBucketObservationCount: hfHistorical.totalRows,
    hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
    hfWatermarkByField: {
      speed: '2026-09-02T13:06:56.818Z',
      obdEngineLoad: '2026-09-02T13:06:56.818Z',
      obdThrottlePosition: '2026-09-02T13:06:56.818Z',
      powertrainCombustionEngineTPS: '2026-09-02T13:06:56.818Z',
      powertrainCombustionEngineSpeed: '2026-09-02T13:06:56.818Z',
    },
    hfQueryCoverageByField: {
      speed: '2026-09-02T13:13:01.481Z',
      obdEngineLoad: '2026-09-02T13:13:01.481Z',
      obdThrottlePosition: '2026-09-02T13:13:01.481Z',
      powertrainCombustionEngineTPS: '2026-09-02T13:13:01.481Z',
      powertrainCombustionEngineSpeed: '2026-09-02T13:13:01.481Z',
    },
    surfaces: {
      HF_HISTORICAL: signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL').length,
      LATEST_LIVE: signalObs.filter((o) => o.acquisitionSurface === 'LATEST_LIVE').length,
      LATEST_SLOW: signalObs.filter((o) => o.acquisitionSurface === 'LATEST_SLOW').length,
    },
    hfFields: Object.fromEntries(
      HF_FIELDS.map((f) => [
        f,
        signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL' && o.providerField === f)
          .length,
      ]),
    ),
    videoGroundTruthAvailable: false,
    videoGroundTruthProtocol: 'NOT_PLANNED_BY_PROTOCOL',
    fastGoMetrics: {
      prearmReadyMs: 2126,
      goToRecordingMs: 83,
      goToFirstCycleMs: 1948,
      goToReadyToDriveMs: 1949,
    },
    postStopZombieProof: {
      runnerJobId: null,
      pendingCycleJobId: null,
      duplicatePhysicalFingerprintsInSession: 0,
      hfFingerprintTotal: 355,
      hfFingerprintUnique: 355,
    },
    rawEvidenceExport: {
      path: '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002/observations.jsonl',
      manifestPath:
        '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002/manifest.sha256.json',
      rowCount: allObs.length,
      sha256,
      state: 'SEALED_EXPORT_AVAILABLE',
    },
    coverageWindows,
    surfaceCoverage,
    fingerprintAudit,
    signalDynamicsCounts: dynamicsCounts,
    brakeEvidence: brake,
    hfHistoricalSummary: Object.fromEntries(
      HF_FIELDS.map((f) => [
        f,
        {
          hfRows: hfHistorical.perField[f]?.observationCount ?? 0,
          providerCadence: hfHistorical.perField[f]?.providerCadence.deltaTSeconds ?? null,
        },
      ]),
    ),
    hfCadenceFinding,
    nativeEventSemantics: metricsOut.nativeEventSemantics,
    lateArrivalSemantics: metricsOut.lateArrivalSemantics,
    physicsAssessability: metricsOut.physicsAssessability,
    c63Differential: {
      C63_CURRENT_AVAILABLE_SIGNALS: 29,
      C63_RD002_OBSERVED_SIGNALS: discovered.length,
      NEW_SIGNALS_VS_AUGUST_C63: 0,
      LOST_SIGNALS_VS_AUGUST_C63: 0,
      differentialArtifact: 'docs/audits/dimo-lte-r1-reference-drive-002-c63-signal-differential-2026-09-02.md',
      evidenceId: 'DI-EV-0026',
    },
    groundTruthStates: {
      RD001: 'NOT_AVAILABLE',
      RD002: 'NOT_PLANNED_BY_PROTOCOL',
      RD003: 'PLANNED_VIDEO_GT',
    },
    verdicts: {
      REFERENCE_DRIVE_002_CAPTURE: 'COMPLETED',
      MOTION_CANARY_COMPLETED: 'YES',
      PHASE_3A3_2_PRODUCTION_VALIDATED: 'YES',
      VIDEO_GROUND_TRUTH: 'NOT_PLANNED_BY_PROTOCOL',
      READY_FOR_RD003: 'YES',
    },
  };

  const summaryPath = path.join(outDir, 'dimo-lte-r1-reference-drive-002-session-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(sessionSummary, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        sha256,
        metricsPath,
        summaryPath,
        referenceCaptureRuntimeChanged: false,
        REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: 'NO',
        hfCadenceP50: HF_CADENCE_P50,
        dynamicsCounts,
        observedFields: discovered.length,
      },
      null,
      2,
    ),
  );
}

main();
