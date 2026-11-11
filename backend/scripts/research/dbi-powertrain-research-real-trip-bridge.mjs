/**
 * Shared READ_ONLY bridge: ClickHouse multichannel → V1B → powertrain research input.
 * Not production activation; avoids forged OFFLINE attestation (uses SYNTHETIC_FIXTURE enum with documented CH provenance).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import pg from 'pg';

export const DEFAULT_CHANNELS = [
  { signal: 'powertrainCombustionEngineSpeed', field: 'rpm', parseRpm: true },
  { signal: 'obdEngineLoad', field: 'loadPct', parseRpm: false },
  { signal: 'obdThrottlePosition', field: 'throttlePct', parseRpm: false },
  { signal: 'powertrainCombustionEngineECT', field: 'coolantC', parseRpm: false },
  { signal: 'speed', field: 'speedKmh', parseRpm: false },
];

export function initResearchBackend(backendRoot) {
  const require = createRequire(join(backendRoot, 'package.json'));

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

  for (const envPath of ['/opt/synqdrive/shared/backend.env', join(backendRoot, '.env')]) {
    loadBackendEnv(envPath);
  }

  const tsNode = require('ts-node');
  const tsConfigPaths = require('tsconfig-paths');
  const tsConfig = require(join(backendRoot, 'tsconfig.json'));
  tsNode.register({
    transpileOnly: true,
    compilerOptions: { ...tsConfig.compilerOptions, module: 'commonjs', moduleResolution: 'node' },
  });
  tsConfigPaths.register({ baseUrl: backendRoot, paths: tsConfig.compilerOptions.paths });

  const libs = {
    parseHfRpmValueFloat: require(join(backendRoot, 'src/modules/clickhouse/hf-rpm-value-parse.util.ts'))
      .parseHfRpmValueFloat,
    resolveTelemetrySourceFamily: require(
      join(backendRoot, 'src/modules/vehicle-intelligence/telemetry-source-family.ts'),
    ).resolveTelemetrySourceFamily,
    processDs4RpmHfV1bShadowTripTierAware: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor.ts',
      ),
    ).processDs4RpmHfV1bShadowTripTierAware,
    computeMultichannelContentFingerprint: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1.ts',
      ),
    ).computeMultichannelContentFingerprint,
    canonicalizeMultichannelObservations: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-multichannel-canonicalize.v1.ts',
      ),
    ).canonicalizeMultichannelObservations,
    buildManifestChannelExpectations: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-binding-shared.v1.ts',
      ),
    ).buildManifestChannelExpectations,
    buildTierTripClassification: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures.ts',
      ),
    ).buildTierTripClassification,
    DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1.ts',
      ),
    ).DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    DS4_RPM_HF_V1A_CONTRACT_VERSION: require(
      join(backendRoot, 'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a.contract.ts'),
    ).DS4_RPM_HF_V1A_CONTRACT_VERSION,
    DS4_MULTICHANNEL_MANIFEST_VERSION: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1.ts',
      ),
    ).DS4_MULTICHANNEL_MANIFEST_VERSION,
    DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-acquisition.versions.ts',
      ),
    ).DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
    VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence.types.ts',
      ),
    ).VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION,
  };

  return { require, libs };
}

export async function chQuery(sql, params = {}) {
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

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function rpmIntervals(rpmPoints) {
  const out = [];
  for (let i = 1; i < rpmPoints.length; i++) {
    const d = (Date.parse(rpmPoints[i].recordedAtIso) - Date.parse(rpmPoints[i - 1].recordedAtIso)) / 1000;
    if (d > 0) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

export async function loadPostgresTrip({ tripId, vehicleId }) {
  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL.replace(/\?schema=[^&]*/, '') }
      : { user: 'postgres', database: 'synqdrive', host: '/var/run/postgresql' },
  );
  await client.connect();
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  const trip = await client.query(
    `SELECT t.id, t.start_time, t.end_time, t.distance_km, t.duration_minutes, t.avg_speed_kmh, t.max_speed_kmh,
            v.organization_id, v.fuel_type, v.idle_rpm, v.max_rpm, dv.raw_json AS dimo_raw_json
     FROM vehicle_trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
     WHERE t.id = $1 AND t.vehicle_id = $2`,
    [tripId, vehicleId],
  );
  await client.query('COMMIT');
  await client.end();
  return trip.rows[0] ?? null;
}

