#!/usr/bin/env node
/**
 * G1.1 HF evidence closure — read-only production forensic extract.
 * Combines ClickHouse HF speed, DIMO historical GPS/fuel, PostGIS resolver probes.
 * Run on VPS: sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd /opt/synqdrive/releases/.../backend && node scripts/ops/refuel-incident-g11-closure.mjs'
 */
import { createClient } from '@clickhouse/client';
import { readFileSync } from 'fs';
import axios from 'axios';
import { Wallet } from 'ethers';

const VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const TOKEN_ID = 187336;
const FROM_ISO = '2026-09-04T03:30:00.000Z';
const TO_ISO = '2026-09-04T04:10:00.000Z';
const ESSO = { lat: 51.32133585, lon: 9.51465858, osmId: 260122108 };
const EVENT_A = { id: '3892fda9-fec6-4412-b735-918ccee75b38', startLat: 51.3305883, startLon: 9.5126383 };
const EVENT_B = { id: '5e0d7e51-42d2-464d-897f-844854614579', startLat: 51.3150216, startLon: 9.5170483 };

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function cleanDbUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url.split('?')[0];
  }
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medoid(points) {
  if (!points.length) return null;
  let best = points[0];
  let bestSum = Infinity;
  for (const p of points) {
    let sum = 0;
    for (const q of points) sum += haversineM(p.lat, p.lon, q.lat, q.lon);
    if (sum < bestSum) {
      bestSum = sum;
      best = p;
    }
  }
  return best;
}

function toLocalCest(utcStr) {
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

let cachedDevJwt = null;
async function getDeveloperJwt(env) {
  if (cachedDevJwt) return cachedDevJwt;
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = env.DIMO_CLIENT_ID;
  const PRIVATE_KEY = env.DIMO_PRIVATE_KEY;
  const DOMAIN = env.DIMO_DOMAIN ?? env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: CLIENT_ID, domain: DOMAIN, scope: 'openid email', response_type: 'code', address: CLIENT_ID },
    timeout: 20000,
  });
  const { state, challenge: msg } = challenge.data;
  const normalizedKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new Wallet(normalizedKey);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({ client_id: CLIENT_ID, domain: DOMAIN, grant_type: 'authorization_code', state, signature }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
  );
  cachedDevJwt = submit.data.developer_jwt ?? submit.data.access_token ?? submit.data.token;
  return cachedDevJwt;
}

async function getVehicleJwt(env, tokenId) {
  const devJwt = await getDeveloperJwt(env);
  const TOKEN_EXCHANGE_URL = env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
  const NFT_CONTRACT = env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT_CONTRACT, privileges: [1, 2, 3, 4, 5, 6], tokenId },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true },
  );
  if (resp.status >= 400) throw new Error(`DIMO_TOKEN_EXCHANGE_${resp.status}`);
  return resp.data.token ?? resp.data.access_token ?? resp.data.jwt;
}

async function dimoGql(env, tokenId, query) {
  const jwt = await getVehicleJwt(env, tokenId);
  const TELEMETRY_URL = env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(TELEMETRY_URL, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 60000,
    validateStatus: () => true,
  });
  return { httpStatus: resp.status, data: resp.data?.data, errors: resp.data?.errors };
}

function detectLowSpeedClusters(samples, { speedThreshold = 3, minPoints = 2, maxGapSec = 30 } = {}) {
  const clusters = [];
  let current = [];
  let lastTs = null;
  for (const s of samples) {
    const ts = new Date(s.timestamp).getTime();
    const gapBreak = lastTs != null && (ts - lastTs) / 1000 > maxGapSec;
    const low = s.speed_kmh != null && s.speed_kmh <= speedThreshold;
    if (low && s.lat != null && s.lon != null && !gapBreak) current.push(s);
    else {
      if (current.length >= minPoints) clusters.push([...current]);
      current = low && s.lat != null ? [s] : [];
    }
    lastTs = ts;
  }
  if (current.length >= minPoints) clusters.push(current);
  return clusters;
}

