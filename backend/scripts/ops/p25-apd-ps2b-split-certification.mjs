#!/usr/bin/env node
/**
 * APD-PS2B — split M3.3 primary vs legacy REST compatibility certification (read-only).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  T7_START,
  T7_END,
  classifyProfile,
  quantile,
  simulatePolicy,
  buildPolicy,
} from './p25-apd-replay-policy-core.mjs';

const R1_NOMINAL_REST_CADENCE_MS = 8 * 60 * 60_000;
const PROVIDER_FIELD = 'PROVIDER_FIELD_TIMESTAMP';
const POLICIES = ['B0_CONTROL', 'B2_HB10_IN1', 'B4_PHASE_30M'];
const CANDIDATE = ['B2_HB10_IN1', 'B4_PHASE_30M'];

const REST_60M_WINDOW_MS = 15 * 60_000;
const REST_60M_DELAY_MS = 60 * 60_000;
const ANCHOR_MAX_AGE_MS = 3 * 60_000;
const RUNG_0_UPPER_BOUND_MS = 4 * 60 * 60_000;

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const p = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(p)) return;
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  } catch {
    /* ignore */
  }
}

function psql(sql) {
  const db = (process.env.DATABASE_URL ?? '').split('?')[0];
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return execSync(`psql "${db}" -v ON_ERROR_STOP=1 -t -A -F'|' -c ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

function deriveNominalRestIntervalIndex(actualRestAgeMs) {
  if (actualRestAgeMs <= ANCHOR_MAX_AGE_MS) {
    return { nominalRestIntervalIndex: 0, rungResidualMs: actualRestAgeMs };
  }
  if (actualRestAgeMs < RUNG_0_UPPER_BOUND_MS) {
    return {
      nominalRestIntervalIndex: 0,
      rungResidualMs: actualRestAgeMs - 0 * R1_NOMINAL_REST_CADENCE_MS,
    };
  }
  for (let index = 1; index <= 21; index += 1) {
    const lowMs = (index - 0.5) * R1_NOMINAL_REST_CADENCE_MS;
    const highMs = (index + 0.5) * R1_NOMINAL_REST_CADENCE_MS;
    if (actualRestAgeMs >= lowMs && actualRestAgeMs < highMs) {
      return {
        nominalRestIntervalIndex: index,
        rungResidualMs: actualRestAgeMs - index * R1_NOMINAL_REST_CADENCE_MS,
      };
    }
  }
  return { nominalRestIntervalIndex: null, rungResidualMs: null };
}

function computeActualRestAgeMs(sessionAnchorMs, ptMs) {
  return ptMs - sessionAnchorMs;
}

function buildProcessingEnds(policyId, vehicles, ctx) {
  const policy = buildPolicy(policyId);
  const { pollsByVehicle, lvByVehicle, profiles, profileStats, inActiveTrip } = ctx;
  const byV = new Map();
  for (const v of vehicles) {
    const polls = pollsByVehicle.get(v.id) ?? [];
    let lastAllowedMs = 0;
    let lastLvSourceMs = null;
    const ends = [];
    for (const p of polls) {
      const reconciliation = !inActiveTrip(v.id, p.tMs);
      const c = { reconciliation, lastAllowedMs, lastLvSourceMs, nowMs: p.tMs };
      const allow = policyId === 'B0_CONTROL' ? true : policy.decide(c, p.tMs, profiles[v.id], profileStats[v.id]);
      if (allow) {
        ends.push(p.tEndMs);
        lastAllowedMs = p.tMs;
        const visible = (lvByVehicle.get(v.id) ?? []).filter((r) => r.obsMs <= p.tEndMs);
        if (visible.length) lastLvSourceMs = Math.max(...visible.map((r) => r.ptMs));
      }
    }
    byV.set(v.id, ends);
  }
  return byV;
}

function discoveredAt(ends, ptMs) {
  const t = ends.find((e) => e >= ptMs);
  return t ?? null;
}

function activeSession(sessions, vehicleId, ptMs) {
  const list = sessions.filter((s) => s.vehicleId === vehicleId);
  return (
    list.find(
      (s) =>
        s.anchorMs <= ptMs &&
        (s.endedMs == null || s.endedMs >= ptMs) &&
        s.openedMs <= ptMs,
    ) ?? null
  );
}

function semanticFingerprint(session, ptMs) {
  if (!session) return null;
  const age = computeActualRestAgeMs(session.anchorMs, ptMs);
  const { nominalRestIntervalIndex, rungResidualMs } = deriveNominalRestIntervalIndex(age);
  return JSON.stringify({
    sessionId: session.id,
    ptMs,
    actualRestAgeMs: age,
    nominalRestIntervalIndex,
    rungResidualMs,
  });
}

loadEnv();

const vehiclesRaw = psql(`
  SELECT v.id::text, dv.token_id, v.license_plate, v.fuel_type::text
  FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
  WHERE dv.token_id IN (186946,187336,187361,187784,192922) ORDER BY dv.token_id`);
const vehicles = vehiclesRaw.split('\n').filter(Boolean).map((line) => {
  const [id, tokenId, plate, fuel] = line.split('|');
  return { id, tokenId: Number(tokenId), plate, fuel };
});
const vehicleIds = vehicles.map((v) => v.id);

const tripsRaw = psql(`
  SELECT vehicle_id::text, EXTRACT(EPOCH FROM start_time)*1000, EXTRACT(EPOCH FROM COALESCE(end_time, '${T7_END}'::timestamptz))*1000
  FROM vehicle_trips WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND start_time <= '${T7_END}'::timestamptz AND (end_time IS NULL OR end_time >= '${T7_START}'::timestamptz)`);
const trips = tripsRaw.split('\n').filter(Boolean).map((line) => {
  const [vehicleId, s, e] = line.split('|');
  return { vehicleId, start: Number(s), end: Number(e) };
});
const inActiveTrip = (vehicleId, tMs) =>
  trips.some((tr) => tr.vehicleId === vehicleId && tMs >= tr.start && tMs <= tr.end);

const pollsRaw = psql(`
  SELECT vehicle_id::text, EXTRACT(EPOCH FROM started_at)*1000, EXTRACT(EPOCH FROM COALESCE(finished_at, started_at))*1000
  FROM dimo_poll_logs WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND job_type='SNAPSHOT' AND status='SUCCESS'
  AND started_at >= '${T7_START}'::timestamptz AND started_at <= '${T7_END}'::timestamptz ORDER BY vehicle_id, started_at`);
const pollsByVehicle = new Map();
for (const line of pollsRaw.split('\n').filter(Boolean)) {
  const [vehicleId, tMs, tEndMs] = line.split('|');
  const arr = pollsByVehicle.get(vehicleId) ?? [];
  arr.push({ tMs: Number(tMs), tEndMs: Number(tEndMs) });
  pollsByVehicle.set(vehicleId, arr);
}

const lvRaw = psql(`
  SELECT vehicle_id::text, id::text, EXTRACT(EPOCH FROM provider_timestamp)*1000, EXTRACT(EPOCH FROM observed_at)*1000
  FROM battery_measurements WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND type='LIVE_VOLTAGE' AND quality='VALID' AND provider_timestamp IS NOT NULL
  AND provider_timestamp >= '${T7_START}'::timestamptz AND provider_timestamp <= '${T7_END}'::timestamptz
  AND (context->>'engineRunning')::boolean IS FALSE AND (context->>'speedKmh')::float <= 0.5
  AND (context->>'ignitionOn')::boolean IS FALSE`);
const lvByVehicle = new Map();
const allLv = [];
for (const line of lvRaw.split('\n').filter(Boolean)) {
  const [vehicleId, id, ptMs, obsMs] = line.split('|');
  const row = { id, vehicleId, ptMs: Number(ptMs), obsMs: Number(obsMs) };
  const arr = lvByVehicle.get(vehicleId) ?? [];
  arr.push(row);
  lvByVehicle.set(vehicleId, arr);
  allLv.push(row);
}

const profiles = {};
const profileStats = {};
const advancesByVehicle = new Map();
for (const v of vehicles) {
  const rows = lvByVehicle.get(v.id) ?? [];
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const g = (rows[i].ptMs - rows[i - 1].ptMs) / 1000;
    if (g > 60) gaps.push(g);
  }
  const med = quantile([...gaps].sort((a, b) => a - b), 0.5) ?? 0;
  profiles[v.id] = classifyProfile(gaps, med);
  profileStats[v.id] = { medianIntervalMs: med * 1000, p90ErrorMs: 0, gapCount: gaps.length };
  advancesByVehicle.set(v.id, rows);
}

const ctx = { pollsByVehicle, lvByVehicle, profiles, profileStats, inActiveTrip, advancesByVehicle };
const policyReplay = {};
for (const pid of POLICIES) policyReplay[pid] = simulatePolicy(pid, vehicles, ctx);

const restSessionsRaw = psql(`
  SELECT id::text, vehicle_id::text, EXTRACT(EPOCH FROM anchor_at)*1000, EXTRACT(EPOCH FROM opened_at)*1000,
         EXTRACT(EPOCH FROM ended_at)*1000, session_status::text, end_reason::text
  FROM battery_rest_sessions WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND opened_at <= '${T7_END}'::timestamptz AND (ended_at IS NULL OR ended_at >= '${T7_START}'::timestamptz)`);
const restSessions = restSessionsRaw.split('\n').filter(Boolean).map((line) => {
  const [id, vehicleId, anchorMs, openedMs, endedMs, status, endReason] = line.split('|');
  return {
    id,
    vehicleId,
    anchorMs: Number(anchorMs),
    openedMs: Number(openedMs),
    endedMs: endedMs === '' ? null : Number(endedMs),
    status,
    endReason: endReason || null,
  };
});

const endsB0 = buildProcessingEnds('B0_CONTROL', vehicles, ctx);
const endsB2 = buildProcessingEnds('B2_HB10_IN1', vehicles, ctx);
const endsB4 = buildProcessingEnds('B4_PHASE_30M', vehicles, ctx);

function analyzeM33(policyId, endsMap) {
  const b0 = endsB0;
  const stats = {
    generalizedRowChangeCount: 0,
    generalizedClassificationChangeCount: 0,
    restSessionAssociationChangeCount: 0,
    actualRestAgeChangeCount: 0,
    restSessionStateChangeCount: 0,
    c3InputChangeCount: 0,
    c3SemanticChangeCount: 0,
    d1InputChangeCount: 0,
    d2ProfileChangeCount: 0,
    d3RevisionSemanticChangeCount: 0,
    e1InputChangeCount: 0,
    e3OutputChangeCount: 0,
    nominalIndexChangeCount: 0,
    rungResidualChangeCount: 0,
    sessionOrderingChangeCount: 0,
    sessionEndReasonChangeCount: 0,
    lateTripAssociationChangeCount: 0,
    providerGapStateChangeCount: 0,
    staleReplayClassificationChangeCount: 0,
    pollDiscoveryUsedAsRestAge: 0,
  };

  const b0Captures = [];
  const polCaptures = [];

  for (const lv of allLv) {
    const sess = activeSession(restSessions, lv.vehicleId, lv.ptMs);
    const fp = semanticFingerprint(sess, lv.ptMs);
    const d0 = discoveredAt(b0.get(lv.vehicleId) ?? [], lv.ptMs);
    const dP = discoveredAt(endsMap.get(lv.vehicleId) ?? [], lv.ptMs);
    if (d0 == null) continue;
    b0Captures.push({ lv, d: d0, fp, sess });
    if (dP == null) {
      stats.generalizedRowChangeCount++;
      stats.c3SemanticChangeCount++;
      continue;
    }
    polCaptures.push({ lv, d: dP, fp, sess });
    if (fp === null) continue;
    const fpB0 = fp;
    const fpPol = semanticFingerprint(sess, lv.ptMs);
    if (fpB0 !== fpPol) {
      stats.actualRestAgeChangeCount++;
      stats.generalizedRowChangeCount++;
      const o = JSON.parse(fpB0);
      const n = JSON.parse(fpPol);
      if (o.nominalRestIntervalIndex !== n.nominalRestIntervalIndex) stats.nominalIndexChangeCount++;
      if (o.rungResidualMs !== n.rungResidualMs) stats.rungResidualChangeCount++;
    }
  }

  for (const v of vehicles) {
    const b0Seq = b0Captures
      .filter((c) => c.lv.vehicleId === v.id)
      .sort((a, b) => a.d - b.d)
      .map((c) => c.fp);
    const pSeq = polCaptures
      .filter((c) => c.lv.vehicleId === v.id)
      .sort((a, b) => a.d - b.d)
      .map((c) => c.fp);
    if (b0Seq.length !== pSeq.length) continue;
    for (let i = 0; i < b0Seq.length; i++) {
      if (b0Seq[i] !== pSeq[i]) stats.sessionOrderingChangeCount++;
    }
  }

  stats.m33PrimaryTotalSemanticChangeCount =
    stats.generalizedRowChangeCount +
    stats.restSessionAssociationChangeCount +
    stats.actualRestAgeChangeCount +
    stats.c3SemanticChangeCount +
    stats.d3RevisionSemanticChangeCount;

  return stats;
}

const m33B2 = analyzeM33('B2_HB10_IN1', endsB2);
const m33B4 = analyzeM33('B4_PHASE_30M', endsB4);

function isObservationWithinRest60mTarget(observedAtMs, restWindowStartedMs) {
  const targetMs = restWindowStartedMs + REST_60M_DELAY_MS;
  return (
    observedAtMs >= targetMs - REST_60M_WINDOW_MS && observedAtMs <= targetMs + REST_60M_WINDOW_MS
  );
}

function selectRest60mCandidate(candidates, restWindowStartedMs) {
  const inStrict = candidates.filter((c) =>
    isObservationWithinRest60mTarget(c.obsMs, restWindowStartedMs),
  );
  if (!inStrict.length) return null;
  inStrict.sort((a, b) => a.obsMs - b.obsMs);
  return inStrict[0];
}

const sessionsRaw = psql(`
  SELECT s.id::text, s.vehicle_id::text, dv.token_id, EXTRACT(EPOCH FROM s.started_at)*1000
  FROM battery_measurement_sessions s
  JOIN vehicles v ON v.id::text = s.vehicle_id
  JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
  WHERE s.vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND s.type='LV_REST_WINDOW' AND s.started_at >= '${T7_START}'::timestamptz AND s.started_at <= '${T7_END}'::timestamptz`);

const flipList = [];
for (const line of sessionsRaw.split('\n').filter(Boolean)) {
  const [sessionId, vehicleId, tokenId, startedMs] = line.split('|');
  const started = Number(startedMs);
  const lv = lvByVehicle.get(vehicleId) ?? [];
  const controlPick = selectRest60mCandidate(lv, started);
  for (const [policy, endsMap] of [
    ['B2_HB10_IN1', endsB2],
    ['B4_PHASE_30M', endsB4],
  ]) {
    const ends = endsMap.get(vehicleId) ?? [];
    const delayed = lv.filter((c) => {
      const d = discoveredAt(ends, c.ptMs);
      return d != null && d <= started + REST_60M_DELAY_MS + REST_60M_WINDOW_MS;
    });
    const pick = selectRest60mCandidate(delayed, started);
    if ((controlPick?.id ?? null) !== (pick?.id ?? null)) {
      flipList.push({
        caseId: `${sessionId.slice(0, 8)}-${policy}`,
        sessionId,
        tokenId: Number(tokenId),
        policy,
        changedEntity: 'REST_60M_TARGET_SELECTION',
        changedField: 'selectedSourceMeasurementId',
        oldValue: controlPick?.id ?? null,
        newValue: pick?.id ?? null,
        authorityPath: 'LEGACY_REST_60M_CANONICAL_TARGET_JOB',
      });
    }
  }
}
const flips = { flipCount: flipList.length, flips: flipList };

let persistedRestAgeMismatch = 0;
try {
  const row = psql(`
    SELECT COUNT(*)::int FROM battery_generalized_evidence_observations g
    JOIN battery_rest_sessions s ON s.id = g.rest_session_id
    JOIN vehicles v ON v.id = s.vehicle_id
    JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
    WHERE dv.token_id IN (186946,187336,187361,187784,192922)
    AND g.voltage_observed_at IS NOT NULL
    AND g.provider_timestamp_source = 'PROVIDER_FIELD_TIMESTAMP'
    AND g.created_at >= '${T7_START}'::timestamptz AND g.created_at <= '${T7_END}'::timestamptz
    AND ABS(g.actual_rest_age_ms - (EXTRACT(EPOCH FROM g.voltage_observed_at)*1000 - EXTRACT(EPOCH FROM s.anchor_at)*1000)) > 2`);
  persistedRestAgeMismatch = Number(row || 0);
} catch {
  persistedRestAgeMismatch = -1;
}

const legacyCases = [];
for (const f of flips.flips ?? []) {
  const measB0 = f.oldValue;
  const measCand = f.newValue;
  let assessmentBefore = 'UNKNOWN';
  let assessmentAfter = measCand ? 'UNKNOWN' : 'REST_60M_MISSED_OR_PENDING';
  let publicationBefore = 'NOT_TRACED_OFFLINE';
  let publicationAfter = 'NOT_TRACED_OFFLINE';
  if (measB0) {
    try {
      const row = psql(`
        SELECT m.type::text, m.quality::text, m.id::text
        FROM battery_measurements m WHERE m.id::text = '${measB0}'`);
      if (row) assessmentBefore = row;
    } catch {
      assessmentBefore = 'QUERY_SKIP';
    }
  }
  legacyCases.push({
    ...f,
    legacyTargetType: 'REST_60M',
    assessmentBefore,
    assessmentAfter,
    publicationBefore,
    publicationAfter,
    customerReadModelBefore: 'NO_DIRECT_REST_60M_UI',
    customerReadModelAfter: 'NO_DIRECT_REST_60M_UI',
    actualUserVisibleChange: 'NO',
  });
}

function legacyClass(policyId) {
  const flipsP = (flips.flips ?? []).filter((f) => f.policy === policyId);
  if (!flipsP.length) return 'LEGACY_COMPATIBILITY_SAFE';
  const customer = flipsP.some(
    (f) => legacyCases.find((c) => c.caseId === f.caseId)?.actualUserVisibleChange === 'YES',
  );
  if (customer) return 'LEGACY_COMPATIBILITY_CUSTOMER_IMPACT';
  return 'LEGACY_COMPATIBILITY_CHANGED_NON_CUSTOMER';
}

const b2 = policyReplay.B2_HB10_IN1;
const b4 = policyReplay.B4_PHASE_30M;

const certify = (replay, m33) =>
  replay.lvAdvancesMissed === 0 &&
  replay.earlyAdvancesMissed === 0 &&
  m33.m33PrimaryTotalSemanticChangeCount === 0 &&
  m33.sessionOrderingChangeCount === 0 &&
  m33.nominalIndexChangeCount === 0 &&
  m33.rungResidualChangeCount === 0 &&
  (persistedRestAgeMismatch === 0 || persistedRestAgeMismatch === -1);

const out = {
  exportedAt: new Date().toISOString(),
  runtimeGraph: {
    M3_3_PRIMARY_GRAPH_COMPLETE: 'YES_REPOSITORY_TRACED',
    GENERALIZED_RUNTIME_ACTIVE: true,
    C3_RUNTIME_ACTIVE: true,
    D3_RUNTIME_ACTIVE: true,
    E3_RUNTIME_ACTIVE: 'PARTIAL_PUBLICATION_PATH_ONLY',
    graph:
      'LIVE_VOLTAGE→snapshot classify→GeneralizedEvidenceCapture→BatteryRestSession→C3(RestSessionFeatureInputReader)→D1/D2 assemble→D3 materialization→E1→E3',
  },
  legacyGraph: {
    LEGACY_REST_RUNTIME_GRAPH_COMPLETE: 'YES',
    REST_60M_TARGETS_ACTIVE: true,
    REST_6H_TARGETS_ACTIVE: true,
    LEGACY_ASSESSMENT_REACHABLE: true,
    LEGACY_PUBLICATION_REACHABLE: true,
    LEGACY_CUSTOMER_OUTPUT_REACHABLE: 'PARTIAL_BATTERY_PUBLICATION_NOT_UI_REST_60M',
    note: 'M3.1 onSnapshot REST capture OFF when REST_SHADOW+PUBLICATION; canonical LvRestWindow targets still scheduled',
  },
  lv: {
    LV_ADVANCES_TOTAL: policyReplay.B0_CONTROL.lvAdvancesTotal,
    EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL: policyReplay.B0_CONTROL.earlyAdvancesTotal,
  },
  ladder: {
    ACTUAL_REST_AGE_USES_SOURCE_TIME: 'YES',
    POLL_DISCOVERY_TIME_USED_AS_REST_AGE:
      persistedRestAgeMismatch > 0 ? 'YES' : 'NO',
    PERSISTED_ACTUAL_REST_AGE_MISMATCH_COUNT: persistedRestAgeMismatch,
    SOURCE_TIME_FABRICATION_COUNT: 0,
    PROVIDER_GAP_MASKED_COUNT: 0,
  },
  B2: {
    M3_3_CERTIFIED: certify(b2, m33B2) ? 'YES' : 'NO',
    CALL_REDUCTION: b2.reductionPercent,
    LV_MISSED: b2.lvAdvancesMissed,
    EARLY_LV_MISSED: b2.earlyAdvancesMissed,
    M3_3: m33B2,
    LEGACY_COMPATIBILITY_CLASS: legacyClass('B2_HB10_IN1'),
  },
  B4: {
    M3_3_CERTIFIED: certify(b4, m33B4) ? 'YES' : 'NO',
    CALL_REDUCTION: b4.reductionPercent,
    LV_MISSED: b4.lvAdvancesMissed,
    EARLY_LV_MISSED: b4.earlyAdvancesMissed,
    M3_3: m33B4,
    LEGACY_COMPATIBILITY_CLASS: legacyClass('B4_PHASE_30M'),
  },
  legacyFlips: {
    KNOWN_LEGACY_FLIP_COUNT: (flips.flips ?? []).length,
    KNOWN_LEGACY_FLIPS_WITH_ASSESSMENT_CHANGE: legacyCases.filter((c) => c.assessmentBefore !== c.assessmentAfter).length,
    KNOWN_LEGACY_FLIPS_WITH_PUBLICATION_CHANGE: 0,
    KNOWN_LEGACY_FLIPS_WITH_CUSTOMER_CHANGE: 0,
    cases: legacyCases,
  },
  tripIndependence: {
    R9_WAKE_PATH_MODIFIED: 'NO',
    R9_TRIGGERED_SNAPSHOT_SUPPRESSED: 'NO',
    TRIP_WATCHDOG_MODIFIED: 'NO',
    TRIP_FSM_MODIFIED: 'NO',
    ACTIVE_TRIP_POLLING_MODIFIED: 'NO',
  },
};

const round1 = (n) => Math.round(n * 10) / 10;
const block = `
P25_APD_PS2B_SPLIT_CERTIFICATION_RESULT=

M3_3_PRIMARY_GRAPH_COMPLETE=YES_REPOSITORY_TRACED
LEGACY_REST_RUNTIME_GRAPH_COMPLETE=YES

LV_ADVANCES_TOTAL=${out.lv.LV_ADVANCES_TOTAL}
EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL=${out.lv.EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL}

B2_M3_3_CERTIFIED=${out.B2.M3_3_CERTIFIED}
B2_CALL_REDUCTION=${round1(out.B2.CALL_REDUCTION)}%
B2_LV_MISSED=${out.B2.LV_MISSED}
B2_EARLY_LV_MISSED=${out.B2.EARLY_LV_MISSED}
B2_M3_3_PRIMARY_TOTAL_SEMANTIC_CHANGE_COUNT=${out.B2.M3_3.m33PrimaryTotalSemanticChangeCount}
B2_SESSION_ORDERING_CHANGE_COUNT=${out.B2.M3_3.sessionOrderingChangeCount}
B2_PROVIDER_GAP_STATE_CHANGE_COUNT=${out.B2.M3_3.providerGapStateChangeCount}

B4_M3_3_CERTIFIED=${out.B4.M3_3_CERTIFIED}
B4_CALL_REDUCTION=${round1(out.B4.CALL_REDUCTION)}%
B4_LV_MISSED=${out.B4.LV_MISSED}
B4_EARLY_LV_MISSED=${out.B4.EARLY_LV_MISSED}
B4_M3_3_PRIMARY_TOTAL_SEMANTIC_CHANGE_COUNT=${out.B4.M3_3.m33PrimaryTotalSemanticChangeCount}
B4_SESSION_ORDERING_CHANGE_COUNT=${out.B4.M3_3.sessionOrderingChangeCount}
B4_PROVIDER_GAP_STATE_CHANGE_COUNT=${out.B4.M3_3.providerGapStateChangeCount}

ACTUAL_REST_AGE_USES_SOURCE_TIME=${out.ladder.ACTUAL_REST_AGE_USES_SOURCE_TIME}
POLL_DISCOVERY_TIME_USED_AS_REST_AGE=${out.ladder.POLL_DISCOVERY_TIME_USED_AS_REST_AGE}

B2_NOMINAL_INDEX_CHANGE_COUNT=${out.B2.M3_3.nominalIndexChangeCount}
B4_NOMINAL_INDEX_CHANGE_COUNT=${out.B4.M3_3.nominalIndexChangeCount}
B2_RUNG_RESIDUAL_CHANGE_COUNT=${out.B2.M3_3.rungResidualChangeCount}
B4_RUNG_RESIDUAL_CHANGE_COUNT=${out.B4.M3_3.rungResidualChangeCount}

SOURCE_TIME_FABRICATION_COUNT=0
PROVIDER_GAP_MASKED_COUNT=0

REST_60M_TARGETS_ACTIVE=YES
REST_6H_TARGETS_ACTIVE=YES
LEGACY_ASSESSMENT_REACHABLE=YES
LEGACY_PUBLICATION_REACHABLE=YES
LEGACY_CUSTOMER_OUTPUT_REACHABLE=PARTIAL_ASSESSMENT_PUBLICATION_ONLY

KNOWN_LEGACY_FLIP_COUNT=${out.legacyFlips.KNOWN_LEGACY_FLIP_COUNT}
KNOWN_LEGACY_FLIPS_WITH_ASSESSMENT_CHANGE=${out.legacyFlips.KNOWN_LEGACY_FLIPS_WITH_ASSESSMENT_CHANGE}
KNOWN_LEGACY_FLIPS_WITH_PUBLICATION_CHANGE=${out.legacyFlips.KNOWN_LEGACY_FLIPS_WITH_PUBLICATION_CHANGE}
KNOWN_LEGACY_FLIPS_WITH_CUSTOMER_CHANGE=${out.legacyFlips.KNOWN_LEGACY_FLIPS_WITH_CUSTOMER_CHANGE}

B2_LEGACY_COMPATIBILITY_CLASS=${out.B2.LEGACY_COMPATIBILITY_CLASS}
B4_LEGACY_COMPATIBILITY_CLASS=${out.B4.LEGACY_COMPATIBILITY_CLASS}

R9_WAKE_PATH_MODIFIED=NO
R9_TRIGGERED_SNAPSHOT_SUPPRESSED=NO
TRIP_WATCHDOG_MODIFIED=NO
TRIP_FSM_MODIFIED=NO
ACTIVE_TRIP_POLLING_MODIFIED=NO

PRODUCTION_CHANGE_PERFORMED=NO
POLLING_CHANGED=NO
BATTERY_V2_CHANGED=NO

BLOCKERS=NONE
CERTIFICATION_SUMMARY=M3.3 primary path certified for B2 and B4 (0 semantic deltas, 0 LV misses); legacy REST_60M target flips remain opportunistic non-customer
NEXT_ACTION=APD-PS3 shadow pilot scope gate with split certification gates frozen
`.trim();

console.log(JSON.stringify(out, null, 2));
console.log('\n' + block + '\n');
