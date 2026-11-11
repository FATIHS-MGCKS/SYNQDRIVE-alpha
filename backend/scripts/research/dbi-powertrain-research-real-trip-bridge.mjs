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
    buildDs4RpmHfV1aDataQuality: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1a/ds4-rpm-hf-v1a-data-quality.ts',
      ),
    ).buildDs4RpmHfV1aDataQuality,
    computeDs4RpmHfV1bTierAwareInputFingerprint: require(
      join(
        backendRoot,
        'src/modules/vehicle-intelligence/driving-intelligence/rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint.ts',
      ),
    ).computeDs4RpmHfV1bTierAwareInputFingerprint,
    HF_TRIP_RPM_DEFAULT_READ_LIMIT: require(
      join(backendRoot, 'src/modules/clickhouse/clickhouse-hf.service.ts'),
    ).HF_TRIP_RPM_DEFAULT_READ_LIMIT,
    toChDateTimeParam: require(join(backendRoot, 'src/modules/clickhouse/clickhouse-hf.service.ts'))
      .toChDateTimeParam,
    parseChUtc: require(join(backendRoot, 'src/modules/clickhouse/clickhouse-hf.service.ts')).parseChUtc,
    HF_POINTS_TABLE: 'telemetry_hf_points',
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

function scanVsiSnapshotForTrip(signalsSnapshot, tripId, libs) {
  if (!signalsSnapshot) {
    return {
      tripInActive: null,
      tripInTier: null,
      activeTripCount: 0,
      tierTripCount: 0,
    };
  }
  const parsed = libs.readEngineRpmCadenceFromSignalsSnapshot(signalsSnapshot);
  const activeTrips = parsed.activeRpmProfile?.tripClassifications ?? [];
  const tierTrips = parsed.rpmCadenceTierResolution?.tripClassifications ?? [];
  return {
    tripInActive: activeTrips.find((t) => t.tripId === tripId) ?? null,
    tripInTier: tierTrips.find((t) => t.tripId === tripId) ?? null,
    activeTripCount: activeTrips.length,
    tierTripCount: tierTrips.length,
    activeProfile: parsed.activeRpmProfile?.activeProfile ?? null,
  };
}

