#!/usr/bin/env node
/** PS2A — enumerate REST_60M target-selection flips (read-only, same model as PS2). */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  T7_START,
  T7_END,
  MS_15M,
  MS_30M,
  classifyProfile,
  quantile,
  buildPolicy,
} from './p25-apd-replay-policy-core.mjs';

const REST_60M_WINDOW_MS = 15 * 60_000;
const REST_60M_DELAY_MS = 60 * 60_000;

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const p = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function psql(sql) {
  const db = (process.env.DATABASE_URL ?? '').split('?')[0];
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return execSync(`psql "${db}" -v ON_ERROR_STOP=1 -t -A -F'|' -c ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
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

function buildEnds(policyId, vehicles, ctx) {
  const policy = buildPolicy(policyId);
  const byV = new Map();
  for (const v of vehicles) {
    const polls = ctx.pollsByVehicle.get(v.id) ?? [];
    let lastAllowedMs = 0;
    let lastLvSourceMs = null;
    const ends = [];
    for (const p of polls) {
      const reconciliation = !ctx.inActiveTrip(v.id, p.tMs);
      const c = { reconciliation, lastAllowedMs, lastLvSourceMs, nowMs: p.tMs };
      const allow = policyId === 'B0_CONTROL' ? true : policy.decide(c, p.tMs, ctx.profiles[v.id], ctx.profileStats[v.id]);
      if (allow) {
        ends.push(p.tEndMs);
        lastAllowedMs = p.tMs;
        const visible = (ctx.lvByVehicle.get(v.id) ?? []).filter((r) => r.obsMs <= p.tEndMs);
        if (visible.length) lastLvSourceMs = Math.max(...visible.map((r) => r.ptMs));
      }
    }
    byV.set(v.id, ends);
  }
  return byV;
}

function discoveredPtAt(ends, ptMs) {
  const first = ends.find((e) => e >= ptMs);
  return first ?? null;
}

loadEnv();

const vehiclesRaw = psql(`
  SELECT v.id::text, dv.token_id, v.license_plate
  FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
  WHERE dv.token_id IN (186946,187336,187361,187784,192922)`);
const vehicles = vehiclesRaw.split('\n').filter(Boolean).map((line) => {
  const [id, tokenId, plate] = line.split('|');
  return { id, tokenId: Number(tokenId), plate };
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
  SELECT vehicle_id::text, id::text, EXTRACT(EPOCH FROM provider_timestamp)*1000, EXTRACT(EPOCH FROM observed_at)*1000, numeric_value::float
  FROM battery_measurements WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND type='LIVE_VOLTAGE' AND quality='VALID' AND provider_timestamp IS NOT NULL
  AND provider_timestamp >= '${T7_START}'::timestamptz AND provider_timestamp <= '${T7_END}'::timestamptz
  AND (context->>'engineRunning')::boolean IS FALSE AND (context->>'speedKmh')::float <= 0.5
  AND (context->>'ignitionOn')::boolean IS FALSE`);
const lvByVehicle = new Map();
for (const line of lvRaw.split('\n').filter(Boolean)) {
  const [vehicleId, id, ptMs, obsMs, val] = line.split('|');
  const arr = lvByVehicle.get(vehicleId) ?? [];
  arr.push({ id, ptMs: Number(ptMs), obsMs: Number(obsMs), value: Number(val) });
  lvByVehicle.set(vehicleId, arr);
}

const profiles = {};
const profileStats = {};
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
}

const ctx = { pollsByVehicle, lvByVehicle, profiles, profileStats, inActiveTrip };
const endsB0 = buildEnds('B0_CONTROL', vehicles, ctx);
const endsB2 = buildEnds('B2_HB10_IN1', vehicles, ctx);
const endsB4 = buildEnds('B4_PHASE_30M', vehicles, ctx);

const sessionsRaw = psql(`
  SELECT s.id::text, s.vehicle_id::text, dv.token_id, EXTRACT(EPOCH FROM s.started_at)*1000
  FROM battery_measurement_sessions s
  JOIN vehicles v ON v.id::text = s.vehicle_id
  JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
  WHERE s.vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
  AND s.type='LV_REST_WINDOW' AND s.started_at >= '${T7_START}'::timestamptz AND s.started_at <= '${T7_END}'::timestamptz`);

const flips = [];
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
      const d = discoveredPtAt(ends, c.ptMs);
      return d != null && d <= started + REST_60M_DELAY_MS + REST_60M_WINDOW_MS;
    });
    const pick = selectRest60mCandidate(delayed, started);
    if ((controlPick?.id ?? null) !== (pick?.id ?? null)) {
      flips.push({
        caseId: `${sessionId.slice(0, 8)}-${policy}`,
        sessionId,
        tokenId: Number(tokenId),
        policy,
        changedEntity: 'REST_60M_TARGET_SELECTION',
        changedField: 'selectedSourceMeasurementId',
        oldValue: controlPick?.id ?? null,
        newValue: pick?.id ?? null,
        authorityPath: 'LEGACY_REST_60M_CANONICAL_TARGET_JOB',
        conclusionBearing: 'OPPORTUNISTIC_LEGACY_NON_PRIMARY_M3_3',
        customerReachable: false,
      });
    }
  }
}

console.log(JSON.stringify({ flipCount: flips.length, flips }, null, 2));
