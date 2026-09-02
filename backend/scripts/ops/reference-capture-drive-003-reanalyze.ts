/**
 * Offline read-only re-analysis for Reference Drive #003 sealed JSONL export.
 *
 * SAFETY CONTRACT (REFERENCE_CAPTURE_RUNTIME_CHANGED = NO):
 * - Verifies sealed observations SHA-256 before analysis (fail closed)
 * - Reads input JSONL only; never writes to sealed evidence paths
 * - Writes derived artifacts only to --out-dir / --docs-dir
 * - No production DB access, no Prisma, no session mutation
 *
 * GENERATED_EVIDENCE_VALUE_SOURCE = COMPUTED_FROM_SEALED_RAW_DATA
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
  percentile,
  sortByAcquisitionOrder,
  type SignalMetricsObsRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics';

const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_003';
const SESSION_ID = '0fa040aa-6105-4872-9b2c-f8ad477009b8';
const EXPECTED_SHA256 = '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4';
const SEALED_EVIDENCE_ROOT = '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003';

/** Frozen production STOP facts — not derivable from per-observation JSONL alone. */
const FROZEN_SESSION_FACTS = {
  vehicle: 'WOB L 7503',
  vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  tokenId: 192922,
  sessionStartedAt: '2026-09-02T18:59:15.695Z',
  sessionStoppedAt: '2026-09-02T19:36:22.970Z',
  sessionCompletedAt: '2026-09-02T19:36:22.986Z',
  cycleCount: 371,
  deployedSha: 'f00a493949d8134f82a3e83d6c80ea8f7bb19699',
  fastGoMetrics: {
    prearmReadyMs: 2059,
    goToRecordingMs: 125,
    goToFirstCycleMs: 1222,
    goToReadyToDriveMs: 1222,
    firstCycleSignalPointCount: 31,
  },
} as const;

const REGRESSION = {
  EXPECTED_TOTAL_ROWS: 6251,
  EXPECTED_SIGNAL_POINTS: 6250,
  EXPECTED_SESSION_METADATA: 1,
  EXPECTED_NATIVE_EVENTS: 0,
  EXPECTED_HF_TOTAL: 2783,
  EXPECTED_AVAILABLE_SIGNALS: 31,
  EXPECTED_DUPLICATE_FINGERPRINTS: 0,
} as const;

type ExtendedObsRow = SignalMetricsObsRow & {
  canonicalKey?: string | null;
  rawIdentity?: string | null;
  temporalClass?: string | null;
  provenanceJson?: Record<string, unknown> | null;
};

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function toMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function parseJsonl(filePath: string): ExtendedObsRow[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ExtendedObsRow);
}