export async function loadMultichannelTrip({
  tripId,
  vehicleId,
  linkId,
  parseHfRpmValueFloat,
  chLimit = 50000,
  channels = DEFAULT_CHANNELS,
}) {
  const signalCounts = {};
  const channelRows = [];
  for (const ch of channels) {
    const cnt = await chQuery(
      `SELECT count() AS cnt FROM telemetry_hf_points
       WHERE vehicle_id={vehicleId:String} AND trip_id={tripId:String}
         AND signal_name={signalName:String}`,
      { vehicleId, tripId, signalName: ch.signal },
    );
    const total = Number(cnt[0]?.cnt ?? 0);
    const rows = await chQuery(
      `SELECT recorded_at, value_float FROM telemetry_hf_points
       WHERE vehicle_id={vehicleId:String} AND trip_id={tripId:String}
         AND signal_name={signalName:String}
       ORDER BY recorded_at ASC LIMIT {lim:UInt32}`,
      { vehicleId, tripId, signalName: ch.signal, lim: chLimit },
    );
    signalCounts[ch.signal] = { total, returned: rows.length, truncated: rows.length < total };
    channelRows.push({ signal: ch.signal, rows });
  }

  const byMs = new Map();
  for (const { signal, rows } of channelRows) {
    const meta = channels.find((c) => c.signal === signal);
    for (const r of rows) {
      const iso = new Date(r.recorded_at).toISOString();
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) continue;
      if (!byMs.has(ms)) {
        byMs.set(ms, { recordedAtIso: iso, tripId, providerSourceLinkId: linkId });
      }
      const row = byMs.get(ms);
      if (meta.parseRpm) {
        const v = parseHfRpmValueFloat(r.value_float);
        if (v != null) row.rpm = v;
      } else {
        const v = r.value_float == null ? null : Number(r.value_float);
        if (v != null) row[meta.field] = v;
      }
    }
  }
  const multichannelObservations = [...byMs.values()].sort(
    (a, b) => Date.parse(a.recordedAtIso) - Date.parse(b.recordedAtIso),
  );
  const rpmRows = channelRows.find((c) => c.signal === 'powertrainCombustionEngineSpeed')?.rows ?? [];
  const rpmPoints = rpmRows
    .map((r) => {
      const v = parseHfRpmValueFloat(r.value_float);
      if (v == null) return null;
      return { recordedAtIso: new Date(r.recorded_at).toISOString(), valueRpm: v };
    })
    .filter(Boolean);

  return { signalCounts, multichannelObservations, rpmPoints, channelRows };
}

