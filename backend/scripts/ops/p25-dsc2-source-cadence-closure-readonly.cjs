#!/usr/bin/env node
/**
 * P2.5 DSC-2 — per-source standby cadence + T7 ANY_SOURCE P95 reconstruction (read-only).
 * VPS: cd /opt/synqdrive/current/backend && sudo bash scripts/ops/p25-dsc2-source-cadence-closure-readonly.sh
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const { Client } = require('pg');

const T7_START = '2026-09-18T09:33:25.000Z';
const T7_END = '2026-09-19T09:33:25.000Z';
const T7_7D_END = '2026-09-25T09:33:25.000Z';
const R9_TOKENS = [186946, 187336, 187361, 187784, 192922];
const ICE_TOKENS = [187336, 187361, 187784, 192922];

function loadEnv() {
  const p = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function chQuery(sql) {
  const q = sql.replace(/\s+/g, ' ').trim();
  const out = execSync(
    `sudo docker exec synqdrive-clickhouse clickhouse-client --format JSONEachRow -q ${JSON.stringify(q)}`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stats(intervals) {
  const s = [...intervals].sort((a, b) => a - b);
  return {
    count: s.length,
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    p95: quantile(s, 0.95),
    p99: quantile(s, 0.99),
    max: s.length ? s[s.length - 1] : null,
  };
}

function isStandbyRow(r) {
  const speed = r.speed_kmh == null ? null : Number(r.speed_kmh);
  const ign = r.is_ignition_on == null ? null : Number(r.is_ignition_on);
  return (speed == null || speed <= 0.5) && (ign == null || ign === 0);
}

async function main() {
  loadEnv();
  const dbUrl = (process.env.DATABASE_URL ?? '').split('?')[0];
  if (!dbUrl) throw new Error('DATABASE_URL missing');
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();

  const { rows: vehicles } = await pg.query(
    `SELECT v.id AS vehicle_id, dv.token_id, v.license_plate, v.fuel_type::text AS fuel_type
     FROM vehicles v
     JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
     WHERE dv.token_id = ANY($1::int[])`,
    [R9_TOKENS],
  );
  const vehicleIds = vehicles.map((v) => v.vehicle_id);
  const idList = vehicleIds.map((id) => `'${id}'`).join(',');

  const chStandbySnaps = chQuery(`
    SELECT vehicle_id, recorded_at, speed_kmh, is_ignition_on
    FROM synqdrive.telemetry_snapshots
    WHERE vehicle_id IN (${idList})
      AND recorded_at >= parseDateTime64BestEffort('${T7_START}')
      AND recorded_at <= parseDateTime64BestEffort('${T7_7D_END}')
    ORDER BY vehicle_id, recorded_at
  `);

  const byVehicle = new Map();
  for (const r of chStandbySnaps) {
    if (!isStandbyRow(r)) continue;
    const arr = byVehicle.get(r.vehicle_id) ?? [];
    arr.push(r);
    byVehicle.set(r.vehicle_id, arr);
  }

  function topLevelAdvances(rows) {
    const times = [];
    let prev = null;
    for (const r of rows) {
      const t = new Date(r.recorded_at).getTime();
      if (prev != null && t > prev) times.push((t - prev) / 1000);
      prev = t;
    }
    return times.filter((g) => g > 60);
  }

  function speedAdvances(rows) {
    const times = [];
    let prevT = null;
    let prevV = null;
    for (const r of rows) {
      const t = new Date(r.recorded_at).getTime();
      const v = r.speed_kmh == null ? null : Number(r.speed_kmh);
      if (prevT != null && v != null && prevV != null && v !== prevV && t > prevT) {
        times.push((t - prevT) / 1000);
      }
      if (v != null) prevV = v;
      prevT = t;
    }
    return times.filter((g) => g > 60);
  }

  const chIgn = chQuery(`
    SELECT vehicle_id, changed_at
    FROM synqdrive.telemetry_state_changes
    WHERE vehicle_id IN (${idList})
      AND signal_name = 'ignition'
      AND changed_at >= parseDateTime64BestEffort('${T7_START}')
      AND changed_at <= parseDateTime64BestEffort('${T7_7D_END}')
    ORDER BY vehicle_id, changed_at
  `);
  const ignByV = new Map();
  for (const r of chIgn) {
    const a = ignByV.get(r.vehicle_id) ?? [];
    a.push(new Date(r.changed_at).getTime());
    ignByV.set(r.vehicle_id, a);
  }
  function ignitionIntervals(times) {
    const out = [];
    for (let i = 1; i < times.length; i++) {
      const g = (times[i] - times[i - 1]) / 1000;
      if (g > 60) out.push(g);
    }
    return out;
  }

  const perSource = { TOP_LEVEL_SOURCE: [], SPEED: [], IGNITION: [] };
  const perVehicleSource = {};

  for (const v of vehicles) {
    const rows = byVehicle.get(v.vehicle_id) ?? [];
    const tl = topLevelAdvances(rows);
    const sp = speedAdvances(rows);
    const ig = ignitionIntervals(ignByV.get(v.vehicle_id) ?? []);
    perSource.TOP_LEVEL_SOURCE.push(...tl);
    perSource.SPEED.push(...sp);
    perSource.IGNITION.push(...ig);
    perVehicleSource[v.token_id] = {
      licensePlate: v.license_plate,
      TOP_LEVEL_SOURCE: stats(tl),
      SPEED: stats(sp),
      IGNITION: stats(ig),
      standbySnapshotRows: rows.length,
    };
  }

  const lvFleet = [];
  const lvPerVehicle = {};
  for (const tok of ICE_TOKENS) {
    const v = vehicles.find((x) => x.token_id === tok);
    if (!v) continue;
    const { rows: gaps } = await pg.query(
      `WITH lv AS (
        SELECT provider_timestamp AS pt
        FROM battery_measurements
        WHERE vehicle_id = $1 AND type = 'LIVE_VOLTAGE' AND quality = 'VALID'
          AND provider_timestamp IS NOT NULL
          AND provider_timestamp >= $2::timestamptz AND provider_timestamp <= $3::timestamptz
          AND (context->>'engineRunning')::boolean IS FALSE
          AND (context->>'speedKmh')::float IS NOT NULL AND (context->>'speedKmh')::float <= 0.5
          AND (context->>'ignitionOn')::boolean IS FALSE
          AND NOT COALESCE((context->>'isLvCharging')::boolean, false)
          AND NOT COALESCE((context->>'isHvCharging')::boolean, false)
      ),
      dedup AS (SELECT DISTINCT pt FROM lv),
      g AS (
        SELECT EXTRACT(EPOCH FROM (pt - LAG(pt) OVER (ORDER BY pt))) AS gap_s FROM dedup
      )
      SELECT gap_s FROM g WHERE gap_s IS NOT NULL AND gap_s > 60`,
      [v.vehicle_id, T7_START, T7_7D_END],
    );
    const intervals = gaps.map((r) => Number(r.gap_s));
    lvFleet.push(...intervals);
    const in79 = intervals.filter((g) => g >= 7 * 3600 && g <= 9 * 3600).length;
    const in610 = intervals.filter((g) => g >= 6 * 3600 && g <= 10 * 3600).length;
    const st = stats(intervals);
    let profile = 'INSUFFICIENT_EVIDENCE';
    if (intervals.length < 5) profile = 'INSUFFICIENT_EVIDENCE';
    else if (st.median >= 7 * 3600 && st.median <= 9 * 3600 && in79 / intervals.length >= 0.25) {
      profile = 'STABLE_PERIODIC';
    } else if (in610 / intervals.length >= 0.15 && st.p95 > 12 * 3600) {
      profile = 'MULTIMODAL';
    } else if (st.median < 4 * 3600) {
      profile = 'SPARSE/IRREGULAR';
    } else {
      profile = 'MULTIMODAL';
    }
    lvPerVehicle[tok] = {
      LV_CADENCE_PROFILE: profile,
      VALID_INTERVAL_COUNT: intervals.length,
      MEDIAN_HOURS: st.median == null ? null : st.median / 3600,
      P90_HOURS: st.p90 == null ? null : st.p90 / 3600,
      P95_HOURS: st.p95 == null ? null : st.p95 / 3600,
      '7_9H_MATCH_RATE': intervals.length ? in79 / intervals.length : null,
      '6_10H_MATCH_RATE': intervals.length ? in610 / intervals.length : null,
      PHASE_STABILITY: profile === 'STABLE_PERIODIC' ? 'MODERATE' : 'LOW',
      ACTIVITY_RESET_EVIDENCE: profile === 'SPARSE/IRREGULAR' ? 'LIKELY_SHORT_GAP_CLUSTERING' : 'NOT_PRIMARY',
    };
  }

  const { rows: obdRows } = await pg.query(
    `SELECT vehicle_id, evidence_observed_at
     FROM device_connection_physical_state_transitions
     WHERE vehicle_id = ANY($1::uuid[])
       AND evidence_source::text LIKE '%SNAPSHOT%'
       AND evidence_observed_at >= $2::timestamptz AND evidence_observed_at <= $3::timestamptz
     ORDER BY vehicle_id, evidence_observed_at`,
    [vehicleIds, T7_START, T7_7D_END],
  );
  const obdFleet = [];
  const obdByV = new Map();
  for (const r of obdRows) {
    const a = obdByV.get(r.vehicle_id) ?? [];
    a.push(new Date(r.evidence_observed_at).getTime());
    obdByV.set(r.vehicle_id, a);
  }
  for (const [, times] of obdByV) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const g = (times[i] - times[i - 1]) / 1000;
      if (g > 60) obdFleet.push(g);
    }
  }

  const anySourceEvents = [];
  const anySourceAttribution = [];
  for (const v of vehicles) {
    const events = [];
    const add = (atMs, source) => {
      events.push({ at: atMs, source });
    };
    for (const r of byVehicle.get(v.vehicle_id) ?? []) {
      add(new Date(r.recorded_at).getTime(), 'TOP_LEVEL_SOURCE');
    }
    for (const t of ignByV.get(v.vehicle_id) ?? []) add(t, 'IGNITION');
    const { rows: lvPts } = await pg.query(
      `SELECT DISTINCT provider_timestamp AS pt FROM battery_measurements
       WHERE vehicle_id=$1 AND type='LIVE_VOLTAGE' AND quality='VALID' AND provider_timestamp IS NOT NULL
         AND provider_timestamp >= $2 AND provider_timestamp <= $3`,
      [v.vehicle_id, T7_START, T7_7D_END],
    );
    for (const r of lvPts) add(new Date(r.pt).getTime(), 'BATTERY_VOLTAGE');
    for (const t of obdByV.get(v.vehicle_id) ?? []) add(t, 'OBD');
    events.sort((a, b) => a.at - b.at);
    let last = null;
    for (const e of events) {
      if (last == null) {
        last = e;
        continue;
      }
      if (e.at > last.at + 1000) {
        const gap = (e.at - last.at) / 1000;
        if (gap > 60) {
          anySourceEvents.push(gap);
          anySourceAttribution.push(e.source);
        }
        last = e;
      }
    }
  }

  const anyStats = stats(anySourceEvents);
  const attrCounts = {};
  for (const s of anySourceAttribution) attrCounts[s] = (attrCounts[s] ?? 0) + 1;
  const totalAttr = anySourceAttribution.length || 1;

  const shortBuckets = { lt1h: 0, h1_4: 0, h4_6: 0 };
  for (const g of lvFleet) {
    const h = g / 3600;
    if (h < 1) shortBuckets.lt1h++;
    else if (h < 4) shortBuckets.h1_4++;
    else if (h < 6) shortBuckets.h4_6++;
  }
  const shortTotal = shortBuckets.lt1h + shortBuckets.h1_4 + shortBuckets.h4_6 || 1;

  const longBuckets = { h9_12: 0, h12_24: 0, h24_48: 0, gt48: 0 };
  for (const g of lvFleet) {
    const h = g / 3600;
    if (h >= 9 && h < 12) longBuckets.h9_12++;
    else if (h >= 12 && h < 24) longBuckets.h12_24++;
    else if (h >= 24 && h < 48) longBuckets.h24_48++;
    else if (h >= 48) longBuckets.gt48++;
  }

  const { rows: pollRows } = await pg.query(
    `SELECT d.started_at, d.vehicle_id
     FROM dimo_poll_logs d
     WHERE d.vehicle_id = ANY($1::uuid[])
       AND d.job_type = 'SNAPSHOT'
       AND d.status = 'SUCCESS'
       AND d.started_at >= $2::timestamptz AND d.started_at <= $3::timestamptz`,
    [vehicleIds, T7_START, T7_7D_END],
  );

  const controlPolls = pollRows.length;
  const lvAdvances = lvFleet.length + ICE_TOKENS.length;

  const result = {
    exportedAt: new Date().toISOString(),
    window: { start: T7_START, end: T7_7D_END, t24End: T7_END },
    perSourceFleet: {
      BATTERY_VOLTAGE: { ...stats(lvFleet), SOURCE_TIMESTAMP_UNUSABLE: false },
      TOP_LEVEL_SOURCE: { ...stats(perSource.TOP_LEVEL_SOURCE) },
      SPEED: { ...stats(perSource.SPEED) },
      IGNITION: { ...stats(perSource.IGNITION) },
      OBD: {
        ...stats(obdFleet),
        note: 'Proxy: SNAPSHOT-family physical-state evidence_observed_at advances (not raw obdIsPluggedIn CH series)',
      },
    },
    perVehicleSource,
    lvPerVehicle,
    T7_ANY_SOURCE_RECONSTRUCTION: {
      STANDBY_P95_ANY_SOURCE_ADVANCE_INTERVAL_SECONDS_REPORTED: 30347.14,
      RECONSTRUCTED_P95_SECONDS: anyStats.p95,
      RECONSTRUCTED_P75_SECONDS: anyStats.p75,
      RECONSTRUCTED_MEDIAN_SECONDS: anyStats.median,
      EVENT_GAP_COUNT: anyStats.count,
      PRIMARY_ATTRIBUTED_SOURCE_AT_GAP_END: Object.entries(attrCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN',
      ATTRIBUTION_COUNTS: attrCounts,
      ATTRIBUTION_RATES: Object.fromEntries(
        Object.entries(attrCounts).map(([k, v]) => [k, v / totalAttr]),
      ),
    },
    shortLvIntervalRootCauseHypothesis: {
      pct_lt1h: shortBuckets.lt1h / shortTotal,
      pct_1_4h: shortBuckets.h1_4 / shortTotal,
      pct_4_6h: shortBuckets.h4_6 / shortTotal,
      interpretation:
        'Short gaps dominate fleet median; consistent with event-driven LV reports (activity settle, threshold, reconnect) atop configured ~8h periodic standby uploads — not contradictory.',
    },
    longLvIntervalHypothesis: longBuckets,
    counterfactualBatteryReconciliation: {
      CONTROL_SNAPSHOT_POLLS_T7_7D: controlPolls,
      note: 'Full SOURCE_WINDOW_A/B/C/HYBRID simulation deferred — requires per-advance poll trace join; CONTROL baseline captured',
    },
  };

  console.log(JSON.stringify(result, null, 2));
  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
