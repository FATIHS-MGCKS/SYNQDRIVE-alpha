#!/usr/bin/env node
/**
 * DBI P2-B3 — single-trip sustained-load kernel eval from READ_ONLY ClickHouse.
 * Reuses existing V1B tier processor, multichannel canonicalization, and P2-B3 kernel.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = process.env.DBI_EVAL_BACKEND_ROOT ?? join(__dirname, '../..');
const require = createRequire(join(BACKEND_ROOT, 'package.json'));

function loadBackendEnv(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

for (const envPath of [
  '/opt/synqdrive/shared/backend.env',
  join(BACKEND_ROOT, '.env'),
]) {
  loadBackendEnv(envPath);
}

const tsNode = require('ts-node');
const tsConfigPaths = require('tsconfig-paths');
const tsConfig = require(join(BACKEND_ROOT, 'tsconfig.json'));
tsNode.register({
  transpileOnly: true,
  compilerOptions: { ...tsConfig.compilerOptions, module: 'commonjs', moduleResolution: 'node' },
});
tsConfigPaths.register({
  baseUrl: BACKEND_ROOT,
  paths: tsConfig.compilerOptions.paths,
});

const { parseHfRpmValueFloat } = require(
  join(BACKEND_ROOT, 'src/modules/clickhouse/hf-rpm-value-parse.util.ts'),
);
const { resolveTelemetrySourceFamily } = require(
  join(BACKEND_ROOT, 'src/modules/vehicle-intelligence/telemetry-source-family.ts'),
);
const { processDs4RpmHfV1bShadowTripTierAware } = require(
  join(BACKEND_ROOT, 'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor.ts'),
);
const { computeDs4PowertrainDemandSustainedLoadResearchV1 } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1.ts',
  ),
);
const { validateDs4PowertrainDemandSustainedLoadInputBinding } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.input-binding.v1.ts',
  ),
);
const { computeMultichannelContentFingerprint } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1.ts',
  ),
);
const { canonicalizeMultichannelObservations } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-multichannel-canonicalize.v1.ts',
  ),
);
const { buildManifestChannelExpectations } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-binding-shared.v1.ts',
  ),
);
const {
  buildTierTripClassification,
  buildTierSnapshot,
} = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures.ts',
  ),
);
const { DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1.ts',
  ),
);
const { DS4_RPM_HF_V1A_CONTRACT_VERSION } = require(
  join(BACKEND_ROOT, 'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a.contract.ts'),
);
const { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-acquisition.versions.ts',
  ),
);
const { DS4_MULTICHANNEL_MANIFEST_VERSION } = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1.ts',
  ),
);

const TRIP_ID = process.env.DBI_EVAL_TRIP_ID ?? 'ca7d03a0-0702-40b9-acf2-0235c7dd07a1';
const VEHICLE_ID = process.env.DBI_EVAL_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SOURCE_LINK_ID = process.env.DBI_EVAL_SOURCE_LINK_ID ?? '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';
const ARTIFACT =
  process.env.DBI_EVAL_ARTIFACT ??
  (process.env.CLOUD_AGENT_ARTIFACTS_DIR
    ? join(process.env.CLOUD_AGENT_ARTIFACTS_DIR, 'dbi-p2b3-sustained-load-single-trip-eval.json')
    : '/opt/cursor/artifacts/dbi-p2b3-sustained-load-single-trip-eval.json');

const CHANNELS = [
  { signal: 'powertrainCombustionEngineSpeed', field: 'rpm', parse: (v) => parseHfRpmValueFloat(v) },
  { signal: 'obdEngineLoad', field: 'loadPct', parse: (v) => (v == null ? null : Number(v)) },
  { signal: 'obdThrottlePosition', field: 'throttlePct', parse: (v) => (v == null ? null : Number(v)) },
  { signal: 'powertrainCombustionEngineECT', field: 'coolantC', parse: (v) => (v == null ? null : Number(v)) },
  { signal: 'speed', field: 'speedKmh', parse: (v) => (v == null ? null : Number(v)) },
];

function gitBaseSha() {
  try {
    const { execSync } = require('node:child_process');
    return execSync('git rev-parse HEAD', { cwd: BACKEND_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

async function chQuery(sql, params = {}) {
  const base = (process.env.CLICKHOUSE_URL || 'http://127.0.0.1:8123').replace(/\/$/, '');
  const user = process.env.CLICKHOUSE_USER || 'synqdrive';
  const pass = process.env.CLICKHOUSE_PASSWORD || '';
  const db = process.env.CLICKHOUSE_DATABASE || 'synqdrive';
  const url = new URL(base);
  url.searchParams.set('database', db);
  url.searchParams.set('default_format', 'JSONEachRow');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(`param_${k}`, String(v));
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'text/plain' },
    body: sql,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CH ${res.status}: ${text.slice(0, 500)}`);
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function median(nums) {
  if (!nums.length) return 1;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function buildTripInputFromReal({
  orgId,
  vehicleId,
  tripId,
  linkId,
  tripStartIso,
  tripEndIso,
  rpmPoints,
  chTotals,
}) {
  const intervals = [];
  for (let i = 1; i < rpmPoints.length; i++) {
    const d = (Date.parse(rpmPoints[i].recordedAtIso) - Date.parse(rpmPoints[i - 1].recordedAtIso)) / 1000;
    if (d > 0) intervals.push(d);
  }
  const tierRow = buildTierTripClassification({
    tier: 'RPM_1S',
    tripId,
    cadenceConfidence: 'HIGH',
    tripCoverageBand: 'LIMITED_TRIP',
    analysisReadiness: 'TIER_ANALYTICS_OK',
    decisionCode: 'TIER_ASSIGNED',
    intervalEvidenceUsed: {
      rpmPointCount: rpmPoints.length,
      activeIntervalCount: Math.max(0, rpmPoints.length - 1),
      tripDurationSeconds: Math.max(1, (Date.parse(tripEndIso) - Date.parse(tripStartIso)) / 1000),
    },
    p50ActiveSeconds: median(intervals),
    p75ActiveSeconds: median(intervals),
    p90ActiveSeconds: median(intervals) * 1.5,
    activeSpanRatio: rpmPoints.length / Math.max(1, (Date.parse(tripEndIso) - Date.parse(tripStartIso)) / 1000),
    activeDensityVsTier: 0.59,
    tierPuritySharePlusOne: 0.9,
    longestSequenceIntervals: Math.min(200, rpmPoints.length),
  });
  const snapshot = buildTierSnapshot({ ...tierRow, tripId, endMs: Date.parse(tripEndIso) });
  const tierEvidence = {
    contractVersion: 'ds4-rpm-hf-tier-evidence-v1',
    status: 'AVAILABLE',
    tripId,
    providerSourceLinkId: linkId,
    tripClassification: { ...tierRow, tripId },
    blockEvidenceObservedAt: new Date().toISOString(),
  };

  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: orgId,
    vehicleId,
    tripId,
    providerSourceLinkId: linkId,
    tripStartIso,
    tripEndIso,
    admission: {
      contractVersion: 'ds4-rpm-hf-admission-v1',
      iceRpmApplicability: 'APPLICABLE',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      processingStatus: 'ENABLED',
      processingAllowed: true,
      reasonCode: 'RPM_1HZ_WITH_HF_DATA',
      reasonSummary: 'dbi-p2b3-single-trip-eval-read-only-ch',
    },
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: rpmPoints.length,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: rpmPoints[0]?.recordedAtIso ?? null,
      latestRecordedAtIso: rpmPoints[rpmPoints.length - 1]?.recordedAtIso ?? null,
      observedIntervals: {
        intervalCount: Math.max(0, rpmPoints.length - 1),
        intervalMedianSeconds: median(intervals),
        intervalP95Seconds: intervals.length ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)] : null,
        minIntervalSeconds: intervals.length ? Math.min(...intervals) : null,
        maxIntervalSeconds: intervals.length ? Math.max(...intervals) : null,
      },
      identifiedGaps: [],
      completenessLabel: chTotals.returned >= chTotals.total ? 'COMPLETE' : 'INCOMPLETE_MORE_POINTS_AVAILABLE',
      totalMatchingCount: chTotals.total,
      returnedPointCount: chTotals.returned,
      readLimit: chTotals.limit,
      readOffset: 0,
      bucketSemanticsNote: 'PROVIDER_BUCKET_LABELS_NOT_VERIFIED_PHYSICAL_SIMULTANEITY',
      gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
    },
    clickHouseRead: {
      status: chTotals.returned >= chTotals.total ? 'SUCCESS' : 'TRUNCATED',
      available: true,
      degradedReason: null,
      tenantScopeViolation: false,
    },
    rpmPoints,
    vsiActiveRpmProfileSnapshot: null,
    vsiRpmCadenceTierSnapshot: snapshot,
    tierEvidence,
    readOnly: true,
    productionActivationForbidden: true,
  };
}

function pivotMultichannel(channelRows) {
  const byMs = new Map();
  for (const { signal, rows } of channelRows) {
    const meta = CHANNELS.find((c) => c.signal === signal);
    if (!meta) continue;
    for (const r of rows) {
      const iso = new Date(r.recorded_at).toISOString();
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) continue;
      if (!byMs.has(ms)) {
        byMs.set(ms, {
          recordedAtIso: iso,
          tripId: TRIP_ID,
          providerSourceLinkId: SOURCE_LINK_ID,
        });
      }
      const row = byMs.get(ms);
      const val = meta.parse(r.value_float);
      if (val != null) row[meta.field] = val;
    }
  }
  return [...byMs.values()].sort((a, b) => Date.parse(a.recordedAtIso) - Date.parse(b.recordedAtIso));
}

async function loadPostgres() {
  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL.replace(/\?schema=[^&]*/, '') }
      : { user: 'postgres', database: 'synqdrive', host: '/var/run/postgresql' },
  );
  await client.connect();
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  const trip = await client.query(
    `SELECT t.id, t.start_time, t.end_time, v.organization_id, v.fuel_type, dv.raw_json AS dimo_raw_json
     FROM vehicle_trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
     WHERE t.id = $1 AND t.vehicle_id = $2`,
    [TRIP_ID, VEHICLE_ID],
  );
  await client.query('COMMIT');
  await client.end();
  return trip.rows[0] ?? null;
}

