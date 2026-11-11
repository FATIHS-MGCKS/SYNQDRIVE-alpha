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
    resolveTierEvidenceForTrip: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/ds4-rpm-hf-v1b-tier-evidence.util.ts',
      ),
    ).resolveTierEvidenceForTrip,
    readEngineRpmCadenceFromSignalsSnapshot: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a-profile.reader.ts',
      ),
    ).readEngineRpmCadenceFromSignalsSnapshot,
    resolveDs4RpmHfV1aAdmission: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a-admission.ts',
      ),
    ).resolveDs4RpmHfV1aAdmission,
    resolveTripRpmProfileFromVsi: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a-admission.ts',
      ),
    ).resolveTripRpmProfileFromVsi,
    resolveIceRpmApplicability: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence-stats.util.ts',
      ),
    ).resolveIceRpmApplicability,
    DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/ds4-rpm-hf-v1b.contract.ts',
      ),
    ).DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
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

export async function loadEvidenceFromPostgres({ orgId, vehicleId, tripId, linkId, libs }) {
  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL.replace(/\?schema=[^&]*/, '') }
      : { user: 'postgres', database: 'synqdrive', host: '/var/run/postgresql' },
  );
  await client.connect();
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  const vsi = await client.query(
    `SELECT signals_snapshot, recorded_at FROM vehicle_signal_capability_profile_revisions
     WHERE organization_id = $1 AND vehicle_id = $2 AND provider_source_link_id = $3
     ORDER BY recorded_at DESC LIMIT 1`,
    [orgId, vehicleId, linkId],
  );
  const v1b = await client.query(
    `SELECT summary_json, input_fingerprint, shadow_status, computed_at
     FROM ds4_rpm_hf_v1b_shadow_runs_v1
     WHERE organization_id = $1 AND trip_id = $2 AND engine_version = $3 AND shadow_status = 'SUCCEEDED'
     ORDER BY computed_at DESC LIMIT 1`,
    [orgId, tripId, libs.DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE],
  );
  await client.query('COMMIT');
  await client.end();
  return {
    vsiRevision: vsi.rows[0] ?? null,
    v1bPersistedRun: v1b.rows[0] ?? null,
  };
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
  fuelType,
  vsiSignalsSnapshot,
}) {
  const intervals = rpmIntervals(rpmPoints);
  const vsiParsed = vsiSignalsSnapshot
    ? libs.readEngineRpmCadenceFromSignalsSnapshot(vsiSignalsSnapshot)
    : { cadence: null, activeRpmProfile: null, rpmCadenceTierResolution: null };

  const rpmCadenceTierSnapshot = vsiParsed.rpmCadenceTierResolution;
  const activeRpmProfileSnapshot = vsiParsed.activeRpmProfile;
  const iceRpmApplicability = libs.resolveIceRpmApplicability(fuelType);
  const tripRpmProfile = libs.resolveTripRpmProfileFromVsi({
    tripId,
    tripClassifications: activeRpmProfileSnapshot?.tripClassifications ?? [],
  });
  const hfDataPresent = rpmPoints.length > 0;
  const hfReadComplete = chTotals.returned >= chTotals.total;

  const admission = libs.resolveDs4RpmHfV1aAdmission({
    iceRpmApplicability,
    tripId,
    tripRpmProfile,
    vehicleActiveRpmProfile: activeRpmProfileSnapshot?.activeProfile ?? null,
    hfDataPresent,
    chReadAvailable: true,
    tenantScopeViolation: false,
    hfReadComplete,
  });

  const tierEvidence = libs.resolveTierEvidenceForTrip({
    tripId,
    tripEndIso,
    providerSourceLinkId: linkId,
    tierSnapshot: rpmCadenceTierSnapshot,
    hfReadComplete,
    hfDataPresent,
  });

  return {
    contractVersion: libs.DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: orgId,
    vehicleId,
    tripId,
    providerSourceLinkId: linkId,
    tripStartIso,
    tripEndIso,
    admission,
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
    vsiActiveRpmProfileSnapshot: activeRpmProfileSnapshot,
    vsiRpmCadenceTierSnapshot: rpmCadenceTierSnapshot,
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
  v1bPersistedRun,
}) {
  const family = libs.resolveTelemetrySourceFamily(dimoRaw) ?? 'UNKNOWN';
  let v1bSource = 'NONE';
  let v1bResult = null;
  let v1bOut = null;

  if (v1bPersistedRun?.summary_json && v1bPersistedRun.shadow_status === 'SUCCEEDED') {
    v1bResult = v1bPersistedRun.summary_json;
    v1bSource = 'PERSISTED_V1B_SHADOW_RUN';
  } else if (tripInput.tierEvidence?.status === 'AVAILABLE' && tripInput.admission.processingAllowed) {
    v1bOut = libs.processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: new Date(),
      existingSucceededFingerprint: null,
    });
    if (v1bOut.kind === 'SUCCEEDED') {
      v1bResult = v1bOut.result;
      v1bSource = 'LIVE_TIER_AWARE_PROCESSOR';
    }
  }

  if (!v1bResult) {
    return {
      ok: false,
      blocker: v1bOut?.kind ?? 'V1B_EVIDENCE_UNAVAILABLE',
      v1bSource,
      family,
      tripInput,
      tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
      admissionProcessingAllowed: tripInput.admission.processingAllowed,
    };
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
    v1bResult,
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
    v1bSource,
    provenance: {
      clickHouseRealData: true,
      contractEvidenceOrigin: 'SYNTHETIC_FIXTURE',
      v1bEvidenceSource: v1bSource,
      v1bPersistedFingerprint: v1bPersistedRun?.input_fingerprint ?? null,
      limitation:
        'Real CH multichannel replay; SYNTHETIC_FIXTURE enum only satisfies binding without forged OFFLINE attestation. Kernel COMPUTED ≠ product field validation.',
      telemetrySourceFamily: family,
      multichannelFingerprint: mcFp,
      timestampAuthority: 'BUCKET_LABEL_UNVERIFIED',
      tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
    },
  };
}