export function buildRealV1aTripInput({
  libs,
  orgId,
  vehicleId,
  tripId,
  linkId,
  tripStartIso,
  tripEndIso,
  rpmPoints,
  chTotals,
  tierOverrides,
}) {
  const intervals = rpmIntervals(rpmPoints);
  const tripDurSec = Math.max(1, (Date.parse(tripEndIso) - Date.parse(tripStartIso)) / 1000);
  const tierRow = libs.buildTierTripClassification({
    tier: 'RPM_1S',
    tripId,
    endMs: Date.parse(tripEndIso),
    cadenceConfidence: 'HIGH',
    tripCoverageBand: 'LIMITED_TRIP',
    analysisReadiness: 'TIER_ANALYTICS_OK',
    decisionCode: 'TIER_ASSIGNED',
    intervalEvidenceUsed: {
      rpmPointCount: rpmPoints.length,
      activeIntervalCount: Math.max(0, rpmPoints.length - 1),
      tripDurationSeconds: tripDurSec,
    },
    p50ActiveSeconds: percentile(intervals, 0.5) ?? 1,
    p75ActiveSeconds: percentile(intervals, 0.75) ?? 1,
    p90ActiveSeconds: percentile(intervals, 0.9) ?? 2,
    activeSpanRatio: rpmPoints.length / tripDurSec,
    activeDensityVsTier: tierOverrides?.activeDensityVsTier ?? rpmPoints.length / tripDurSec,
    tierPuritySharePlusOne: tierOverrides?.tierPuritySharePlusOne ?? null,
    longestSequenceIntervals: tierOverrides?.longestSequenceIntervals ?? Math.min(200, intervals.length),
  });

  const snapshot = {
    contractVersion: libs.VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION,
    evaluatedTripIds: [tripId],
    tripClassifications: [{ ...tierRow, tripId, endMs: Date.parse(tripEndIso) }],
    rollingVehicleTierSummary: {
      tier: 'RPM_1S',
      agreementRatio: null,
      classificationDecisionCode: 'SINGLE_TRIP_CH_BRIDGE',
      classificationDecisionSummary: 'single-trip read-only CH bridge — not rolling vehicle quorum',
      sufficientEvidence: false,
    },
    provenance: ['clickhouse_read_only_trip_bridge'],
    evidenceObservedAt: new Date().toISOString(),
  };

  const tierEvidence = {
    contractVersion: 'ds4-rpm-hf-tier-evidence-v1',
    status: 'AVAILABLE',
    tripId,
    providerSourceLinkId: linkId,
    tripClassification: { ...tierRow, tripId, endMs: Date.parse(tripEndIso) },
    blockEvidenceObservedAt: snapshot.evidenceObservedAt,
  };

  return {
    contractVersion: libs.DS4_RPM_HF_V1A_CONTRACT_VERSION,
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
      reasonSummary: 'read-only-ch-multichannel-bridge',
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
        intervalMedianSeconds: percentile(intervals, 0.5),
        intervalP95Seconds: percentile(intervals, 0.95),
        minIntervalSeconds: intervals[0] ?? null,
        maxIntervalSeconds: intervals[intervals.length - 1] ?? null,
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

export function buildPowertrainResearchInput({
  libs,
  orgId,
  vehicleId,
  tripId,
  linkId,
  dimoRaw,
  tripInput,
  multichannelObservations,
  fuelType,
}) {
  const family = libs.resolveTelemetrySourceFamily(dimoRaw) ?? 'UNKNOWN';
  const v1bOut = libs.processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: new Date(),
    existingSucceededFingerprint: null,
  });
  if (v1bOut.kind !== 'SUCCEEDED') {
    return { ok: false, blocker: v1bOut.kind, family };
  }

  const canon = libs.canonicalizeMultichannelObservations(multichannelObservations);
  const mcFp = libs.computeMultichannelContentFingerprint({
    organizationId: orgId,
    vehicleId,
    tripId,
    providerSourceLinkId: linkId,
    telemetrySourceFamily: family,
    observations: multichannelObservations,
  });

  const manifest = {
    manifestVersion: libs.DS4_MULTICHANNEL_MANIFEST_VERSION,
    organizationId: orgId,
    vehicleId,
    tripId,
    providerSourceLinkId: linkId,
    telemetrySourceFamily: family,
    r1SnapshotVersion: family === 'RUPTELA_R1' ? libs.DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 : null,
    channels: libs.buildManifestChannelExpectations(canon),
    expectedMultichannelFingerprint: mcFp,
    independentFieldValidation: false,
  };

  const researchInput = {
    contractVersion: libs.DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: 'SYNTHETIC_FIXTURE',
    sourceBundleId: null,
    organizationId: orgId,
    vehicleId,
    tripId,
    providerSourceLinkId: linkId,
    dimoVehicleRawJson: dimoRaw,
    tripInput,
    v1bResult: v1bOut.result,
    multichannelObservations,
    multichannelManifest: manifest,
    multichannelFingerprint: mcFp,
    fuelType: fuelType ?? 'GASOLINE',
    isEvPowertrain: false,
    declaredIceOperationConfirmed: null,
  };

  return {
    ok: true,
    researchInput,
    v1bOut,
    family,
    canon,
    mcFp,
    manifest,
    provenance: {
      clickHouseRealData: true,
      contractEvidenceOrigin: 'SYNTHETIC_FIXTURE',
      limitation:
        'Real CH multichannel replay; SYNTHETIC_FIXTURE avoids forged OFFLINE attestation. COMPUTED ≠ field-validated product assessment.',
      telemetrySourceFamily: family,
      multichannelFingerprint: mcFp,
      timestampAuthority: 'BUCKET_LABEL_UNVERIFIED',
    },
  };
}
