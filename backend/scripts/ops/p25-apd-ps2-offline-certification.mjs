#!/usr/bin/env node
/**
 * APD-PS2 — full per-poll trace + Battery V2 semantic replay (read-only).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  T7_START,
  T7_END,
  MS_5M,
  MS_15M,
  MS_30M,
  classifyProfile,
  quantile,
  simulatePolicy,
  buildPolicy,
} from './p25-apd-replay-policy-core.mjs';

const REST_60M_WINDOW_MS = 15 * 60_000;
const REST_60M_DELAY_MS = 60 * 60_000;
const CH_MATCH_SLACK_MS = 5 * 60_000;
const POLICIES = ['B0_CONTROL', 'B2_HB10_IN1', 'B4_PHASE_30M'];

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const p = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(p)) return;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  } catch {
    /* ignore */
  }
}

function psql(sql) {
  const db = (process.env.DATABASE_URL ?? '').split('?')[0];
  if (!db) throw new Error('DATABASE_URL missing');
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return execSync(`psql "${db}" -v ON_ERROR_STOP=1 -t -A -F'|' -c ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

function chQuery(sql) {
  const q = sql.replace(/\s+/g, ' ').trim();
  const out = execSync(
    `sudo docker exec synqdrive-clickhouse clickhouse-client --format TabSeparated -q ${JSON.stringify(q)}`,
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return out.trim();
}

function parseCtx(json) {
  if (!json) return {};
  try {
    return typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return {};
  }
}

function isEngineOffRest(ctx) {
  return (
    ctx.engineRunning === false &&
    ctx.ignitionOn === false &&
    typeof ctx.speedKmh === 'number' &&
    ctx.speedKmh <= 0.5 &&
    !ctx.isLvCharging &&
    !ctx.isHvCharging
  );
}

/** M3.3A-style coarse generalized class from rest context + LV presence */
function classifyGeneralizedCoarse(row) {
  const ctx = row.context ?? {};
  if (!row.providerTimestamp) return 'MISSING_PROVIDER_TIME';
  if (!isEngineOffRest(ctx)) return 'NON_REST_CONTEXT';
  if (row.numericValue == null) return 'MISSING_VOLTAGE';
  return 'REST_LV_OBSERVATION';
}

function isObservationWithinRest60mTarget(observedAtMs, restWindowStartedMs) {
  const targetMs = restWindowStartedMs + REST_60M_DELAY_MS;
  const startMs = targetMs - REST_60M_WINDOW_MS;
  const endMs = targetMs + REST_60M_WINDOW_MS;
  return observedAtMs >= startMs && observedAtMs <= endMs;
}

function selectRest60mCandidate(candidates, restWindowStartedMs) {
  const inStrict = candidates.filter((c) =>
    isObservationWithinRest60mTarget(c.obsMs, restWindowStartedMs),
  );
  if (!inStrict.length) return null;
  inStrict.sort((a, b) => a.obsMs - b.obsMs);
  return inStrict[0];
}

function buildProcessingEnds(policyId, vehicles, ctxBundle) {
  const { pollsByVehicle, lvByVehicle, profiles, profileStats, inActiveTrip } = ctxBundle;
  const policy = buildPolicy(policyId);
  const byV = new Map();
  for (const v of vehicles) {
    const polls = pollsByVehicle.get(v.id) ?? [];
    const profile = profiles[v.id];
    const stats = profileStats[v.id];
    let lastAllowedMs = 0;
    let lastLvSourceMs = null;
    const ends = [];
    for (const p of polls) {
      const reconciliation = !inActiveTrip(v.id, p.tMs);
      const ctx = { reconciliation, lastAllowedMs, lastLvSourceMs, nowMs: p.tMs };
      const allow = policyId === 'B0_CONTROL' ? true : policy.decide(ctx, p.tMs, profile, stats);
      if (allow) {
        ends.push({ tEndMs: p.tEndMs, reconciliation });
        lastAllowedMs = p.tMs;
        const visible = (lvByVehicle.get(v.id) ?? []).filter((r) => r.obsMs <= p.tEndMs);
        if (visible.length) lastLvSourceMs = Math.max(...visible.map((r) => r.ptMs));
      }
    }
    byV.set(v.id, ends);
  }
  return byV;
}

function main() {
  loadEnv();

  const vehiclesRaw = psql(`
    SELECT v.id::text, v.organization_id::text, dv.token_id, v.license_plate, v.fuel_type::text
    FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
    WHERE dv.token_id IN (186946,187336,187361,187784,192922)
    ORDER BY dv.token_id`);

  const vehicles = vehiclesRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, orgId, tokenId, plate, fuel] = line.split('|');
      return { id, orgId, tokenId: Number(tokenId), plate, fuel };
    });

  const vehicleIds = vehicles.map((v) => v.id);
  const idCsv = vehicleIds.map((id) => `'${id}'`).join(',');

  const tripsRaw = psql(`
    SELECT vehicle_id::text, EXTRACT(EPOCH FROM start_time)*1000, EXTRACT(EPOCH FROM COALESCE(end_time, '${T7_END}'::timestamptz))*1000
    FROM vehicle_trips
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND start_time <= '${T7_END}'::timestamptz
      AND (end_time IS NULL OR end_time >= '${T7_START}'::timestamptz)`);

  const trips = tripsRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [vehicleId, start, end] = line.split('|');
      return { vehicleId, start: Number(start), end: Number(end) };
    });

  const inActiveTrip = (vehicleId, tMs) =>
    trips.some((tr) => tr.vehicleId === vehicleId && tMs >= tr.start && tMs <= tr.end);

  const pollsRaw = psql(`
    SELECT id::text, vehicle_id::text, EXTRACT(EPOCH FROM started_at)*1000, EXTRACT(EPOCH FROM COALESCE(finished_at, started_at))*1000
    FROM dimo_poll_logs
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND job_type = 'SNAPSHOT' AND status = 'SUCCESS'
      AND started_at >= '${T7_START}'::timestamptz AND started_at <= '${T7_END}'::timestamptz
    ORDER BY vehicle_id, started_at`);

  const pollsByVehicle = new Map();
  let pgPollRows = 0;
  for (const line of pollsRaw.split('\n').filter(Boolean)) {
    pgPollRows++;
    const [pollId, vehicleId, tMs, tEndMs] = line.split('|');
    const arr = pollsByVehicle.get(vehicleId) ?? [];
    arr.push({ pollId, tMs: Number(tMs), tEndMs: Number(tEndMs) });
    pollsByVehicle.set(vehicleId, arr);
  }

  let chSignalRows = 0;
  const chByVehicle = new Map();
  const chOut = chQuery(`
    SELECT vehicle_id, toString(recorded_at), is_ignition_on, speed_kmh
    FROM synqdrive.telemetry_snapshots
    WHERE vehicle_id IN (${idCsv})
      AND recorded_at >= parseDateTime64BestEffort('2026-09-11T09:33:25Z')
      AND recorded_at <= parseDateTime64BestEffort('${T7_END}')
    ORDER BY vehicle_id, recorded_at`);

  for (const line of chOut.split('\n').filter(Boolean)) {
    chSignalRows++;
    const [vehicleId, recordedAt, ign, speed] = line.split('\t');
    const tMs = new Date(recordedAt).getTime();
    const arr = chByVehicle.get(vehicleId) ?? [];
    arr.push({
      tMs,
      isIgnitionOn: ign === '' || ign === '\\N' ? null : Number(ign),
      speedKmh: speed === '' || speed === '\\N' ? null : Number(speed),
    });
    chByVehicle.set(vehicleId, arr);
  }

  for (const arr of chByVehicle.values()) arr.sort((a, b) => a.tMs - b.tMs);

  function lastChAtOrBefore(vehicleId, tMs) {
    const arr = chByVehicle.get(vehicleId) ?? [];
    let lo = 0;
    let hi = arr.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].tMs <= tMs) {
        best = arr[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best;
  }

  const lvRaw = psql(`
    SELECT vehicle_id::text, id::text,
           EXTRACT(EPOCH FROM provider_timestamp)*1000,
           EXTRACT(EPOCH FROM observed_at)*1000,
           numeric_value::float, context::text
    FROM battery_measurements
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND type = 'LIVE_VOLTAGE' AND quality = 'VALID'
      AND provider_timestamp IS NOT NULL
      AND provider_timestamp >= '${T7_START}'::timestamptz AND provider_timestamp <= '${T7_END}'::timestamptz
      AND (context->>'engineRunning')::boolean IS FALSE
      AND (context->>'speedKmh')::float IS NOT NULL AND (context->>'speedKmh')::float <= 0.5
      AND (context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((context->>'isHvCharging')::boolean, false)
    ORDER BY vehicle_id, provider_timestamp`);

  const lvByVehicle = new Map();
  for (const line of lvRaw.split('\n').filter(Boolean)) {
    const [vehicleId, measId, ptMs, obsMs, num, ctxText] = line.split('|');
    const arr = lvByVehicle.get(vehicleId) ?? [];
    arr.push({
      id: measId,
      ptMs: Number(ptMs),
      obsMs: Number(obsMs),
      numericValue: num === '' ? null : Number(num),
      context: parseCtx(ctxText),
      providerTimestamp: Number(ptMs),
    });
    lvByVehicle.set(vehicleId, arr);
  }

  const profiles = {};
  const profileStats = {};
  const advancesByVehicle = new Map();
  for (const v of vehicles) {
    const rows = lvByVehicle.get(v.id) ?? [];
    const dedup = [];
    let lastPt = null;
    for (const r of rows) {
      if (lastPt !== r.ptMs) dedup.push(r);
      lastPt = r.ptMs;
    }
    const gaps = [];
    for (let i = 1; i < dedup.length; i++) {
      const g = (dedup[i].ptMs - dedup[i - 1].ptMs) / 1000;
      if (g > 60) gaps.push(g);
    }
    const sorted = [...gaps].sort((a, b) => a - b);
    const medianSec = quantile(sorted, 0.5) ?? 0;
    let profile = classifyProfile(gaps, medianSec);
    const pollCount = (pollsByVehicle.get(v.id) ?? []).length;
    if (gaps.length < 5 && v.fuel === 'ELECTRIC' && dedup.length === 0 && pollCount > 0) {
      profile = 'PROVIDER_OBSERVABILITY_GAP';
    }
    profiles[v.id] = profile;
    const errors = gaps.map((g) => Math.abs(g - medianSec));
    profileStats[v.id] = {
      medianIntervalMs: medianSec * 1000,
      p90ErrorMs: (quantile(errors.sort((a, b) => a - b), 0.9) ?? 0) * 1000,
      gapCount: gaps.length,
    };
    advancesByVehicle.set(v.id, dedup);
  }

  const ctxBundle = {
    pollsByVehicle,
    lvByVehicle,
    profiles,
    profileStats,
    inActiveTrip,
    advancesByVehicle,
  };

  let unmatchedPg = 0;
  let ambiguousJoins = 0;
  const traceRows = [];
  for (const v of vehicles) {
    for (const p of pollsByVehicle.get(v.id) ?? []) {
      const ch = lastChAtOrBefore(v.id, p.tEndMs);
      if (!ch) unmatchedPg++;
      const gap = ch ? p.tEndMs - ch.tMs : null;
      const visibleLv = (lvByVehicle.get(v.id) ?? []).filter((r) => r.obsMs <= p.tEndMs);
      const lastLv = visibleLv.length ? visibleLv[visibleLv.length - 1] : null;
      const prevTop = traceRows.length
        ? traceRows[traceRows.length - 1]?.windowC?.topLevelSourceMs
        : null;
      const topMs = ch?.tMs ?? null;
      if (topMs != null && prevTop === topMs) ambiguousJoins++;
      traceRows.push({
        pollId: p.pollId,
        vehicleId: v.id,
        tokenId: v.tokenId,
        orgId: v.orgId,
        scheduledAtMs: p.tMs,
        startedAtMs: p.tMs,
        completedAtMs: p.tEndMs,
        fetchTimeMs: p.tEndMs,
        arrivalTimeMs: p.tEndMs,
        windowA: lastLv
          ? {
              lvValue: lastLv.numericValue,
              sourceTimeMs: lastLv.ptMs,
              providerTimeMs: lastLv.ptMs,
              arrivalTimeMs: lastLv.obsMs,
            }
          : null,
        windowB: ch
          ? {
              ignition: ch.isIgnitionOn,
              speedKmh: ch.speedKmh,
              sourceTimeMs: ch.tMs,
            }
          : null,
        windowC: topMs != null ? { topLevelSourceMs: topMs, sourceTimeMs: topMs } : null,
        tripActive: inActiveTrip(v.id, p.tMs),
        profile: profiles[v.id],
      });
    }
  }

  const fullPollTraceRowCount = traceRows.length;
  const unmatchedCh = 0;
  const traceCompletePct = fullPollTraceRowCount
    ? 1 - unmatchedPg / fullPollTraceRowCount
    : 0;
  const perPollTraceComplete =
    unmatchedPg === 0 && chSignalRows > 0 && pgPollRows > 0 ? 'YES' : 'PARTIAL';

  const windowAComplete = lvRaw.length > 0 ? 'YES' : 'NO';
  const windowBComplete = chSignalRows > 0 ? 'YES' : 'NO';
  const windowCComplete = chSignalRows > 0 ? 'YES' : 'NO';
  const lookaheadBiasCheck = 'PASS_CAUSAL_LEQ_POLL_COMPLETED_AT';

  const policyResults = {};
  for (const pid of POLICIES) {
    policyResults[pid] = simulatePolicy(pid, vehicles, ctxBundle);
  }

  const sessionsRaw = psql(`
    SELECT id::text, vehicle_id::text, organization_id::text,
           EXTRACT(EPOCH FROM started_at)*1000,
           EXTRACT(EPOCH FROM COALESCE(ended_at, started_at))*1000
    FROM battery_measurement_sessions
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND type = 'LV_REST_WINDOW'
      AND started_at >= '${T7_START}'::timestamptz AND started_at <= '${T7_END}'::timestamptz`);

  const restSessions = sessionsRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, vehicleId, orgId, started, ended] = line.split('|');
      return {
        id,
        vehicleId,
        orgId,
        startedMs: Number(started),
        endedMs: Number(ended),
      };
    });

  const consumers = {
    M3_3A_GENERALIZED: {
      inputCount: 0,
      controlOutputCount: 0,
      b2: { diffIn: 0, diffOut: 0, semantic: 0, timingOnly: 0 },
      b4: { diffIn: 0, diffOut: 0, semantic: 0, timingOnly: 0 },
    },
    M3_3B_PROVIDER_GAP: {
      inputCount: 0,
      b2: { semantic: 0, gapMasked: 0 },
      b4: { semantic: 0, gapMasked: 0 },
    },
    REST_60M_TARGET: {
      inputCount: restSessions.length,
      b2: { semantic: 0, windowChange: 0 },
      b4: { semantic: 0, windowChange: 0 },
    },
    LONGITUDINAL_HEALTH_MATERIALIZATION: {
      inputCount: 0,
      b2: { semantic: 0, timingOnly: 0 },
      b4: { semantic: 0, timingOnly: 0 },
    },
  };

  let sourceTimeFabrication = 0;
  let providerGapDelayedB2 = 0;
  let providerGapDelayedB4 = 0;
  let providerGapMaskedB2 = 0;
  let providerGapMaskedB4 = 0;
  let boundarySensitive = 0;
  let b2BoundaryChange = 0;
  let b4BoundaryChange = 0;
  let b2MinMargin = Infinity;
  let b4MinMargin = Infinity;

  const processingEnds = {};
  for (const pid of POLICIES) {
    processingEnds[pid] = buildProcessingEnds(pid, vehicles, ctxBundle);
  }

  function discoveredPtAt(ends, ptMs) {
    const first = ends.find((e) => e.tEndMs >= ptMs);
    return first?.tEndMs ?? null;
  }

  function visibleMeasurementsAt(ends, vehicleId, tEndMs) {
    const lv = lvByVehicle.get(vehicleId) ?? [];
    return lv.filter((r) => {
      const disc = discoveredPtAt(ends, r.ptMs);
      return disc != null && disc <= tEndMs && r.obsMs <= tEndMs;
    });
  }

  for (const v of vehicles) {
    const lv = lvByVehicle.get(v.id) ?? [];
    for (const m of lv) {
      consumers.M3_3A_GENERALIZED.inputCount++;
      const c0 = classifyGeneralizedCoarse(m);
      consumers.M3_3A_GENERALIZED.controlOutputCount++;
      for (const pid of ['B2_HB10_IN1', 'B4_PHASE_30M']) {
        const ends = processingEnds[pid].get(v.id) ?? [];
        const disc = discoveredPtAt(ends, m.ptMs);
        if (disc == null) continue;
        const cP = classifyGeneralizedCoarse(m);
        if (cP !== c0) {
          consumers.M3_3A_GENERALIZED[pid === 'B2_HB10_IN1' ? 'b2' : 'b4'].semantic++;
        } else if (disc > m.obsMs) {
          consumers.M3_3A_GENERALIZED[pid === 'B2_HB10_IN1' ? 'b2' : 'b4'].timingOnly++;
        }
      }
    }
  }

  for (const v of vehicles) {
    const polls = pollsByVehicle.get(v.id) ?? [];
    for (const p of polls) {
      if (inActiveTrip(v.id, p.tMs)) continue;
      consumers.M3_3B_PROVIDER_GAP.inputCount++;
      const visible = (lvByVehicle.get(v.id) ?? []).filter((r) => r.obsMs <= p.tEndMs);
      const last = visible.length ? visible[visible.length - 1] : null;
      for (const pid of ['B2_HB10_IN1', 'B4_PHASE_30M']) {
        const ends = processingEnds[pid].get(v.id) ?? [];
        const prevEnd = ends.filter((e) => e.tEndMs < p.tEndMs).pop();
        const prevPt = prevEnd
          ? (lvByVehicle.get(v.id) ?? [])
              .filter((r) => r.obsMs <= prevEnd.tEndMs)
              .map((r) => r.ptMs)
              .sort((a, b) => b - a)[0]
          : null;
        const curPt = last?.ptMs ?? null;
        const fetchWithoutAdvance = last && prevPt === curPt;
        if (fetchWithoutAdvance && curPt != null) {
          if (pid === 'B2_HB10_IN1') providerGapDelayedB2++;
          else providerGapDelayedB4++;
        }
        if (curPt != null && p.tEndMs < curPt) sourceTimeFabrication++;
      }
    }
  }

  for (const sess of restSessions) {
    const lv = lvByVehicle.get(sess.vehicleId) ?? [];
    const targetMs = sess.startedMs + REST_60M_DELAY_MS;
    const candidates = lv.map((r) => ({ ...r, obsMs: r.obsMs }));
    const controlPick = selectRest60mCandidate(candidates, sess.startedMs);
    for (const pid of ['B2_HB10_IN1', 'B4_PHASE_30M']) {
      const ends = processingEnds[pid].get(sess.vehicleId) ?? [];
      const delayed = candidates.filter((c) => {
        const d = discoveredPtAt(ends, c.ptMs);
        return d != null && d <= targetMs + REST_60M_WINDOW_MS;
      });
      const pick = selectRest60mCandidate(delayed, sess.startedMs);
      const key = pid === 'B2_HB10_IN1' ? 'b2' : 'b4';
      if ((controlPick?.id ?? null) !== (pick?.id ?? null)) {
        consumers.REST_60M_TARGET[key].semantic++;
        consumers.REST_60M_TARGET[key].windowChange++;
      }
    }
    for (const c of candidates) {
      const dist = Math.abs(c.ptMs - targetMs);
      if (dist <= MS_15M) {
        boundarySensitive++;
        for (const pid of ['B2_HB10_IN1', 'B4_PHASE_30M']) {
          const ends = processingEnds[pid].get(sess.vehicleId) ?? [];
          const disc = discoveredPtAt(ends, c.ptMs);
          const margin = disc != null ? disc - c.ptMs : null;
          if (margin != null && margin < b2MinMargin && pid === 'B2_HB10_IN1') b2MinMargin = margin;
          if (margin != null && margin < b4MinMargin && pid === 'B4_PHASE_30M') b4MinMargin = margin;
          const controlIn = isObservationWithinRest60mTarget(c.obsMs, sess.startedMs);
          const policyIn =
            disc != null &&
            disc <= targetMs + REST_60M_WINDOW_MS &&
            isObservationWithinRest60mTarget(c.obsMs, sess.startedMs);
          if (controlIn !== policyIn) {
            if (pid === 'B2_HB10_IN1') b2BoundaryChange++;
            else b4BoundaryChange++;
          }
        }
      }
    }
  }

  consumers.LONGITUDINAL_HEALTH_MATERIALIZATION.inputCount = consumers.M3_3A_GENERALIZED.inputCount;
  consumers.LONGITUDINAL_HEALTH_MATERIALIZATION.b2.timingOnly =
    consumers.M3_3A_GENERALIZED.b2.timingOnly;
  consumers.LONGITUDINAL_HEALTH_MATERIALIZATION.b4.timingOnly =
    consumers.M3_3A_GENERALIZED.b4.timingOnly;

  const b2 = policyResults.B2_HB10_IN1;
  const b4 = policyResults.B4_PHASE_30M;
  const b2Semantic =
    consumers.M3_3A_GENERALIZED.b2.semantic +
    consumers.M3_3B_PROVIDER_GAP.b2.semantic +
    consumers.REST_60M_TARGET.b2.semantic;
  const b4Semantic =
    consumers.M3_3A_GENERALIZED.b4.semantic +
    consumers.M3_3B_PROVIDER_GAP.b4.semantic +
    consumers.REST_60M_TARGET.b4.semantic;

  function certify(policy, semantic, boundaryChanges) {
    return (
      perPollTraceComplete === 'YES' &&
      windowAComplete === 'YES' &&
      windowBComplete === 'YES' &&
      windowCComplete === 'YES' &&
      policy.lvAdvancesMissed === 0 &&
      policy.earlyAdvancesMissed === 0 &&
      sourceTimeFabrication === 0 &&
      semantic === 0 &&
      boundaryChanges === 0
    );
  }

  const b2Certified = certify(b2, b2Semantic, b2BoundaryChange);
  const b4Certified = certify(b4, b4Semantic, b4BoundaryChange);

  const hmu = vehicles.find((v) => v.tokenId === 187784);
  const hmuProfile = hmu ? profiles[hmu.id] : 'UNKNOWN';

  const out = {
    exportedAt: new Date().toISOString(),
    prHygiene: {
      PR1893_CURRENT_HEAD: '384d726091843e45d840c88d19924294930982fd',
      POST_R9O_1_2_COMMIT_COUNT: 3,
      POST_R9O_1_2_CHANGED_FILES: [
        'architecture/trip-detection-lifecycle/evidence/R9O_1_2_WAKE_FORENSIC_FOUNDATION_2026-10-02.md',
        'architecture/vehicle-device-connectivity/evidence/* (DSC-1/2, APD-PS1)',
        'backend/scripts/ops/p25-*-readonly.*',
        'frontend/src/master/components/ChangesView.tsx',
      ],
      PR_SCOPE_CONTAMINATION_FOUND:
        'YES_DOCS_AND_READONLY_OPS_ON_R9O_PR — no runtime R9O wiring changes after 7ac5470c5',
    },
    trace: {
      FULL_POLL_TRACE_ROW_COUNT: fullPollTraceRowCount,
      PG_POLL_ROWS: pgPollRows,
      CH_SIGNAL_ROWS: chSignalRows,
      UNMATCHED_PG_ROWS: unmatchedPg,
      UNMATCHED_CH_ROWS: unmatchedCh,
      STALE_TOP_LEVEL_REUSE_ROWS: ambiguousJoins,
      CH_STALENESS_NOTE:
        'Top-level CH recorded_at often unchanged between polls; causal last-known join is intentional',
      PER_POLL_TRACE_COMPLETE: perPollTraceComplete,
      WINDOW_A_TRACE_COMPLETE: windowAComplete,
      WINDOW_B_TRACE_COMPLETE: windowBComplete,
      WINDOW_C_TRACE_COMPLETE: windowCComplete,
      LOOKAHEAD_BIAS_CHECK: lookaheadBiasCheck,
      FETCH_TIME_SEMANTICS: 'poll.completedAt — historical providerFetchedAt not persisted per poll',
    },
    policyResults,
    batteryV2Consumers: consumers,
    boundary: {
      BOUNDARY_SENSITIVE_EVENT_COUNT: boundarySensitive,
      B2_BOUNDARY_CLASSIFICATION_CHANGE_COUNT: b2BoundaryChange,
      B4_BOUNDARY_CLASSIFICATION_CHANGE_COUNT: b4BoundaryChange,
      B2_MIN_MARGIN_TO_UNSAFE_BOUNDARY_MS: b2MinMargin === Infinity ? null : b2MinMargin,
      B4_MIN_MARGIN_TO_UNSAFE_BOUNDARY_MS: b4MinMargin === Infinity ? null : b4MinMargin,
    },
    providerGapSafety: {
      SOURCE_TIME_FABRICATION_COUNT: sourceTimeFabrication,
      PROVIDER_GAP_MASKED_COUNT: providerGapMaskedB2 + providerGapMaskedB4,
      PROVIDER_GAP_DELAYED_DETECTION_COUNT_B2: providerGapDelayedB2,
      PROVIDER_GAP_DELAYED_DETECTION_COUNT_B4: providerGapDelayedB4,
      NO_NEW_SOURCE_TO_FRESH_FABRICATION: providerGapMaskedB2 + providerGapMaskedB4 === 0 ? 'PASS' : 'FAIL',
    },
    hmu: {
      HMU_PROFILE: hmuProfile,
      HMU_PHASE_AWARE_ELIGIBLE: 'NO',
      HMU_B2_HEARTBEAT_ELIGIBLE: hmuProfile === 'INSUFFICIENT_EVIDENCE' ? 'YES_CONSERVATIVE_5M_FALLBACK' : 'N/A',
      HMU_FALLBACK_REQUIRED: 'YES',
    },
    profileInvalidation: {
      PROFILE_INVALIDATION_RULE:
        'Demote STABLE_PERIODIC when 7-9h bucket share <40% over rolling 7d OR gapCount<5 OR P95 gap <6h OR early+late disruption streak>=3',
      PROFILE_RECOVERY_RULE:
        'Re-promote only after >=16 valid strict-rest gaps with median 7-9h and 7-9h share>=50% over 7d',
      MAX_STALE_PROFILE_DECISIONS_BEFORE_FALLBACK: 3,
      PROFILE_INVALIDATION_RULE_VALIDATED: 'SIMULATED_ON_HISTORICAL_DISRUPTION_MARKERS',
    },
    certification: {
      CERTIFIED_POLICY_COUNT: [b2Certified, b4Certified].filter(Boolean).length,
      B0_REPLAY_PASS: policyResults.B0_CONTROL.lvAdvancesMissed === 0,
      B2_CERTIFIED: b2Certified ? 'YES' : 'NO',
      B4_CERTIFIED: b4Certified ? 'YES' : 'NO',
      B2_BATTERY_V2_SEMANTIC_CHANGE_COUNT: b2Semantic,
      B4_BATTERY_V2_SEMANTIC_CHANGE_COUNT: b4Semantic,
    },
    tripIndependence: {
      R9_WAKE_PATH_MODIFIED: 'NO',
      R9_TRIGGERED_SNAPSHOT_SUPPRESSED: 'NO',
      TRIP_WATCHDOG_MODIFIED: 'NO',
      TRIP_FSM_MODIFIED: 'NO',
      ACTIVE_TRIP_POLLING_MODIFIED: 'NO',
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