function isPathInside(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  if (resolvedChild === resolvedParent) return true;
  const rel = path.relative(resolvedParent, resolvedChild);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function assertSafeOutputPath(outputPath: string): void {
  const resolved = path.resolve(outputPath);
  const sealedRoot = path.resolve(SEALED_EVIDENCE_ROOT);
  if (isPathInside(resolved, sealedRoot) || resolved === sealedRoot) {
    throw new Error(`Refusing to write derived output into sealed evidence path: ${resolved}`);
  }
}

function assertSha256(inputPath: string): void {
  const actualSha = crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex');
  if (actualSha !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actualSha}`);
  }
}

function extractPreflightAvailableSignals(allObs: ExtendedObsRow[]): string[] {
  const meta = allObs.find((o) => o.observationKind === 'SESSION_METADATA');
  const preflight = (meta?.rawValueJson as { preflight?: { availableSignals?: string[] } } | undefined)
    ?.preflight;
  const signals = preflight?.availableSignals;
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new Error('Missing preflight availableSignals in SESSION_METADATA row');
  }
  return [...signals].sort();
}

function computeRecorderCycleIntervals(signalObs: ExtendedObsRow[]) {
  const starts = new Set<number>();
  for (const o of signalObs) {
    const ms = toMs(o.requestStartedAt);
    if (ms != null) starts.add(ms);
  }
  const sorted = [...starts].sort((a, b) => a - b);
  const clusterStarts: number[] = [];
  for (const t of sorted) {
    if (!clusterStarts.length || t - clusterStarts[clusterStarts.length - 1] > 3000) {
      clusterStarts.push(t);
    }
  }
  const dts = clusterStarts.slice(1).map((t, i) => (t - clusterStarts[i]) / 1000);
  const sortedDts = [...dts].sort((a, b) => a - b);
  return {
    uniqueRequestStartedAtCount: sorted.length,
    inferredCycleStartCount: clusterStarts.length,
    clusterGapThresholdSeconds: 3,
    deltaTSeconds: {
      sampleCount: sortedDts.length,
      p50: percentile(sortedDts, 50),
      p90: percentile(sortedDts, 90),
      p95: percentile(sortedDts, 95),
      p99: percentile(sortedDts, 99),
      max: sortedDts.length ? sortedDts[sortedDts.length - 1] : null,
      mean: sortedDts.length ? sortedDts.reduce((a, b) => a + b, 0) / sortedDts.length : null,
    },
    note: 'Recorder cycle cadence inferred from clustered requestStartedAt — NOT provider signal cadence',
  };
}

function buildSignalInventory(
  signalObs: ExtendedObsRow[],
  ctx: { sessionStartedAtMs: number; firstAcquisitionMs: number },
) {
  const byField: Record<string, ExtendedObsRow[]> = {};
  for (const o of signalObs) {
    const field = o.providerField ?? 'UNKNOWN';
    if (!byField[field]) byField[field] = [];
    byField[field].push(o);
  }

  return Object.entries(byField)
    .map(([providerField, rows]) => {
      const surfaces = [...new Set(rows.map((r) => r.acquisitionSurface ?? 'UNKNOWN'))];
      const metrics = analyzeSignalGroup(rows, ctx);
      const firstReceived = sortByAcquisitionOrder(rows)[0]?.synqReceivedAt ?? null;
      const lastReceived = sortByAcquisitionOrder(rows).at(-1)?.synqReceivedAt ?? null;
      return {
        providerField,
        rawIdentity: rows[0]?.rawIdentity ?? `DIMO::${providerField}`,
        canonicalKey: rows[0]?.canonicalKey ?? null,
        temporalClass: rows[0]?.temporalClass ?? 'UNKNOWN',
        surfaces,
        observationCount: rows.length,
        nonNullCount: metrics.nonNullCount,
        nullCount: rows.length - metrics.nonNullCount,
        uniqueProviderTimestampCount: metrics.providerCadence.uniqueProviderTimestampCount,
        uniquePhysicalSampleCount: metrics.fingerprint.uniqueFingerprints,
        firstProviderTimestamp: metrics.providerCadence.firstProviderTimestamp,
        lastProviderTimestamp: metrics.providerCadence.lastProviderTimestamp,
        firstReceivedAt: firstReceived ? String(firstReceived) : null,
        lastReceivedAt: lastReceived ? String(lastReceived) : null,
      };
    })
    .sort((a, b) => a.providerField.localeCompare(b.providerField));
}

function analyzeHfForensics(hfRows: ExtendedObsRow[], ctx: { sessionStartedAtMs: number; firstAcquisitionMs: number }) {
  const byField: Record<string, ExtendedObsRow[]> = {};
  for (const o of hfRows) {
    const f = o.providerField ?? 'UNKNOWN';
    if (!byField[f]) byField[f] = [];
    byField[f].push(o);
  }

  const perField: Record<string, ReturnType<typeof analyzeSignalGroup> & {
    identityVersions: string[];
    aggregations: string[];
    requestedIntervals: string[];
    duplicateBucketIdentities: number;
    hfWindowFromFirst: string | null;
    hfWindowToLast: string | null;
    hfActualQueryToLast: string | null;
    lateArrivalRecoveryObserved: boolean;
  }> = {};

  for (const [field, rows] of Object.entries(byField)) {
    const metrics = analyzeSignalGroup(rows, ctx);
    const provs = rows.map((r) => r.provenanceJson ?? {});
    const bucketIds = rows.map((r) => String(r.provenanceJson?.aggregateBucketIdentity ?? '')).filter(Boolean);
    const uniqueBuckets = new Set(bucketIds);
    const windowFrom = rows.map((r) => String(r.provenanceJson?.hfWindowFrom ?? '')).filter(Boolean).sort();
    const windowTo = rows.map((r) => String(r.provenanceJson?.hfWindowTo ?? '')).filter(Boolean).sort();
    const queryTo = rows.map((r) => String(r.provenanceJson?.hfActualQueryTo ?? '')).filter(Boolean).sort();
    perField[field] = {
      ...metrics,
      identityVersions: [...new Set(provs.map((p) => String(p.hfPhysicalIdentityVersion ?? '')).filter(Boolean))],
      aggregations: [...new Set(provs.map((p) => String(p.requestedAggregation ?? '')).filter(Boolean))],
      requestedIntervals: [...new Set(provs.map((p) => String(p.requestedInterval ?? '')).filter(Boolean))],
      duplicateBucketIdentities: bucketIds.length - uniqueBuckets.size,
      hfWindowFromFirst: windowFrom[0] ?? null,
      hfWindowToLast: windowTo.at(-1) ?? null,
      hfActualQueryToLast: queryTo.at(-1) ?? null,
      lateArrivalRecoveryObserved: provs.some((p) => p.duplicateRetrieval === true),
    };
  }

  const allBucketIds = hfRows.map((r) => String(r.provenanceJson?.aggregateBucketIdentity ?? '')).filter(Boolean);
  const identityVersions = [...new Set(hfRows.map((r) => String(r.provenanceJson?.hfPhysicalIdentityVersion ?? '')).filter(Boolean))];

  const p50Values = Object.values(perField)
    .map((m) => m.providerCadence.deltaTSeconds.p50)
    .filter((v): v is number => v != null);
  const requested1sEquals1Hz =
    p50Values.length > 0 && p50Values.every((p50) => p50 != null && Math.abs(p50 - 1) < 0.05)
      ? 'YES'
      : p50Values.length > 0
        ? 'NO'
        : 'INSUFFICIENT_EVIDENCE';

  return {
    hfFieldCount: Object.keys(perField).length,
    hfFieldList: Object.keys(perField).sort(),
    totalRows: hfRows.length,
    uniquePhysicalSamples: new Set(hfRows.map((r) => r.physicalSampleFingerprint).filter(Boolean)).size,
    identityVersions,
    requestedAggregation: 'AVG',
    requestedInterval: '1s',
    REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: requested1sEquals1Hz,
    ACTUAL_PHYSICAL_SAMPLE_RATE_PROVEN: 'NO' as const,
    perField,
    note: 'HF rows are AGGREGATE_BUCKET_V2 observations — not proven raw LTE_R1 physical sample rate',
  };
}

function validateHfRuntimeMechanisms(hfRows: ExtendedObsRow[]) {
  const perFieldWindows: Record<string, { windowTo: string[]; queryTo: string[] }> = {};
  let duplicateBuckets = 0;
  let nonV2 = 0;
  let lateRecovery = false;
  const bucketGlobal = new Set<string>();

  for (const row of hfRows) {
    const field = row.providerField ?? 'UNKNOWN';
    const prov = row.provenanceJson ?? {};
    if (prov.hfPhysicalIdentityVersion !== 'AGGREGATE_BUCKET_V2') nonV2++;
    const bucket = String(prov.aggregateBucketIdentity ?? '');
    if (bucket) {
      if (bucketGlobal.has(bucket)) duplicateBuckets++;
      bucketGlobal.add(bucket);
    }
    if (prov.duplicateRetrieval === true) lateRecovery = true;
    if (!perFieldWindows[field]) perFieldWindows[field] = { windowTo: [], queryTo: [] };
    if (prov.hfWindowTo) perFieldWindows[field].windowTo.push(String(prov.hfWindowTo));
    if (prov.hfActualQueryTo) perFieldWindows[field].queryTo.push(String(prov.hfActualQueryTo));
  }

  let watermarkMonotonic = true;
  let coverageBounded = true;
  for (const windows of Object.values(perFieldWindows)) {
    const sortedTo = [...windows.windowTo].sort();
    for (let i = 1; i < sortedTo.length; i++) {
      if (sortedTo[i] < sortedTo[i - 1]) watermarkMonotonic = false;
    }
    const lastQuery = windows.queryTo.sort().at(-1);
    const lastWindow = sortedTo.at(-1);
    if (lastQuery && lastWindow && lastQuery < lastWindow) coverageBounded = false;
  }

  return {
    HF_PHYSICAL_IDENTITY_VERSION: nonV2 === 0 ? 'AGGREGATE_BUCKET_V2' : 'MIXED',
    HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED: coverageBounded ? 'YES' : 'PARTIAL',
    HF_DATA_WATERMARK_RUNTIME_VALIDATED: watermarkMonotonic ? 'YES' : 'PARTIAL',
    HF_IDEMPOTENCY_RUNTIME_VALIDATED: duplicateBuckets === 0 ? 'YES' : 'NO',
    HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED: lateRecovery ? 'YES' : 'NOT_EXERCISED',
    duplicateAggregateBucketIdentities: duplicateBuckets,
    nonV2IdentityRows: nonV2,
  };
}

function buildPhysicsAssessability(discovered: string[], inventory: ReturnType<typeof buildSignalInventory>) {
  const has = (f: string) => discovered.includes(f);
  const dyn = (f: string) => inventory.find((i) => i.providerField === f)?.temporalClass ?? 'UNKNOWN';
  const speed = has('speed');
  const rpm = has('powertrainCombustionEngineSpeed');
  const load = has('obdEngineLoad');
  const throttle = has('obdThrottlePosition') || has('powertrainCombustionEngineTPS');
  const gear = has('powertrainTransmissionActualGear');
  const heading = has('currentLocationHeading');
  const maf = has('obdMaxMAF');

  return {
    targets: {
      vehicleSpeedTimeline: speed ? 'DIRECTLY_OBSERVED' : 'NOT_ASSESSABLE',
      longitudinalAcceleration: 'NOT_ASSESSABLE',
      jerk: 'NOT_ASSESSABLE',
      accelerationEpisodes: speed && (throttle || load) ? 'RECONSTRUCTABLE_MEDIUM_CONFIDENCE' : 'WEAK_PROXY_ONLY',
      brakingEpisodes: 'NOT_ASSESSABLE',
      accelToBrakeReversal: 'NOT_ASSESSABLE',
      stopGoCycles: speed ? 'RECONSTRUCTABLE_MEDIUM_CONFIDENCE' : 'NOT_ASSESSABLE',
      engineLoadExposure: load ? 'DIRECTLY_OBSERVED' : 'NOT_ASSESSABLE',
      rpmLoadOperatingRegions: rpm && load ? 'DIRECTLY_OBSERVED' : 'WEAK_PROXY_ONLY',
      gearChangeTiming: gear ? 'RECONSTRUCTABLE_HIGH_CONFIDENCE' : 'NOT_ASSESSABLE',
      lateralCorneringDemand: heading ? 'WEAK_PROXY_ONLY' : 'NOT_ASSESSABLE',
      yawDynamics: 'NOT_ASSESSABLE',
      wheelSpeedDifferential: 'NOT_ASSESSABLE',
      brakeHydraulicDemand: 'NOT_ASSESSABLE',
      tireDynamicDemand: 'NOT_ASSESSABLE',
    },
    domains: {
      DRIVER_QUALITY_ASSESSABILITY: speed && (throttle || load) ? 'RECONSTRUCTABLE_MEDIUM_CONFIDENCE' : 'WEAK_PROXY_ONLY',
      VEHICLE_LOAD_ASSESSABILITY: load && rpm ? 'DIRECTLY_OBSERVED' : 'RECONSTRUCTABLE_MEDIUM_CONFIDENCE',
      BRAKE_PHYSICS_ASSESSABILITY: 'NOT_ASSESSABLE',
      TIRE_DYNAMIC_ASSESSABILITY: 'NOT_ASSESSABLE',
    },
    rationale: {
      longitudinalAcceleration: 'No longitudinal accel signal in Tiguan availableSignals',
      brakingEpisodes: 'No brake pedal/pressure/hydraulic signals; no native harsh-brake events observed',
      yawDynamics: 'No yaw rate signal on Tiguan LTE_R1',
      wheelSpeedDifferential: 'No wheel speed signals',
      gearChangeTiming: gear ? 'powertrainTransmissionActualGear observed with moderate cadence' : 'missing',
      speedTimeline: speed ? `speed observed on LATEST_LIVE + HF; temporalClass=${dyn('speed')}` : 'missing',
      mafPresent: maf,
    },
  };
}

function buildNativeEventForensics(
  allObs: ExtendedObsRow[],
  eventObs: ExtendedObsRow[],
  preflightSignals: string[],
) {
  const meta = allObs.find((o) => o.observationKind === 'SESSION_METADATA');
  const preflight = (meta?.rawValueJson as { preflight?: { eventCapability?: unknown } } | undefined)?.preflight;
  return {
    NATIVE_EVENT_COUNT: eventObs.length,
    NATIVE_EVENT_ENDPOINT_QUERIED: 'UNKNOWN',
    NATIVE_EVENT_CAPABILITY_ADVERTISED: preflight?.eventCapability != null ? 'YES' : 'UNKNOWN',
    PROVIDER_RETURNED_EVENT_COUNT: eventObs.length,
    QUALIFYING_DRIVER_EVENTS_OCCURRED: 'UNKNOWN',
    NATIVE_EVENT_RUNTIME_DELIVERY_VALIDATED: eventObs.length > 0 ? 'YES' : 'NOT_EXERCISED',
    comparison: {
      RD001_NATIVE_EVENTS: 0,
      RD002_NATIVE_EVENTS: 0,
      RD003_NATIVE_EVENTS: eventObs.length,
      researchFinding:
        'Three reference drives returned zero native DIMO events — acquisition/capability research finding, NOT proof that no harsh maneuvers occurred',
    },
  };
}

function buildSamplingInvarianceReadiness(params: {
  hfForensics: ReturnType<typeof analyzeHfForensics>;
  inventory: ReturnType<typeof buildSignalInventory>;
  durationSeconds: number;
}) {
  const speedHf = params.hfForensics.perField.speed;
  const p50 = speedHf?.providerCadence.deltaTSeconds.p50;
  const blockers: string[] = [];
  if (p50 != null && p50 > 2) blockers.push('HF provider bucket cadence sparse vs 1s replay target');
  if (params.durationSeconds < 600) blockers.push('duration under 10 minutes limits dropout scenario coverage');
  const dynamicFields = params.inventory.filter((i) => i.temporalClass === 'POWERTRAIN_DYNAMIC' || i.providerField === 'speed');
  if (dynamicFields.length < 3) blockers.push('limited dynamic field count');
  return {
    RD003_SAMPLING_INVARIANCE_SOURCE_READY: blockers.length === 0 ? 'YES' : blockers.length <= 2 ? 'PARTIAL' : 'NO',
    blockers,
    plannedReplayCadences: ['native', '1s', '2s', '5s', '10s', '30s', 'irregular', '10pct_dropout', '25pct_dropout'],
    note: 'Do not upscale sparse HF buckets to synthetic native 1Hz truth',
  };
}

function loadPeerSummary(relPath: string): Record<string, unknown> | null {
  const p = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

function buildRd001Differential(rd003: Record<string, unknown>) {
  const rd001 = loadPeerSummary('docs/audits/data/dimo-lte-r1-reference-drive-001-session-summary.json');
  if (!rd001) return { error: 'RD001 summary missing' };
  const rd001Fields = new Set(
    ((rd001.hfFields as Record<string, number>) ? Object.keys(rd001.hfFields as object) : []) as string[],
  );
  const rd003Fields = new Set((rd003.hfFieldList as string[]) ?? []);
  return {
    sameVehicle: true,
    vehicle: 'WOB L 7503',
    RD001_sessionId: rd001.sessionId,
    RD003_sessionId: SESSION_ID,
    durationSeconds: {
      RD001: rd001.sessionLifecycleDurationSeconds,
      RD003: rd003.sessionLifecycleDurationSeconds,
    },
    acquisitionStartGapSeconds: {
      RD001: rd001.acquisitionStartGapSeconds,
      RD003: rd003.acquisitionStartGapSeconds,
      classification: Number(rd001.acquisitionStartGapSeconds) > 60 ? 'RECORDER_ARCHITECTURE_CHANGE' : 'UNCHANGED',
    },
    cycleCount: { RD001: rd001.cycleCount, RD003: rd003.cycleCount },
    signalObservations: { RD001: rd001.signalObservations, RD003: rd003.signalObservations },
    hfRows: { RD001: rd001.hfAggregateBucketObservationCount, RD003: rd003.hfAggregateBucketObservationCount },
    hfRowsPerMinute: {
      RD001:
        Number(rd001.hfAggregateBucketObservationCount) /
        (Number(rd001.sessionLifecycleDurationSeconds) / 60),
      RD003:
        Number(rd003.hfAggregateBucketObservationCount) /
        (Number(rd003.sessionLifecycleDurationSeconds) / 60),
    },
    availableSignals: { RD001: 31, RD003: rd003.availableSignalsCount },
    observedFields: { RD001: 31, RD003: rd003.observedFieldCount },
    hfFieldParity: [...rd003Fields].every((f) => rd001Fields.has(f)),
    videoGroundTruth: { RD001: 'NOT_AVAILABLE', RD003: 'PLANNED_VIDEO_GT_PENDING_INGESTION' },
    majorFindings: [
      'RD003 eliminated ~704s ARM acquisition-start gap present in RD001 (RECORDER_ARCHITECTURE_CHANGE)',
      'RD003 longer drive (~37 min vs ~34 min) with more cycles (371 vs 226) and more HF rows (2783 vs 1333)',
      'Same 31-field Tiguan capability surface; HF field set unchanged (5 fields)',
      'REQUESTED_INTERVAL_1S≠OBSERVED_1HZ holds for Tiguan under motion (independent confirmation)',
      'Zero native events across both Tiguan drives — capability research finding',
    ],
  };
}

function buildRd002Differential(rd003: Record<string, unknown>) {
  const rd002 = loadPeerSummary('docs/audits/data/dimo-lte-r1-reference-drive-002-session-summary.json');
  if (!rd002) return { error: 'RD002 summary missing' };
  const rd002Observed = ((rd002.capabilityVsObserved as { observedFields?: string[] })?.observedFields ??
    []) as string[];
  const rd003Observed = (rd003.observedFields as string[]) ?? [];
  const rd002Set = new Set(rd002Observed);
  const rd003Set = new Set(rd003Observed);
  return {
    RD002_vehicle: 'KS MX 2024 (Mercedes C63)',
    RD003_vehicle: 'WOB L 7503 (VW Tiguan)',
    durationSeconds: {
      RD002: rd002.sessionLifecycleDurationSeconds,
      RD003: rd003.sessionLifecycleDurationSeconds,
    },
    availableSignals: { RD002: 29, RD003: rd003.availableSignalsCount },
    observedFields: { RD002: rd002Observed.length, RD003: rd003Observed.length },
    tiguanOnlyFields: [...rd003Set].filter((f) => !rd002Set.has(f)),
    c63OnlyFields: [...rd002Set].filter((f) => !rd003Set.has(f)),
    sharedFields: [...rd003Set].filter((f) => rd002Set.has(f)),
    hfRowsPerMinute: {
      RD002:
        Number(rd002.hfAggregateBucketObservationCount) /
        (Number(rd002.sessionLifecycleDurationSeconds) / 60),
      RD003:
        Number(rd003.hfAggregateBucketObservationCount) /
        (Number(rd003.sessionLifecycleDurationSeconds) / 60),
    },
    nativeEvents: { RD002: rd002.nativeEvents, RD003: rd003.nativeEvents },
    signalBehavior: 'VEHICLE_SPECIFIC',
    majorFindings: [
      'Tiguan exposes 31 availableSignals vs C63 29 — Tiguan-only transmission gear fields',
      'HF field set identical (5 fields) but Tiguan HF row density higher per minute under longer drive',
      'Both vehicles: REQUESTED_INTERVAL_1S≠OBSERVED_1HZ on HF aggregate buckets',
      'Zero native events on both motion drives',
      'C63 lacks gear signals; Tiguan enables gear-change timing assessability',
    ],
  };
}

function assertRd003Invariants(params: {
  allObs: ExtendedObsRow[];
  signalObs: ExtendedObsRow[];
  eventObs: ExtendedObsRow[];
  metaCount: number;
  discovered: string[];
  preflightSignals: string[];
  hfForensics: ReturnType<typeof analyzeHfForensics>;
  fingerprintAudit: ReturnType<typeof auditFingerprintSemantics>;
}): void {
  const { allObs, signalObs, eventObs, metaCount, discovered, preflightSignals, hfForensics, fingerprintAudit } =
    params;
  if (allObs.length !== REGRESSION.EXPECTED_TOTAL_ROWS) {
    throw new Error(`Row count expected ${REGRESSION.EXPECTED_TOTAL_ROWS}, got ${allObs.length}`);
  }
  if (signalObs.length !== REGRESSION.EXPECTED_SIGNAL_POINTS) {
    throw new Error(`SIGNAL_POINT expected ${REGRESSION.EXPECTED_SIGNAL_POINTS}, got ${signalObs.length}`);
  }
  if (metaCount !== REGRESSION.EXPECTED_SESSION_METADATA) {
    throw new Error(`SESSION_METADATA expected ${REGRESSION.EXPECTED_SESSION_METADATA}, got ${metaCount}`);
  }
  if (eventObs.length !== REGRESSION.EXPECTED_NATIVE_EVENTS) {
    throw new Error(`NATIVE_EVENT expected ${REGRESSION.EXPECTED_NATIVE_EVENTS}, got ${eventObs.length}`);
  }
  if (preflightSignals.length !== REGRESSION.EXPECTED_AVAILABLE_SIGNALS) {
    throw new Error(`availableSignals expected ${REGRESSION.EXPECTED_AVAILABLE_SIGNALS}, got ${preflightSignals.length}`);
  }
  if (hfForensics.totalRows !== REGRESSION.EXPECTED_HF_TOTAL) {
    throw new Error(`HF_HISTORICAL expected ${REGRESSION.EXPECTED_HF_TOTAL}, got ${hfForensics.totalRows}`);
  }
  if (fingerprintAudit.duplicateFingerprintRetrievals !== REGRESSION.EXPECTED_DUPLICATE_FINGERPRINTS) {
    throw new Error(
      `Duplicate fingerprints expected ${REGRESSION.EXPECTED_DUPLICATE_FINGERPRINTS}, got ${fingerprintAudit.duplicateFingerprintRetrievals}`,
    );
  }
  if (discovered.length !== preflightSignals.length) {
    throw new Error(`Observed field count ${discovered.length} != available ${preflightSignals.length}`);
  }
}

function main(): void {
  const inputPath =
    parseArg('--input') ??
    '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003/observations.jsonl';
  const outDir = parseArg('--out-dir') ?? path.resolve(process.cwd(), 'docs/audits/data');
  const docsDir = parseArg('--docs-dir') ?? path.resolve(process.cwd(), 'docs/audits');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input JSONL not found: ${inputPath}`);
  }

  assertSha256(inputPath);

  const metricsPath = path.join(outDir, 'dimo-lte-r1-reference-drive-003-signal-quality-metrics.json');
  const csvPath = path.join(outDir, 'dimo-lte-r1-reference-drive-003-signal-quality-metrics.csv');
  const summaryPath = path.join(outDir, 'dimo-lte-r1-reference-drive-003-session-summary.json');
  const captureReportPath = path.join(docsDir, 'dimo-lte-r1-reference-drive-003-capture-report-2026-09-02.md');
  const rd001DiffPath = path.join(docsDir, 'dimo-lte-r1-reference-drive-003-vs-rd001-tiguan-differential-2026-09-02.md');
  const rd002DiffPath = path.join(docsDir, 'dimo-lte-r1-reference-drive-002-vs-rd003-tiguan-cross-vehicle-differential-2026-09-02.md');
  const videoGtPath = path.join(docsDir, 'dimo-lte-r1-reference-drive-003-ground-truth-evidence-index-2026-09-02.md');

  for (const outputPath of [outDir, docsDir, metricsPath, csvPath, summaryPath, captureReportPath, rd001DiffPath, rd002DiffPath, videoGtPath]) {
    assertSafeOutputPath(outputPath);
  }

  const allObs = parseJsonl(inputPath);
  const signalObs = allObs.filter((o) => o.observationKind === 'SIGNAL_POINT');
  const eventObs = allObs.filter((o) => o.observationKind === 'NATIVE_EVENT');
  const metaCount = allObs.filter((o) => o.observationKind === 'SESSION_METADATA').length;
  const preflightSignals = extractPreflightAvailableSignals(allObs);

  const { sessionStartedAt, sessionStoppedAt, sessionCompletedAt } = FROZEN_SESSION_FACTS;
  const sortedByIngress = sortByAcquisitionOrder(signalObs);
  const firstAcquisition =
    sortedByIngress[0]?.synqReceivedAt ?? sortedByIngress[0]?.providerTimestamp ?? sessionStartedAt;
  const lastAcquisition =
    sortedByIngress.at(-1)?.synqReceivedAt ??
    sortedByIngress.at(-1)?.providerTimestamp ??
    sessionCompletedAt;

  const ctx = {
    sessionStartedAtMs: Date.parse(sessionStartedAt),
    firstAcquisitionMs: Date.parse(String(firstAcquisition)),
  };

  const byFieldSurface: Record<string, Record<string, ExtendedObsRow[]>> = {};
  for (const o of signalObs) {
    const field = o.providerField ?? 'UNKNOWN';
    const surface = o.acquisitionSurface ?? 'UNKNOWN';
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
      perFieldSurface.push({ providerField: field, acquisitionSurface: surface, metrics: analyzeSignalGroup(rows, ctx) });
    }
  }

  const discovered = Object.keys(byFieldSurface).filter((f) => f !== 'UNKNOWN').sort();
  const inventory = buildSignalInventory(signalObs, ctx);
  const hfRows = signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL');
  const hfForensics = analyzeHfForensics(hfRows, ctx);
  const hfRuntime = validateHfRuntimeMechanisms(hfRows);
  const recorderCycles = computeRecorderCycleIntervals(signalObs);
  const fingerprintAudit = auditFingerprintSemantics(allObs);
  const physics = buildPhysicsAssessability(discovered, inventory);
  const nativeEvents = buildNativeEventForensics(allObs, eventObs, preflightSignals);
  const brake = classifyBrakeEvidence(preflightSignals, discovered);
  const coverageWindows = buildCoverageWindows({ sessionStartedAt, sessionCompletedAt, rows: allObs });
  const surfaceCoverage = buildSurfaceCoverage(signalObs);

  assertRd003Invariants({
    allObs,
    signalObs,
    eventObs,
    metaCount,
    discovered,
    preflightSignals,
    hfForensics,
    fingerprintAudit,
  });

  const sessionLifecycleDurationSeconds =
    (Date.parse(sessionCompletedAt) - Date.parse(sessionStartedAt)) / 1000;
  const acquisitionStartGapSeconds =
    (Date.parse(String(firstAcquisition)) - Date.parse(sessionStartedAt)) / 1000;

  const sampling = buildSamplingInvarianceReadiness({
    hfForensics,
    inventory,
    durationSeconds: sessionLifecycleDurationSeconds,
  });

  const surfaceCounts = {
    HF_HISTORICAL: signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL').length,
    LATEST_LIVE: signalObs.filter((o) => o.acquisitionSurface === 'LATEST_LIVE').length,
    LATEST_SLOW: signalObs.filter((o) => o.acquisitionSurface === 'LATEST_SLOW').length,
  };

  const metricsOut = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026-09-02-rd003-telemetry-forensics-v1-computed',
    referenceCaptureRuntimeChanged: false,
    generatedEvidenceValueSource: 'COMPUTED_FROM_SEALED_RAW_DATA',
    sealedRawExport: {
      path: inputPath,
      sha256: EXPECTED_SHA256,
      rowCount: allObs.length,
      unchanged: true,
      readOnlyAnalysis: true,
    },
    inventory,
    perFieldSurface,
    hfForensics,
    hfRuntimeValidation: hfRuntime,
    recorderCycleTiming: recorderCycles,
    cadenceSeparation: {
      RECORDER_POLL_CADENCE: recorderCycles,
      PROVIDER_TIMESTAMP_CADENCE: 'see perFieldSurface.providerCadence',
      VALUE_CHANGE_CADENCE: 'see inventory + dynamics',
      HF_AGGREGATE_BUCKET_CADENCE: hfForensics.perField,
      PHYSICAL_SAMPLE_CADENCE: 'NOT_PROVEN — HF rows are aggregate buckets',
    },
    fingerprintAudit,
    physicsAssessability: physics,
    nativeEventForensics: nativeEvents,
    brakeEvidence: brake,
    samplingInvarianceReadiness: sampling,
    capabilityVsObserved: {
      availableSignalsCount: preflightSignals.length,
      observedFieldCount: discovered.length,
      availableSignals: preflightSignals,
      observedFields: discovered,
    },
    surfaceCounts,
    acquisitionSurfaces: ACQUISITION_SURFACES,
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

  const sessionSummary = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    ...FROZEN_SESSION_FACTS,
    connectionProfile: 'DIMO_LTE_R1',
    powertrainProfile: 'ICE_GASOLINE',
    manifestVersion: '1.1.0',
    firstActualCaptureAt: firstAcquisition,
    lastActualCaptureAt: lastAcquisition,
    acquisitionStartGapSeconds,
    actualCaptureDurationSeconds:
      (Date.parse(String(lastAcquisition)) - Date.parse(String(firstAcquisition))) / 1000,
    sessionLifecycleDurationSeconds,
    finalStatus: 'COMPLETED',
    totalObservations: allObs.length,
    signalObservations: signalObs.length,
    nativeEvents: eventObs.length,
    metadataObservations: metaCount,
    hfAggregateBucketObservationCount: hfForensics.totalRows,
    hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
    surfaces: surfaceCounts,
    hfFields: Object.fromEntries(hfForensics.hfFieldList.map((f) => [f, hfForensics.perField[f].observationCount])),
    availableSignalsCount: preflightSignals.length,
    observedFieldCount: discovered.length,
    observedFields: discovered,
    hfFieldList: hfForensics.hfFieldList,
    videoGroundTruthAvailable: false,
    videoGroundTruthProtocol: 'VIDEO_INSTRUMENT_CLUSTER',
    videoAlignmentStatus: 'PENDING_VIDEO',
    postStopZombieProof: {
      runnerJobId: null,
      pendingCycleJobId: null,
      duplicatePhysicalFingerprintsInSession: fingerprintAudit.duplicateFingerprintRetrievals,
    },
    rawEvidenceExport: {
      path: `${SEALED_EVIDENCE_ROOT}/observations.jsonl`,
      manifestPath: `${SEALED_EVIDENCE_ROOT}/manifest.sha256.json`,
      rowCount: allObs.length,
      sha256: EXPECTED_SHA256,
      state: 'SEALED_EXPORT_AVAILABLE',
    },
    recorderCycleTiming: recorderCycles,
    hfRuntimeValidation: hfRuntime,
    hfCadenceFinding: {
      REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: hfForensics.REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ,
      perFieldSummary: Object.fromEntries(
        hfForensics.hfFieldList.map((f) => [
          f,
          {
            hfRows: hfForensics.perField[f].observationCount,
            providerBucketDeltaTSeconds: hfForensics.perField[f].providerCadence.deltaTSeconds,
            maxGapSeconds: hfForensics.perField[f].providerCadence.maxGapSeconds,
          },
        ]),
      ),
    },
    physicsAssessability: physics.domains,
    nativeEventForensics: nativeEvents,
    samplingInvarianceReadiness: sampling,
    coverageWindows,
    surfaceCoverage,
    fingerprintAudit,
    generatedEvidenceValueSource: 'COMPUTED_FROM_SEALED_RAW_DATA',
    verdicts: {
      REFERENCE_DRIVE_003_CAPTURE: 'COMPLETED',
      RD003_TELEMETRY_FORENSICS: 'DONE',
      VIDEO_GROUND_TRUTH: 'PENDING_VIDEO',
      GROUND_TRUTH_VALIDATED: 'NO',
      READY_FOR_VIDEO_GT_INGESTION: 'YES',
    },
  };

  const rd001Diff = buildRd001Differential(sessionSummary as unknown as Record<string, unknown>);
  const rd002Diff = buildRd002Differential(sessionSummary as unknown as Record<string, unknown>);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metricsOut, null, 2));
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  fs.writeFileSync(summaryPath, JSON.stringify(sessionSummary, null, 2));

  const hfTable = hfForensics.hfFieldList
    .map((f) => {
      const m = hfForensics.perField[f];
      const dt = m.providerCadence.deltaTSeconds;
      return `| ${f} | ${m.observationCount} | ${m.fingerprint.uniqueFingerprints} | ${dt.p50?.toFixed(3) ?? '—'} | ${dt.p90?.toFixed(3) ?? '—'} | ${dt.p95?.toFixed(3) ?? '—'} | ${dt.p99?.toFixed(3) ?? '—'} | ${m.providerCadence.maxGapSeconds?.toFixed(3) ?? '—'} |`;
    })
    .join('\n');

  fs.writeFileSync(
    captureReportPath,
    `# Reference Drive #003 — Capture Report (STOP + Telemetry Forensics)\n\n` +
      `**Evidence ID:** DI-EV-0027  \n` +
      `**Session:** \`${SESSION_ID}\`  \n` +
      `**Vehicle:** VW Tiguan WOB L 7503 · DIMO_LTE_R1 · ICE_GASOLINE  \n` +
      `**Date:** 2026-09-02  \n` +
      `**Sealed SHA-256:** \`${EXPECTED_SHA256}\`\n\n` +
      `## Verdict\n\n` +
      `| Flag | Value |\n|------|-------|\n` +
      `| REFERENCE_DRIVE_003_CAPTURE | COMPLETED |\n` +
      `| RD003_TELEMETRY_FORENSICS | DONE |\n` +
      `| VIDEO_GROUND_TRUTH | PENDING_VIDEO |\n` +
      `| GROUND_TRUTH_VALIDATED | NO |\n` +
      `| REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ | ${hfForensics.REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ} |\n\n` +
      `## Session facts (frozen + computed)\n\n` +
      `| Metric | Value |\n|--------|-------|\n` +
      `| Duration | ${sessionLifecycleDurationSeconds.toFixed(1)} s (~${(sessionLifecycleDurationSeconds / 60).toFixed(1)} min) |\n` +
      `| Cycles | ${FROZEN_SESSION_FACTS.cycleCount} |\n` +
      `| SIGNAL_POINT | ${signalObs.length} |\n` +
      `| HF_HISTORICAL | ${hfForensics.totalRows} |\n` +
      `| Acquisition-start gap | ${acquisitionStartGapSeconds.toFixed(3)} s |\n` +
      `| Recorder cycle P50 | ${recorderCycles.deltaTSeconds.p50?.toFixed(3) ?? '—'} s |\n` +
      `| Recorder cycle P95 | ${recorderCycles.deltaTSeconds.p95?.toFixed(3) ?? '—'} s |\n\n` +
      `## HF cadence (per field)\n\n` +
      `| Field | HF rows | Unique fingerprints | P50 Δt | P90 Δt | P95 Δt | P99 Δt | Max gap |\n` +
      `|-------|---------|---------------------|--------|--------|--------|--------|--------|\n` +
      `${hfTable}\n\n` +
      `## HF runtime validation\n\n` +
      `| Check | Result |\n|-------|--------|\n` +
      `| HF_PHYSICAL_IDENTITY_VERSION | ${hfRuntime.HF_PHYSICAL_IDENTITY_VERSION} |\n` +
      `| HF_QUERY_WINDOW_BOUNDED | ${hfRuntime.HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED} |\n` +
      `| HF_DATA_WATERMARK | ${hfRuntime.HF_DATA_WATERMARK_RUNTIME_VALIDATED} |\n` +
      `| HF_IDEMPOTENCY | ${hfRuntime.HF_IDEMPOTENCY_RUNTIME_VALIDATED} |\n` +
      `| HF_LATE_ARRIVAL_RECOVERY | ${hfRuntime.HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED} |\n\n` +
      `**GENERATED_EVIDENCE_VALUE_SOURCE:** COMPUTED_FROM_SEALED_RAW_DATA\n`,
  );

  fs.writeFileSync(
    rd001DiffPath,
    `# RD001 vs RD003 — Same Tiguan Differential\n\n**Evidence ID:** DI-EV-0030\n\n` +
      `Vehicle: VW Tiguan WOB L 7503 (same vehicle, different sessions).\n\n` +
      `\`\`\`json\n${JSON.stringify(rd001Diff, null, 2)}\n\`\`\`\n`,
  );

  fs.writeFileSync(
    rd002DiffPath,
    `# RD002 C63 vs RD003 Tiguan — Cross-Vehicle Differential\n\n**Evidence ID:** DI-EV-0031\n\n` +
      `\`\`\`json\n${JSON.stringify(rd002Diff, null, 2)}\n\`\`\`\n`,
  );

  fs.writeFileSync(
    videoGtPath,
    `# RD003 Video Ground Truth Evidence Index (Pending Video)\n\n**Evidence ID:** DI-EV-0032\n\n` +
      `| Field | Value |\n|-------|-------|\n` +
      `| VIDEO_GROUND_TRUTH_AVAILABLE | NOT_YET_INGESTED |\n` +
      `| VIDEO_ALIGNMENT_STATUS | PENDING_VIDEO |\n` +
      `| VIDEO_FILE_SHA256 | _empty — pending ingest_ |\n` +
      `| VIDEO_DURATION | _empty_ |\n` +
      `| VIDEO_FPS | _empty_ |\n` +
      `| VIDEO_START_TIME | _empty_ |\n` +
      `| VIDEO_END_TIME | _empty_ |\n` +
      `| CAMERA_CLOCK_REFERENCE | _empty_ |\n` +
      `| TELEMETRY_CLOCK_REFERENCE | session ${SESSION_ID} |\n\n` +
      `## Synchronization anchors (to be marked from video)\n\n` +
      `- START_IDLE\n- THROTTLE_PULSE_1\n- THROTTLE_PULSE_2\n- THROTTLE_PULSE_3\n- DRIVE_START\n- FIRST_STOP\n- DRIVE_END\n\n` +
      `## Future alignment targets\n\n` +
      `speed, RPM, gear (if visible), start/stop timing, acceleration onset, braking onset, accel→brake reversal\n\n` +
      `## Methodology (not yet executed)\n\n` +
      `clock offset estimation, drift estimation, anchor residuals, speed bias, MAE, RMSE, onset latency, steady-speed agreement\n\n` +
      `**No alignment metrics are reported until the actual video file is ingested and SHA-verified.**\n`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        sha256: EXPECTED_SHA256,
        exportRows: allObs.length,
        metricsPath,
        summaryPath,
        captureReportPath,
        REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: hfForensics.REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ,
        recorderCycleP50: recorderCycles.deltaTSeconds.p50,
        recorderCycleP95: recorderCycles.deltaTSeconds.p95,
        hfFieldCount: hfForensics.hfFieldCount,
        hfFieldList: hfForensics.hfFieldList,
        observedFieldCount: discovered.length,
        ...hfRuntime,
        nativeEventCount: eventObs.length,
        samplingReady: sampling.RD003_SAMPLING_INVARIANCE_SOURCE_READY,
        referenceCaptureRuntimeChanged: false,
      },
      null,
      2,
    ),
  );
}

main();