function summarizeCluster(cluster, label) {
  const lats = cluster.map((p) => p.lat);
  const lons = cluster.map((p) => p.lon);
  const medLat = median(lats);
  const medLon = median(lons);
  const medoidPt = medoid(cluster.map((p) => ({ lat: p.lat, lon: p.lon })));
  const start = cluster[0].timestamp;
  const end = cluster[cluster.length - 1].timestamp;
  const durSec = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  const speeds = cluster.map((p) => p.speed_kmh).filter((v) => v != null);
  return {
    label,
    start_utc: start,
    end_utc: end,
    start_local: toLocalCest(start),
    end_local: toLocalCest(end),
    duration_sec: durSec,
    sample_count: cluster.length,
    median: medLat != null ? { lat: medLat, lon: medLon, dist_esso_m: Math.round(haversineM(medLat, medLon, ESSO.lat, ESSO.lon)) } : null,
    medoid: medoidPt ? { lat: medoidPt.lat, lon: medoidPt.lon, dist_esso_m: Math.round(haversineM(medoidPt.lat, medoidPt.lon, ESSO.lat, ESSO.lon)) } : null,
    speed_min: speeds.length ? Math.min(...speeds) : null,
    speed_max: speeds.length ? Math.max(...speeds) : null,
    speed_median: median(speeds),
  };
}

// Stage-2 semantic physical refuel matcher (dry-run design)
function samePhysicalRefuel(a, b, tolerances = { fuelLiters: 0.5, fuelPct: 0.2, endTimeSec: 60, odometerKm: 1 }) {
  if (a.vehicleId !== b.vehicleId) return { match: false, reason: 'different_vehicle' };
  if (a.kind !== 'REFUEL' || b.kind !== 'REFUEL') return { match: false, reason: 'not_refuel' };
  const endDelta = Math.abs(new Date(a.endTime).getTime() - new Date(b.endTime).getTime()) / 1000;
  if (endDelta > tolerances.endTimeSec) return { match: false, reason: 'end_time_mismatch' };
  const fuelEndA = a.fuelEndLiters ?? a.fuel_delta_end;
  const fuelEndB = b.fuelEndLiters ?? b.fuel_delta_end;
  if (fuelEndA != null && fuelEndB != null && Math.abs(fuelEndA - fuelEndB) > tolerances.fuelLiters) {
    return { match: false, reason: 'terminal_fuel_liters_mismatch' };
  }
  const odoA = a.odometerEndKm;
  const odoB = b.odometerEndKm;
  if (odoA != null && odoB != null && Math.abs(odoA - odoB) > tolerances.odometerKm) {
    return { match: false, reason: 'odometer_mismatch' };
  }
  const overlap =
    Math.max(0, Math.min(new Date(a.endTime).getTime(), new Date(b.endTime).getTime()) -
      Math.max(new Date(a.startTime).getTime(), new Date(b.startTime).getTime())) / 1000;
  const contained =
    new Date(b.startTime) >= new Date(a.startTime) && new Date(b.endTime) <= new Date(a.endTime);
  const suffixCompatible =
    a.fuelStartLiters != null && a.fuelEndLiters != null && b.fuelStartLiters != null && b.fuelEndLiters != null &&
    Math.abs(a.fuelEndLiters - b.fuelEndLiters) <= tolerances.fuelLiters &&
    b.fuelStartLiters >= a.fuelStartLiters &&
    b.fuelEndLiters <= a.fuelEndLiters + tolerances.fuelLiters;
  if (!contained && overlap < 60) return { match: false, reason: 'no_window_overlap' };
  if (!suffixCompatible && !contained) return { match: false, reason: 'transition_incompatible' };
  const completenessScore = (row) => (row.fuelDeltaLiters ?? 0) * 10 + (row.durationSeconds ?? 0);
  const canonical = completenessScore(a) >= completenessScore(b) ? 'A' : 'B';
  return { match: true, reason: 'physical_sibling', canonicalPrefer: canonical, contained, suffixCompatible };
}

