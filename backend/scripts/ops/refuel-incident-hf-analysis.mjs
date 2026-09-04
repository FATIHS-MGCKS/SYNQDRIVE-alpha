#!/usr/bin/env node
/**
 * Read-only HF forensic analysis for KS MX 2026-09-04 refuel incident.
 * Run on VPS: sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a; node refuel-incident-hf-analysis.mjs'
 * Does not print secrets.
 */
import { createClient } from '@clickhouse/client';
import { readFileSync } from 'fs';

const VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const FROM = '2026-09-04 03:30:00';
const TO = '2026-09-04 04:10:00';
const ESSO_CENTROID = { lat: 51.32133585, lon: 9.51465858, osmId: 260122108 };
const ARAL_CENTROID = { lat: 51.3234562, lon: 9.5180121, osmId: 697554280 }; // approximate from prior probe

const SIGNALS = [
  'currentLocationLatitude',
  'currentLocationLongitude',
  'speed',
  'powertrainFuelSystemAbsoluteLevel',
  'powertrainFuelSystemRelativeLevel',
  'odometer',
  'isIgnitionOn',
  'powertrainTransmissionTravelledDistance',
];

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

function medoid(points) {
  if (points.length === 0) return null;
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

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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

function pivotRows(rows) {
  const byTs = new Map();
  for (const r of rows) {
    const key = r.recorded_utc;
    if (!byTs.has(key)) {
      byTs.set(key, {
        recorded_utc: r.recorded_utc,
        ingested_utc: r.ingested_utc,
        source: r.source,
      });
    }
    const slot = byTs.get(key);
    if (r.signal_name === 'currentLocationLatitude') slot.lat = r.value_float;
    if (r.signal_name === 'currentLocationLongitude') slot.lon = r.value_float;
    if (r.signal_name === 'speed') slot.speed_kmh = r.value_float;
    if (r.signal_name === 'powertrainFuelSystemAbsoluteLevel') slot.fuel_l = r.value_float;
    if (r.signal_name === 'powertrainFuelSystemRelativeLevel') slot.fuel_pct = r.value_float;
    if (r.signal_name === 'odometer' || r.signal_name === 'powertrainTransmissionTravelledDistance') {
      slot.odometer = r.value_float ?? slot.odometer;
    }
    if (r.signal_name === 'isIgnitionOn') slot.ignition = r.value_float ?? r.value_bool;
  }
  return [...byTs.values()].sort((a, b) => a.recorded_utc.localeCompare(b.recorded_utc));
}

function detectDwellClusters(samples, { speedThreshold = 3, minPoints = 3, maxGapSec = 45 } = {}) {
  const clusters = [];
  let current = [];
  let lastTs = null;
  for (const s of samples) {
    const ts = new Date(s.recorded_utc + 'Z').getTime();
    const lowSpeed = s.speed_kmh != null && s.speed_kmh <= speedThreshold;
    const gapBreak = lastTs != null && (ts - lastTs) / 1000 > maxGapSec;
    if (lowSpeed && s.lat != null && s.lon != null && !gapBreak) {
      current.push(s);
    } else if (current.length) {
      if (current.length >= minPoints) clusters.push([...current]);
      current = lowSpeed && s.lat != null ? [s] : [];
    }
    lastTs = ts;
  }
  if (current.length >= minPoints) clusters.push(current);
  return clusters;
}

async function main() {
  const envPath = process.env.BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
  const env = process.env.CLICKHOUSE_URL ? process.env : loadEnv(envPath);
  const client = createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER || 'default',
    password: env.CLICKHOUSE_PASSWORD || '',
    database: env.CLICKHOUSE_DATABASE || 'synqdrive',
  });

  const result = await client.query({
    query: `
      SELECT
        formatDateTime(recorded_at, '%Y-%m-%d %H:%i:%S') AS recorded_utc,
        formatDateTime(ingested_at, '%Y-%m-%d %H:%i:%S') AS ingested_utc,
        signal_name,
        value_float,
        value_bool,
        source
      FROM telemetry_hf_points
      WHERE vehicle_id = {vehicleId:String}
        AND recorded_at >= toDateTime64({fromTs:String}, 3, 'UTC')
        AND recorded_at < toDateTime64({toTs:String}, 3, 'UTC')
        AND signal_name IN {signals:Array(String)}
      ORDER BY recorded_at, signal_name
    `,
    query_params: { vehicleId: VEHICLE_ID, fromTs: FROM, toTs: TO, signals: SIGNALS },
    format: 'JSONEachRow',
  });
  const rows = await result.json();

  // Discover all signals in window (for forensic diagnostics)
  const allSignals = await client.query({
    query: `
      SELECT signal_name, count() AS c,
        min(formatDateTime(recorded_at, '%Y-%m-%d %H:%i:%S')) AS first_utc,
        max(formatDateTime(recorded_at, '%Y-%m-%d %H:%i:%S')) AS last_utc
      FROM telemetry_hf_points
      WHERE vehicle_id = {vehicleId:String}
        AND recorded_at >= toDateTime64({fromTs:String}, 3, 'UTC')
        AND recorded_at < toDateTime64({toTs:String}, 3, 'UTC')
      GROUP BY signal_name ORDER BY c DESC
    `,
    query_params: { vehicleId: VEHICLE_ID, fromTs: FROM, toTs: TO },
    format: 'JSONEachRow',
  });
  const signalInventory = await allSignals.json();

  const pivoted = pivotRows(rows);

  const withGps = pivoted.filter((p) => p.lat != null && p.lon != null);
  const withSpeed = pivoted.filter((p) => p.speed_kmh != null);
  const fuelSamples = pivoted.filter((p) => p.fuel_l != null);

  const ingressLagMs = pivoted
    .filter((p) => p.ingested_utc)
    .map((p) => new Date(p.ingested_utc + 'Z').getTime() - new Date(p.recorded_utc + 'Z').getTime());

  const clusters3 = detectDwellClusters(withGps, { speedThreshold: 3, minPoints: 3 });
  const clusters5 = detectDwellClusters(withGps, { speedThreshold: 5, minPoints: 3 });

  function clusterSummary(cluster, label) {
    const lats = cluster.map((p) => p.lat);
    const lons = cluster.map((p) => p.lon);
    const medLat = median(lats);
    const medLon = median(lons);
    const medoidPt = medoid(cluster.map((p) => ({ lat: p.lat, lon: p.lon })));
    const start = cluster[0].recorded_utc;
    const end = cluster[cluster.length - 1].recorded_utc;
    const durSec =
      (new Date(end + 'Z').getTime() - new Date(start + 'Z').getTime()) / 1000;
    const speeds = cluster.map((p) => p.speed_kmh).filter((v) => v != null);
    return {
      label,
      start_utc: start,
      end_utc: end,
      duration_sec: durSec,
      sample_count: cluster.length,
      median: { lat: medLat, lon: medLon, dist_esso_m: Math.round(haversineM(medLat, medLon, ESSO_CENTROID.lat, ESSO_CENTROID.lon)), dist_aral_m: Math.round(haversineM(medLat, medLon, ARAL_CENTROID.lat, ARAL_CENTROID.lon)) },
      medoid: medoidPt
        ? {
            lat: medoidPt.lat,
            lon: medoidPt.lon,
            dist_esso_m: Math.round(haversineM(medoidPt.lat, medoidPt.lon, ESSO_CENTROID.lat, ESSO_CENTROID.lon)),
            dist_aral_m: Math.round(haversineM(medoidPt.lat, medoidPt.lon, ARAL_CENTROID.lat, ARAL_CENTROID.lon)),
          }
        : null,
      speed_min: speeds.length ? Math.min(...speeds) : null,
      speed_max: speeds.length ? Math.max(...speeds) : null,
      speed_median: median(speeds),
    };
  }

  const clusterSummaries = [
    ...clusters3.map((c, i) => clusterSummary(c, `dwell_speed<=3_${i + 1}`)),
    ...clusters5.map((c, i) => clusterSummary(c, `dwell_speed<=5_${i + 1}`)),
  ].sort((a, b) => b.duration_sec - a.duration_sec);

  const longestDwell = clusterSummaries[0] ?? null;

  // First fuel increase
  let firstRise = null;
  for (let i = 1; i < fuelSamples.length; i++) {
    const prev = fuelSamples[i - 1];
    const cur = fuelSamples[i];
    if (cur.fuel_l > prev.fuel_l + 0.3) {
      firstRise = cur;
      break;
    }
  }

  // Stabilization near 28L
  const plateau = fuelSamples.filter((f) => f.fuel_l >= 27.5 && f.fuel_l <= 28.5);

  // Departure: first sustained speed > 15 after longest dwell end
  let departure = null;
  if (longestDwell) {
    const after = withGps.filter((p) => p.recorded_utc > longestDwell.end_utc);
    for (const p of after) {
      if (p.speed_kmh != null && p.speed_kmh > 15) {
        departure = p;
        break;
      }
    }
  }

  // Coordinate policy candidates
  const eventAStart = { lat: 51.3305883, lon: 9.5126383, label: 'A_segment_start' };
  const eventBStart = { lat: 51.3150216, lon: 9.5170483, label: 'B_segment_start' };
  const riseAStart = '2026-09-04 03:47:45';
  const riseBStart = '2026-09-04 03:49:13';
  const riseEnd = '2026-09-04 03:52:45';

  const riseWindow = withGps.filter(
    (p) => p.recorded_utc >= riseAStart && p.recorded_utc <= riseEnd,
  );
  const preRise = withGps.filter((p) => p.recorded_utc < riseAStart);

  const policies = [];
  function addPolicy(label, lat, lon, window, count) {
    if (lat == null || lon == null) return;
    policies.push({
      policy: label,
      lat,
      lon,
      sample_count: count,
      window,
      dist_esso_m: Math.round(haversineM(lat, lon, ESSO_CENTROID.lat, ESSO_CENTROID.lon)),
      dist_aral_m: Math.round(haversineM(lat, lon, ARAL_CENTROID.lat, ARAL_CENTROID.lon)),
    });
  }

  addPolicy('A_segment_start', eventAStart.lat, eventAStart.lon, 'segment A start', 1);
  addPolicy('B_segment_start', eventBStart.lat, eventBStart.lon, 'segment B start', 1);

  const riseStartPt = withGps.find((p) => p.recorded_utc >= riseAStart);
  if (riseStartPt) addPolicy('B_fuel_rise_start_gps', riseStartPt.lat, riseStartPt.lon, riseStartPt.recorded_utc, 1);

  const riseLats = riseWindow.map((p) => p.lat).filter((v) => v != null);
  const riseLons = riseWindow.map((p) => p.lon).filter((v) => v != null);
  addPolicy('C_rise_median', median(riseLats), median(riseLons), `${riseAStart}..${riseEnd}`, riseWindow.length);
  const riseMedoid = medoid(riseWindow.filter((p) => p.lat != null).map((p) => ({ lat: p.lat, lon: p.lon })));
  if (riseMedoid) addPolicy('D_rise_medoid', riseMedoid.lat, riseMedoid.lon, `${riseAStart}..${riseEnd}`, riseWindow.length);

  const preRiseDwell = detectDwellClusters(preRise, { speedThreshold: 3, minPoints: 2 });
  const bestPreRise = preRiseDwell.sort((a, b) => b.length - a.length)[0];
  if (bestPreRise?.length) {
    const lats = bestPreRise.map((p) => p.lat);
    const lons = bestPreRise.map((p) => p.lon);
    addPolicy('E_pre_rise_dwell_median', median(lats), median(lons), `${bestPreRise[0].recorded_utc}..${bestPreRise.at(-1).recorded_utc}`, bestPreRise.length);
    const m = medoid(bestPreRise.map((p) => ({ lat: p.lat, lon: p.lon })));
    if (m) addPolicy('F_pre_rise_dwell_medoid', m.lat, m.lon, `${bestPreRise[0].recorded_utc}..${bestPreRise.at(-1).recorded_utc}`, bestPreRise.length);
  }

  if (longestDwell?.median) {
    addPolicy('G_longest_dwell_median', longestDwell.median.lat, longestDwell.median.lon, `${longestDwell.start_utc}..${longestDwell.end_utc}`, longestDwell.sample_count);
  }
  if (longestDwell?.medoid) {
    addPolicy('H_longest_dwell_medoid', longestDwell.medoid.lat, longestDwell.medoid.lon, `${longestDwell.start_utc}..${longestDwell.end_utc}`, longestDwell.sample_count);
  }

  // Motion trace (condensed) 03:38-03:53 UTC
  const trace = withGps
    .filter((p) => p.recorded_utc >= '2026-09-04 03:38:00' && p.recorded_utc <= '2026-09-04 03:53:00')
    .map((p) => ({
      recorded_utc: p.recorded_utc,
      lat: p.lat,
      lon: p.lon,
      speed_kmh: p.speed_kmh,
      fuel_l: p.fuel_l,
      dist_esso_m: Math.round(haversineM(p.lat, p.lon, ESSO_CENTROID.lat, ESSO_CENTROID.lon)),
    }));

  const fuelTrace = fuelSamples
    .filter((f) => f.recorded_utc >= '2026-09-04 03:38:00' && f.recorded_utc <= '2026-09-04 03:55:00')
    .map((f) => ({
      recorded_utc: f.recorded_utc,
      ingested_utc: f.ingested_utc,
      fuel_l: f.fuel_l,
      fuel_pct: f.fuel_pct,
      ingress_lag_ms: new Date(f.ingested_utc + 'Z').getTime() - new Date(f.recorded_utc + 'Z').getTime(),
      speed_kmh: f.speed_kmh,
      lat: f.lat,
      lon: f.lon,
    }));

  const out = {
    ok: true,
    signal_inventory: signalInventory,
    row_count: rows.length,
    pivoted_count: pivoted.length,
    gps_samples: withGps.length,
    speed_samples: withSpeed.length,
    fuel_samples: fuelSamples.length,
    ingress_lag_ms: {
      min: ingressLagMs.length ? Math.min(...ingressLagMs) : null,
      median: ingressLagMs.length ? median(ingressLagMs) : null,
      max: ingressLagMs.length ? Math.max(...ingressLagMs) : null,
      p95: ingressLagMs.length
        ? [...ingressLagMs].sort((a, b) => a - b)[Math.floor(ingressLagMs.length * 0.95)]
        : null,
    },
    dwell_clusters: clusterSummaries,
    longest_dwell: longestDwell,
    first_fuel_rise_hf: firstRise
      ? {
          recorded_utc: firstRise.recorded_utc,
          fuel_l: firstRise.fuel_l,
          speed_kmh: firstRise.speed_kmh,
          lat: firstRise.lat,
          lon: firstRise.lon,
          dist_esso_m: firstRise.lat != null ? Math.round(haversineM(firstRise.lat, firstRise.lon, ESSO_CENTROID.lat, ESSO_CENTROID.lon)) : null,
        }
      : null,
    plateau_samples: plateau.length,
    plateau_first_utc: plateau[0]?.recorded_utc ?? null,
    departure_after_dwell: departure
      ? {
          recorded_utc: departure.recorded_utc,
          speed_kmh: departure.speed_kmh,
          lat: departure.lat,
          lon: departure.lon,
        }
      : null,
    coordinate_policies: policies,
    motion_trace: trace,
    fuel_trace: fuelTrace,
    leader_election_flag: process.env.SCHEDULER_LEADER_ELECTION_ENABLED ?? null,
  };

  console.log(JSON.stringify(out, null, 2));
  await client.close();
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