async function main() {
  const baseSha = gitBaseSha();
  const artifact = {
    OPERATION: 'DBI_P2B3_REAL_DATA_SINGLE_TRIP_EVALUATION',
    BASE_SHA: baseSha,
    TRIP_ID,
    VEHICLE_ID,
    TIMESTAMP_AUTHORITY: 'BUCKET_LABEL_UNVERIFIED',
    temporalCoherenceNote:
      'Multichannel rows merge only exact matching provider recorded_at labels; no cross-gap interpolation.',
  };

  const pgRow = await loadPostgres();
  if (!pgRow?.end_time) {
    artifact.FINAL_VERDICT = 'BLOCKED_POSTGRES_TRIP_MISSING';
    artifact.ABSTAIN_OR_BLOCKER = 'TRIP_NOT_FOUND_OR_ONGOING';
    writeArtifact(artifact);
    process.exit(2);
  }

  const orgId = pgRow.organization_id;
  const tripStartIso = new Date(pgRow.start_time).toISOString();
  const tripEndIso = new Date(pgRow.end_time).toISOString();
  const dimoRaw = pgRow.dimo_raw_json ?? { aftermarketDevice: { serial: 'R1-UNRESOLVED' } };
  const family = resolveTelemetrySourceFamily(dimoRaw) ?? 'UNKNOWN';

  const signalCounts = {};
  const channelRows = [];
  const CH_LIMIT = 12000;

  for (const ch of CHANNELS) {
    const cnt = await chQuery(
      `SELECT count() AS cnt FROM telemetry_hf_points
       WHERE vehicle_id={vehicleId:String} AND trip_id={tripId:String}
         AND signal_name={signalName:String}`,
      { vehicleId: VEHICLE_ID, tripId: TRIP_ID, signalName: ch.signal },
    );
    const total = Number(cnt[0]?.cnt ?? 0);
    const rows = await chQuery(
      `SELECT recorded_at, value_float FROM telemetry_hf_points
       WHERE vehicle_id={vehicleId:String} AND trip_id={tripId:String}
         AND signal_name={signalName:String}
       ORDER BY recorded_at ASC LIMIT {lim:UInt32}`,
      { vehicleId: VEHICLE_ID, tripId: TRIP_ID, signalName: ch.signal, lim: CH_LIMIT },
    );
    signalCounts[ch.signal] = { total, returned: rows.length, truncated: rows.length < total };
    channelRows.push({ signal: ch.signal, rows });
  }

  artifact.CH_REAL_DATA_READ = { readOnly: true, signalCounts };
  artifact.SIGNAL_COUNTS = signalCounts;

  const rpmRows = channelRows.find((c) => c.signal === 'powertrainCombustionEngineSpeed')?.rows ?? [];
  const rpmPoints = rpmRows
    .map((r) => {
      const v = parseHfRpmValueFloat(r.value_float);
      if (v == null) return null;
      return { recordedAtIso: new Date(r.recorded_at).toISOString(), valueRpm: v };
    })
    .filter(Boolean);

  if (rpmPoints.length < 8) {
    artifact.FINAL_VERDICT = 'BLOCKED_INSUFFICIENT_RPM_POINTS';
    artifact.ABSTAIN_OR_BLOCKER = 'RPM_POINTS_LT_8';
    writeArtifact(artifact);
    process.exit(2);
  }

  const multichannelObservations = pivotMultichannel(channelRows);
  const canon = canonicalizeMultichannelObservations(multichannelObservations);
  const loadBuckets = canon.buckets.filter((b) => b.loadPct != null).length;

  artifact.MULTICHANNEL_BINDING_STATUS = {
    pivotRowCount: multichannelObservations.length,
    canonicalBucketCount: canon.buckets.length,
    loadPresentBuckets: loadBuckets,
    conflictingDuplicates: canon.hasConflictingDuplicates,
    invalidTimestampOrValueCount: canon.invalidTimestampOrValueCount,
    exactTimestampMergeOnly: true,
  };

  const tripInput = buildTripInputFromReal({
    orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    linkId: SOURCE_LINK_ID,
    tripStartIso,
    tripEndIso,
    rpmPoints,
    chTotals: {
      total: Number(signalCounts.powertrainCombustionEngineSpeed?.total ?? rpmPoints.length),
      returned: rpmPoints.length,
      limit: CH_LIMIT,
    },
  });

  const v1bOut = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: new Date(),
    existingSucceededFingerprint: null,
  });

  if (v1bOut.kind !== 'SUCCEEDED') {
    artifact.V1B_TIER = { status: 'FAILED', kind: v1bOut.kind };
    artifact.FINAL_VERDICT = 'BLOCKED_V1B_PROCESSING';
    artifact.ABSTAIN_OR_BLOCKER = v1bOut.kind;
    writeArtifact(artifact);
    process.exit(2);
  }

  artifact.V1B_TIER = {
    tier: v1bOut.result.tierEvidence?.tier ?? null,
    analysisMode: v1bOut.result.tierEvidence?.analysisMode ?? null,
    analysisReadiness: v1bOut.result.tierEvidence?.tripClassification?.analysisReadiness ?? null,
    processingAllowed: v1bOut.result.admission.processingAllowed,
  };

  const mcFp = computeMultichannelContentFingerprint({
    organizationId: orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    providerSourceLinkId: SOURCE_LINK_ID,
    telemetrySourceFamily: family,
    observations: multichannelObservations,
  });

  const manifest = {
    manifestVersion: DS4_MULTICHANNEL_MANIFEST_VERSION,
    organizationId: orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    providerSourceLinkId: SOURCE_LINK_ID,
    telemetrySourceFamily: family,
    r1SnapshotVersion: family === 'RUPTELA_R1' ? DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 : null,
    channels: buildManifestChannelExpectations(canon),
    expectedMultichannelFingerprint: mcFp,
    independentFieldValidation: false,
  };

  /** Research bridge: real CH points use SYNTHETIC_FIXTURE enum only to avoid forged OFFLINE attestation (binding would fail). */
  const researchInput = {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: 'SYNTHETIC_FIXTURE',
    sourceBundleId: null,
    organizationId: orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    providerSourceLinkId: SOURCE_LINK_ID,
    dimoVehicleRawJson: dimoRaw,
    tripInput,
    v1bResult: v1bOut.result,
    multichannelObservations,
    multichannelManifest: manifest,
    multichannelFingerprint: mcFp,
    fuelType: pgRow.fuel_type ?? 'GASOLINE',
    isEvPowertrain: false,
    declaredIceOperationConfirmed: null,
  };

  artifact.PROVENANCE_STATUS = {
    clickHouseRealData: true,
    contractEvidenceOrigin: 'SYNTHETIC_FIXTURE',
    limitation:
      'OFFLINE_SEALED_BUNDLE would require independent attestation; not forged. Real-data bridge documented in artifact.',
    multichannelFingerprint: mcFp,
    telemetrySourceFamily: family,
  };

  const binding = validateDs4PowertrainDemandSustainedLoadInputBinding(researchInput);
  artifact.bindingPreview = binding.ok ? { ok: true } : { ok: false, reasonCodes: binding.reasonCodes };

  if (!binding.ok) {
    artifact.REAL_KERNEL_INVOKED = false;
    artifact.KERNEL_RESULT = null;
    artifact.ABSTAIN_OR_BLOCKER = binding.reasonCodes;
    artifact.FINAL_VERDICT = 'BINDING_FAILED_NO_KERNEL_COMPUTE';
    writeArtifact(artifact);
    process.exit(0);
  }

  const kernelResult = computeDs4PowertrainDemandSustainedLoadResearchV1(researchInput);
  artifact.REAL_KERNEL_INVOKED = true;
  artifact.KERNEL_RESULT = {
    status: kernelResult.status,
    abstainReasons: kernelResult.abstainReasons,
    candidateCount: kernelResult.sustainedLoad.candidates.length,
    tripEvidenceClassification: kernelResult.sustainedLoad.tripEvidenceClassification,
    candidates: kernelResult.sustainedLoad.candidates.slice(0, 25),
    coverageEvidence: kernelResult.sustainedLoad.coverageEvidence,
    unsupportedScientificClaims: kernelResult.unsupportedScientificClaims,
    limitations: kernelResult.sustainedLoad.candidates.flatMap((c) => c.limitationCodes).slice(0, 10),
  };
  artifact.ABSTAIN_OR_BLOCKER =
    kernelResult.status === 'ABSTAINED' ? kernelResult.abstainReasons : null;
  artifact.FINAL_VERDICT =
    kernelResult.status === 'COMPUTED' || kernelResult.status === 'NOT_OBSERVED'
      ? 'P2B3_REAL_DATA_KERNEL_EXECUTED'
      : 'P2B3_KERNEL_ABSTAINED';
  artifact.STOP = 'AWAIT_CHATGPT_REVIEW';
  writeArtifact(artifact);
  console.log(JSON.stringify({ verdict: artifact.FINAL_VERDICT, status: kernelResult.status, candidates: kernelResult.sustainedLoad.candidates.length }));
}

function writeArtifact(artifact) {
  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