async function main() {
  const envPath = process.env.BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
  const env = process.env.CLICKHOUSE_URL ? process.env : loadEnv(envPath);
  const out = { ok: true, sources: {} };

  // ClickHouse HF speed
  const ch = createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER || 'default',
    password: env.CLICKHOUSE_PASSWORD || '',
    database: env.CLICKHOUSE_DATABASE || 'synqdrive',
  });
  const speedRows = await ch.query({
    query: `SELECT formatDateTime(recorded_at,'%Y-%m-%d %H:%i:%S') recorded_utc, formatDateTime(ingested_at,'%Y-%m-%d %H:%i:%S') ingested_utc, value_float speed_kmh, source FROM telemetry_hf_points WHERE vehicle_id={vid:String} AND signal_name='speed' AND recorded_at>=toDateTime64('2026-09-04 03:30:00',3,'UTC') AND recorded_at<toDateTime64('2026-09-04 04:10:00',3,'UTC') ORDER BY recorded_at`,
    query_params: { vid: VEHICLE_ID },
    format: 'JSONEachRow',
  });
  const hfSpeed = await speedRows.json();
  out.sources.clickhouse_hf_speed = { count: hfSpeed.length, first: hfSpeed[0], last: hfSpeed[hfSpeed.length - 1] };

  const sigInv = await ch.query({
    query: `SELECT signal_name, count() c FROM telemetry_hf_points WHERE vehicle_id={vid:String} AND recorded_at>=toDateTime64('2026-09-04 03:30:00',3,'UTC') AND recorded_at<toDateTime64('2026-09-04 04:10:00',3,'UTC') GROUP BY signal_name ORDER BY c DESC`,
    query_params: { vid: VEHICLE_ID },
    format: 'JSONEachRow',
  });
  out.sources.clickhouse_signal_inventory = await sigInv.json();
  await ch.close();

  // DIMO route + fuel
  const routeQuery = `
    query RouteEnrichment {
      signals(tokenId: ${TOKEN_ID}, from: "${FROM_ISO}", to: "${TO_ISO}", interval: "7s") {
        timestamp
        currentLocationCoordinates(agg: RAND) { latitude longitude }
        speed(agg: AVG)
      }
    }`;
  const fuelQuery = `
    query RefuelFuelLevelSamples {
      signals(tokenId: ${TOKEN_ID}, from: "${FROM_ISO}", to: "${TO_ISO}", interval: "30s") {
        timestamp
        powertrainFuelSystemAbsoluteLevel(agg: AVG)
        powertrainFuelSystemRelativeLevel(agg: AVG)
      }
    }`;

  const routeResp = await dimoGql(env, TOKEN_ID, routeQuery);
  const fuelResp = await dimoGql(env, TOKEN_ID, fuelQuery);
  out.sources.dimo_route = { httpStatus: routeResp.httpStatus, errors: routeResp.errors?.map((e) => e.message) ?? null };
  out.sources.dimo_fuel = { httpStatus: fuelResp.httpStatus, errors: fuelResp.errors?.map((e) => e.message) ?? null };

  const routeSignals = routeResp.data?.signals ?? [];
  const routePoints = routeSignals
    .filter((s) => s?.timestamp)
    .map((s) => ({
      timestamp: s.timestamp,
      lat: s.currentLocationCoordinates?.latitude ?? null,
      lon: s.currentLocationCoordinates?.longitude ?? null,
      speed_kmh: typeof s.speed === 'number' ? s.speed : null,
      dist_esso_m: s.currentLocationCoordinates?.latitude != null
        ? Math.round(haversineM(s.currentLocationCoordinates.latitude, s.currentLocationCoordinates.longitude, ESSO.lat, ESSO.lon))
        : null,
    }));

  const fuelSamples = (fuelResp.data?.signals ?? [])
    .filter((s) => s?.timestamp)
    .map((s) => ({
      timestamp: s.timestamp,
      fuel_l: s.powertrainFuelSystemAbsoluteLevel ?? null,
      fuel_pct: s.powertrainFuelSystemRelativeLevel ?? null,
    }));

  out.dimo_route_point_count = routePoints.length;
  out.dimo_fuel_sample_count = fuelSamples.length;

  const clusters3 = detectLowSpeedClusters(routePoints, { speedThreshold: 3, minPoints: 2 });
  const clusters5 = detectLowSpeedClusters(routePoints, { speedThreshold: 5, minPoints: 2 });
  const clusterSummaries = [...clusters3, ...clusters5].map((c, i) =>
    summarizeCluster(c, `cluster_${i + 1}`),
  ).sort((a, b) => b.duration_sec - a.duration_sec);

  out.dwell_clusters = clusterSummaries;

  // Esso proximity during incident
  const nearEsso = routePoints.filter((p) => p.dist_esso_m != null && p.dist_esso_m <= 80);
  out.points_within_80m_esso = nearEsso.length;
  out.nearest_esso_point = routePoints.reduce(
    (best, p) => (p.dist_esso_m != null && (best == null || p.dist_esso_m < best.dist_esso_m) ? p : best),
    null,
  );

  // Fuel rise from DIMO samples
  let firstRise = null;
  for (let i = 1; i < fuelSamples.length; i++) {
    if (fuelSamples[i].fuel_l != null && fuelSamples[i - 1].fuel_l != null && fuelSamples[i].fuel_l > fuelSamples[i - 1].fuel_l + 0.3) {
      firstRise = fuelSamples[i];
      break;
    }
  }
  out.dimo_first_fuel_rise = firstRise;

  // Coordinate policies with DIMO route
  const riseStartUtc = '2026-09-04T03:47:45.000Z';
  const riseEndUtc = '2026-09-04T03:52:45.000Z';
  const preRise = routePoints.filter((p) => new Date(p.timestamp) < new Date(riseStartUtc));
  const riseWindow = routePoints.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= new Date(riseStartUtc).getTime() && t <= new Date(riseEndUtc).getTime();
  });
  const preRiseClusters = detectLowSpeedClusters(preRise, { speedThreshold: 3, minPoints: 2 });
  const bestPreRise = preRiseClusters.sort((a, b) => b.length - a.length)[0];

  const policies = [];
  const addPolicy = (policy, lat, lon, window, count) => {
    if (lat == null || lon == null) return;
    policies.push({
      policy,
      lat,
      lon,
      window,
      sample_count: count,
      dist_esso_m: Math.round(haversineM(lat, lon, ESSO.lat, ESSO.lon)),
    });
  };
  addPolicy('A_segment_start', EVENT_A.startLat, EVENT_A.startLon, 'event A', 1);
  addPolicy('B_segment_start', EVENT_B.startLat, EVENT_B.startLon, 'event B', 1);
  const riseStartPt = routePoints.find((p) => new Date(p.timestamp) >= new Date(riseStartUtc));
  if (riseStartPt?.lat != null) addPolicy('B_rise_start_gps', riseStartPt.lat, riseStartPt.lon, riseStartPt.timestamp, 1);
  addPolicy('C_rise_median', median(riseWindow.map((p) => p.lat).filter(Boolean)), median(riseWindow.map((p) => p.lon).filter(Boolean)), `${riseStartUtc}..${riseEndUtc}`, riseWindow.length);
  const rm = medoid(riseWindow.filter((p) => p.lat != null).map((p) => ({ lat: p.lat, lon: p.lon })));
  if (rm) addPolicy('D_rise_medoid', rm.lat, rm.lon, `${riseStartUtc}..${riseEndUtc}`, riseWindow.length);
  if (bestPreRise?.length) {
    addPolicy('E_pre_rise_dwell_median', median(bestPreRise.map((p) => p.lat)), median(bestPreRise.map((p) => p.lon)), `${bestPreRise[0].timestamp}..${bestPreRise.at(-1).timestamp}`, bestPreRise.length);
    const m = medoid(bestPreRise.map((p) => ({ lat: p.lat, lon: p.lon })));
    if (m) addPolicy('F_pre_rise_dwell_medoid', m.lat, m.lon, `${bestPreRise[0].timestamp}..${bestPreRise.at(-1).timestamp}`, bestPreRise.length);
  }
  if (clusterSummaries[0]?.medoid) {
    const c = clusterSummaries[0];
    addPolicy('G_longest_dwell_medoid', c.medoid.lat, c.medoid.lon, `${c.start_utc}..${c.end_utc}`, c.sample_count);
  }
  out.coordinate_policies = policies;

  // Motion trace condensed 03:38-03:53
  out.motion_trace = routePoints
    .filter((p) => p.timestamp >= '2026-09-04T03:38:00.000Z' && p.timestamp <= '2026-09-04T03:53:00.000Z')
    .map((p) => ({ ...p, local: toLocalCest(p.timestamp) }));

  out.fuel_trace = fuelSamples.map((f) => ({ ...f, local: toLocalCest(f.timestamp) }));

  // HF speed-only stationary inference (evidence-labelled threshold)
  const hfClusters = detectLowSpeedClusters(
    hfSpeed.map((r) => ({ timestamp: r.recorded_utc + 'Z', speed_kmh: r.speed_kmh, lat: null, lon: null })),
    { speedThreshold: 3, minPoints: 3, maxGapSec: 60 },
  );
  out.hf_speed_only_clusters = hfClusters.map((c, i) => ({
    label: `hf_speed<=3_${i + 1}`,
    start_utc: c[0].timestamp,
    end_utc: c[c.length - 1].timestamp,
    start_local: toLocalCest(c[0].timestamp),
    end_local: toLocalCest(c[c.length - 1].timestamp),
    duration_sec: (new Date(c[c.length - 1].timestamp).getTime() - new Date(c[0].timestamp).getTime()) / 1000,
    sample_count: c.length,
    speed_median: median(c.map((p) => p.speed_kmh).filter((v) => v != null)),
    note: 'GPS unavailable in ClickHouse HF for this vehicle/window',
  }));

  out.leader_election_flag = env.SCHEDULER_LEADER_ELECTION_ENABLED ?? null;

  // Postgres historical REFUEL dry-run via child_process would need psql; skip if unavailable
  out.timing_vs_owner = {
    owner_arrival_approx_local: '05:43',
    owner_departure_approx_local: '05:47',
    eventA_rise_start_local: '05:47:45',
    eventB_rise_start_local: '05:49:13',
    eventA_rise_end_local: '05:52:45',
    offsets_vs_departure_0547: {
      A_rise_start_sec: 45,
      B_rise_start_sec: 133,
      rise_end_sec: 343,
    },
    offsets_vs_arrival_0543: {
      A_rise_start_sec: 285,
      B_rise_start_sec: 373,
    },
    note: 'Separate physical-stop→rise-onset from departure→rise-end; do not collapse into single lag label',
  };

  out.physical_refuel_identity_incident = samePhysicalRefuel(
    {
      vehicleId: VEHICLE_ID,
      kind: 'REFUEL',
      startTime: '2026-09-04T03:40:45.000Z',
      endTime: '2026-09-04T03:55:10.000Z',
      fuelStartLiters: 7,
      fuelEndLiters: 28,
      fuelDeltaLiters: 21,
      durationSeconds: 865,
      odometerEndKm: 187740,
    },
    {
      vehicleId: VEHICLE_ID,
      kind: 'REFUEL',
      startTime: '2026-09-04T03:48:43.109Z',
      endTime: '2026-09-04T03:55:10.000Z',
      fuelStartLiters: 21,
      fuelEndLiters: 28,
      fuelDeltaLiters: 7,
      durationSeconds: 386,
      odometerEndKm: 187740,
    },
  );

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 3) }));
  process.exit(1);
});