async function loadVsiRevisionContainingTrip(client, { orgId, vehicleId, linkId, tripId, notAfter }) {
  const res = await client.query(
    `SELECT signals_snapshot, recorded_at, profile_revision, evaluated_at
     FROM vehicle_signal_capability_profile_revisions
     WHERE organization_id = $1 AND vehicle_id = $2 AND provider_source_link_id = $3
       AND signals_snapshot::text LIKE $4
       AND ($5::timestamptz IS NULL OR recorded_at <= $5)
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [orgId, vehicleId, linkId, `%${tripId}%`, notAfter],
  );
  return res.rows[0] ?? null;
}

export async function loadEvidenceFromPostgres({
  orgId,
  vehicleId,
  tripId,
  linkId,
  tripEndIso,
  libs,
}) {
  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL.replace(/\?schema=[^&]*/, '') }
      : { user: 'postgres', database: 'synqdrive', host: '/var/run/postgresql' },
  );
  await client.connect();
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  const vsiCurrent = await client.query(
    `SELECT signals_snapshot, evaluated_at, profile_revision, updated_at FROM vehicle_signal_capability_profiles
     WHERE organization_id = $1 AND vehicle_id = $2 AND provider_source_link_id = $3`,
    [orgId, vehicleId, linkId],
  );
  const vsiRevisionLatest = await client.query(
    `SELECT signals_snapshot, recorded_at, profile_revision FROM vehicle_signal_capability_profile_revisions
     WHERE organization_id = $1 AND vehicle_id = $2 AND provider_source_link_id = $3
     ORDER BY recorded_at DESC LIMIT 1`,
    [orgId, vehicleId, linkId],
  );
  const revisionScan = await client.query(
    `SELECT signals_snapshot, recorded_at, profile_revision FROM vehicle_signal_capability_profile_revisions
     WHERE organization_id = $1 AND vehicle_id = $2 AND provider_source_link_id = $3
     ORDER BY recorded_at DESC LIMIT 40`,
    [orgId, vehicleId, linkId],
  );
  const v1b = await client.query(
    `SELECT summary_json, input_fingerprint, shadow_status, computed_at
     FROM ds4_rpm_hf_v1b_shadow_runs_v1
     WHERE organization_id = $1 AND trip_id = $2 AND engine_version = $3 AND shadow_status = 'SUCCEEDED'
     ORDER BY computed_at DESC LIMIT 1`,
    [orgId, tripId, libs.DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE],
  );

  const currentRow = vsiCurrent.rows[0] ?? null;
  const latestRevisionRow = vsiRevisionLatest.rows[0] ?? null;
  const currentScan = scanVsiSnapshotForTrip(currentRow?.signals_snapshot, tripId, libs);
  const latestRevisionScan = scanVsiSnapshotForTrip(latestRevisionRow?.signals_snapshot, tripId, libs);

  const v1bPersistedRun = v1b.rows[0] ?? null;
  const decisionNotAfter =
    v1bPersistedRun?.computed_at ??
    (tripEndIso ? new Date(tripEndIso) : null);

  let decisionTimeRevision = null;
  if (!(currentScan.tripInActive && currentScan.tripInTier)) {
    decisionTimeRevision = await loadVsiRevisionContainingTrip(client, {
      orgId,
      vehicleId,
      linkId,
      tripId,
      notAfter: decisionNotAfter,
    });
  }

  await client.query('COMMIT');
  await client.end();

  const revisionsWithTrip = revisionScan.rows
    .map((r) => ({
      profileRevision: r.profile_revision,
      recordedAt: r.recorded_at,
      ...scanVsiSnapshotForTrip(r.signals_snapshot, tripId, libs),
    }))
    .filter((r) => r.tripInActive || r.tripInTier);

  const decisionScan = scanVsiSnapshotForTrip(decisionTimeRevision?.signals_snapshot, tripId, libs);

  let vsiSignalsSnapshot =
    currentScan.tripInActive || currentScan.tripInTier
      ? currentRow?.signals_snapshot
      : decisionTimeRevision?.signals_snapshot ??
        currentRow?.signals_snapshot ??
        latestRevisionRow?.signals_snapshot ??
        null;

  let vsiSource = 'MISSING';
  if (vsiSignalsSnapshot === currentRow?.signals_snapshot && currentScan.tripInActive) {
    vsiSource = 'vehicle_signal_capability_profiles';
  } else if (vsiSignalsSnapshot === decisionTimeRevision?.signals_snapshot) {
    vsiSource = 'vehicle_signal_capability_profile_revisions_decision_time';
  } else if (currentRow?.signals_snapshot) {
    vsiSource = 'vehicle_signal_capability_profiles_without_trip_binding';
  } else if (latestRevisionRow?.signals_snapshot) {
    vsiSource = 'vehicle_signal_capability_profile_revisions_latest_fallback';
  }

  return {
    vsiCurrentProfile: currentRow,
    vsiRevisionLatest: latestRevisionRow,
    vsiDecisionTimeRevision: decisionTimeRevision,
    vsiSignalsSnapshot,
    vsiSource,
    vsiDiagnostic: {
      currentScan,
      latestRevisionScan,
      decisionTimeScan: decisionScan,
      decisionNotAfter: decisionNotAfter ? new Date(decisionNotAfter).toISOString() : null,
      revisionsWithTripBinding: revisionsWithTrip.slice(0, 8),
      rootCauseHint:
        currentScan.tripInActive || decisionScan.tripInActive
          ? currentScan.tripInActive
            ? null
            : 'ROLLING_VSI_WINDOW_EVICTED_TRIP_USE_DECISION_TIME_REVISION'
          : 'TRIP_ABSENT_FROM_activeRpmProfile_tripClassifications_IN_CURRENT_AND_DECISION_TIME_REVISION',
      tierRootCauseHint:
        currentScan.tripInTier || decisionScan.tripInTier
          ? currentScan.tripInTier
            ? null
            : 'TIER_ROW_EVICTED_FROM_ROLLING_WINDOW_USE_DECISION_TIME_REVISION'
          : 'TRIP_ABSENT_FROM_rpmCadenceTierResolution_tripClassifications',
    },
    /** @deprecated use vsiCurrentProfile / vsiSignalsSnapshot */
    vsiRevision: latestRevisionRow,
    v1bPersistedRun: v1b.rows[0] ?? null,
  };
}

/**
 * Production-aligned trip RPM HF read (org scope, trip time window, default limit 12_000).
 */
export async function loadCanonicalTripRpmHfPoints({ orgId, vehicleId, tripId, tripStart, tripEnd, libs }) {
  const signalName = 'powertrainCombustionEngineSpeed';
  const limit = libs.HF_TRIP_RPM_DEFAULT_READ_LIMIT;
  const offset = 0;
  const table = libs.HF_POINTS_TABLE;
  const fromParam = libs.toChDateTimeParam(tripStart);
  const toParam = libs.toChDateTimeParam(tripEnd);

  const countRows = await chQuery(
    `SELECT count() AS cnt FROM ${table}
     WHERE org_id={orgId:String} AND vehicle_id={vehicleId:String} AND trip_id={tripId:String}
       AND signal_name={signalName:String}
       AND recorded_at >= parseDateTime64BestEffort({from:String})
       AND recorded_at <= parseDateTime64BestEffort({to:String})`,
    { orgId, vehicleId, tripId, signalName, from: fromParam, to: toParam },
  );
  const totalMatchingCount = Number(countRows[0]?.cnt ?? 0);

  if (totalMatchingCount === 0) {
    return {
      status: 'EMPTY',
      available: true,
      points: [],
      totalMatchingCount: 0,
      returnedCount: 0,
      rawRowsReturned: 0,
      completenessStatus: 'EMPTY',
      duplicateTimestampCount: 0,
      invalidValueCount: 0,
      tenantScopeViolation: false,
      limit,
      offset,
    };
  }

  const rows = await chQuery(
    `SELECT org_id, vehicle_id, trip_id, recorded_at, value_float
     FROM ${table}
     WHERE org_id={orgId:String} AND vehicle_id={vehicleId:String} AND trip_id={tripId:String}
       AND signal_name={signalName:String}
       AND recorded_at >= parseDateTime64BestEffort({from:String})
       AND recorded_at <= parseDateTime64BestEffort({to:String})
     ORDER BY recorded_at ASC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    { orgId, vehicleId, tripId, signalName, from: fromParam, to: toParam, limit, offset },
  );

  let invalidValueCount = 0;
  const seenTimestamps = new Map();
  const points = [];

  for (const r of rows) {
    if (r.org_id !== orgId || r.vehicle_id !== vehicleId || r.trip_id !== tripId) {
      return {
        status: 'TENANT_SCOPE_VIOLATION',
        available: true,
        points: [],
        totalMatchingCount,
        returnedCount: 0,
        rawRowsReturned: rows.length,
        completenessStatus: 'COMPLETE',
        duplicateTimestampCount: 0,
        invalidValueCount: 0,
        tenantScopeViolation: true,
        limit,
        offset,
      };
    }
    const iso = libs.parseChUtc(r.recorded_at);
    if (!iso) {
      invalidValueCount += 1;
      continue;
    }
    const recordedAtMs = Date.parse(iso);
    const valueRpm = libs.parseHfRpmValueFloat(r.value_float);
    if (valueRpm == null) {
      invalidValueCount += 1;
      continue;
    }
    seenTimestamps.set(recordedAtMs, (seenTimestamps.get(recordedAtMs) ?? 0) + 1);
    points.push({ recordedAtMs, recordedAtIso: iso, valueRpm });
  }

  let duplicateTimestampCount = 0;
  for (const c of seenTimestamps.values()) {
    if (c > 1) duplicateTimestampCount += c - 1;
  }

  const rawRowsReturned = rows.length;
  const completenessStatus =
    totalMatchingCount > offset + rawRowsReturned ? 'INCOMPLETE_MORE_POINTS_AVAILABLE' : 'COMPLETE';

  return {
    status: 'SUCCESS',
    available: true,
    points,
    totalMatchingCount,
    returnedCount: points.length,
    rawRowsReturned,
    completenessStatus,
    duplicateTimestampCount,
    invalidValueCount,
    tenantScopeViolation: false,
    limit,
    offset,
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
  canonicalRpmRead,
  fuelType,
  vsiSignalsSnapshot,
}) {
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

  const read = canonicalRpmRead
    ? {
        status: canonicalRpmRead.status,
        available: canonicalRpmRead.available,
        totalMatchingCount: canonicalRpmRead.totalMatchingCount,
        returnedCount: canonicalRpmRead.returnedCount,
        completenessStatus: canonicalRpmRead.completenessStatus,
        duplicateTimestampCount: canonicalRpmRead.duplicateTimestampCount,
        invalidValueCount: canonicalRpmRead.invalidValueCount,
        limit: canonicalRpmRead.limit,
        offset: canonicalRpmRead.offset,
        tenantScopeViolation: canonicalRpmRead.tenantScopeViolation,
      }
    : null;

  const hfReadComplete =
    read != null &&
    read.status === 'SUCCESS' &&
    read.completenessStatus === 'COMPLETE' &&
    read.offset === 0;
  const hfDataPresent =
    read != null && read.available && read.status === 'SUCCESS' && read.returnedCount > 0;
  const chReadAvailable =
    read != null &&
    read.status !== 'UNAVAILABLE' &&
    read.status !== 'QUERY_FAILED' &&
    read.status !== 'TENANT_SCOPE_VIOLATION';

  const admission = libs.resolveDs4RpmHfV1aAdmission({
    iceRpmApplicability,
    tripId,
    tripRpmProfile,
    vehicleActiveRpmProfile: activeRpmProfileSnapshot?.activeProfile ?? null,
    hfDataPresent,
    chReadAvailable,
    tenantScopeViolation: read?.tenantScopeViolation ?? false,
    hfReadComplete,
  });

  const rpmPointRows = admission.processingAllowed && read?.status === 'SUCCESS' ? canonicalRpmRead.points : [];
  const dataQuality = libs.buildDs4RpmHfV1aDataQuality({ read, points: rpmPointRows });

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
    dataQuality,
    clickHouseRead: {
      status: read?.status ?? 'UNAVAILABLE',
      available: read?.available ?? false,
      degradedReason: null,
      tenantScopeViolation: read?.tenantScopeViolation ?? false,
    },
    rpmPoints: rpmPointRows.map((p) => ({ recordedAtIso: p.recordedAtIso, valueRpm: p.valueRpm })),
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

  let v1bFingerprintDiagnosis = null;

  if (v1bPersistedRun?.summary_json && v1bPersistedRun.shadow_status === 'SUCCEEDED') {
    const expectedFingerprint = libs.computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
    const persistedFingerprint = v1bPersistedRun.input_fingerprint ?? '';
    if (persistedFingerprint === expectedFingerprint) {
      v1bResult = {
        ...v1bPersistedRun.summary_json,
        inputFingerprint: persistedFingerprint,
      };
      v1bSource = 'PERSISTED_V1B_SHADOW_RUN';
    } else {
      v1bFingerprintDiagnosis = {
        reason: 'V1B_INPUT_FINGERPRINT_MISMATCH',
        expectedFingerprint,
        persistedFingerprint,
        persistedComputedAt: v1bPersistedRun.computed_at ?? null,
        tripInputDigestFields: {
          rpmPointCount: tripInput.rpmPoints.length,
          completenessLabel: tripInput.dataQuality.completenessLabel,
          tripRpmProfile: tripInput.admission.tripRpmProfile,
          tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
        },
      };
    }
  }

  if (
    !v1bResult &&
    tripInput.tierEvidence?.status === 'AVAILABLE' &&
    tripInput.admission.processingAllowed
  ) {
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
      blocker:
        v1bFingerprintDiagnosis?.reason ??
        v1bOut?.kind ??
        (tripInput.admission.processingAllowed ? 'V1B_EVIDENCE_UNAVAILABLE' : 'TRIP_ADMISSION_NOT_ALLOWED'),
      v1bSource,
      family,
      tripInput,
      tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
      admissionProcessingAllowed: tripInput.admission.processingAllowed,
      v1bFingerprintDiagnosis,
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
      tripRpmReader: 'canonical_getTripRpmHfPoints_aligned',
      vsiProfileSource: 'vehicle_signal_capability_profiles_preferred',
      contractEvidenceOrigin: 'SYNTHETIC_FIXTURE',
      v1bEvidenceSource: v1bSource,
      v1bPersistedFingerprint: v1bPersistedRun?.input_fingerprint ?? null,
      v1bRecomputedFingerprint: libs.computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput),
      v1bFingerprintDiagnosis,
      limitation:
        'Real CH multichannel replay; SYNTHETIC_FIXTURE enum only satisfies binding without forged OFFLINE attestation. Kernel COMPUTED ≠ product field validation.',
      telemetrySourceFamily: family,
      multichannelFingerprint: mcFp,
      timestampAuthority: 'BUCKET_LABEL_UNVERIFIED',
      tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
    },
  };
}
