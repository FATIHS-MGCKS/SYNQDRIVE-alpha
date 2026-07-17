/* READ-ONLY supplemental — correlate rest captures with windows */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
const REST_60M = 60 * 60_000;
const REST_6H = 6 * REST_60M;

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function chQuery(sql) {
  const url = process.env.CLICKHOUSE_URL || 'http://127.0.0.1:8123';
  const auth = Buffer.from(`${process.env.CLICKHOUSE_USER || 'default'}:${process.env.CLICKHOUSE_PASSWORD || ''}`).toString('base64');
  const db = process.env.CLICKHOUSE_DATABASE || 'synqdrive';
  const res = await fetch(`${url}/?database=${encodeURIComponent(db)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'text/plain' },
    body: sql,
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text.trim() ? text.trim().split('\n').map((l) => l.split('\t')) : [];
}

function label(v) {
  return v.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.id.slice(0, 8)}`;
}

function classifySnap(s, restStartMs, chNear) {
  const v = s.restingVoltage ?? s.voltageV;
  const obsMs = new Date(s.recordedAt).getTime();
  const restMin = (obsMs - restStartMs) / 60_000;
  const flags = [];
  if (v > 13.2) flags.push('HIGH_VOLTAGE_GT_13_2');
  if (s.engineRunning) flags.push('ENGINE_RUNNING');
  if (chNear) {
    if (chNear.speed > 5) flags.push('SPEED_GT_5');
    if (chNear.ignition) flags.push('IGNITION_ON');
    if (chNear.traction > 1) flags.push('TRACTION_ACTIVE');
  }
  const near60 = restMin >= 58 && restMin <= 90;
  const near6h = restMin >= 350 && restMin <= 390;
  let bucket = 'OTHER';
  if (near60 && near6h) bucket = 'BOTH_60M_6H_WINDOW';
  else if (near60) bucket = 'NEAR_60M';
  else if (near6h) bucket = 'NEAR_6H';
  else if (restMin < 30) bucket = 'EARLY_POST_TRIP';
  else if (restMin < 58) bucket = 'BETWEEN_30M_60M';
  else bucket = 'LATE_OR_MISALIGNED';
  let cls = 'VALID_REST_SAMPLE';
  if (flags.includes('HIGH_VOLTAGE_GT_13_2')) cls = 'CHARGING_CONTAMINATED';
  else if (flags.includes('SPEED_GT_5') || flags.includes('IGNITION_ON')) cls = 'WAKE_CONTAMINATED';
  else if (!near60 && !near6h) cls = 'CURRENT_IMPLEMENTATION_MISCLASSIFIED';
  else if (flags.length) cls = 'WAKE_CONTAMINATED';
  return { v, restMin: +restMin.toFixed(1), flags, bucket, cls, near60, near6h };
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const out = { generatedAt: new Date().toISOString(), since: since.toISOString() };

  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: { id: true, licensePlate: true, fuelType: true },
  });

  const allSnaps = [];
  const windowStats = { ice: [], bev: [] };

  for (const v of vehicles) {
    const lbl = label(v);
    const ice = (v.fuelType || '').toUpperCase() !== 'ELECTRIC';

    const [trips, snaps, polls] = await Promise.all([
      p.vehicleTrip.findMany({
        where: { vehicleId: v.id, endTime: { not: null, gte: since } },
        orderBy: { endTime: 'asc' },
        select: { id: true, endTime: true, startTime: true },
      }),
      p.batteryHealthSnapshot.findMany({
        where: { vehicleId: v.id, recordedAt: { gte: since }, restingVoltage: { not: null } },
        orderBy: { recordedAt: 'asc' },
      }),
      p.dimoPollLog.findMany({
        where: { vehicleId: v.id, jobType: 'SNAPSHOT', startedAt: { gte: since }, status: 'SUCCESS' },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true },
      }),
    ]);

    let chByProviderTs = [];
    try {
      const rows = await chQuery(`
        SELECT toString(recorded_at), toString(speed_kmh), toString(is_ignition_on), toString(traction_kw), toString(ev_soc)
        FROM telemetry_snapshots
        WHERE vehicle_id = '${v.id}' AND recorded_at >= parseDateTimeBestEffort('${since.toISOString().slice(0, 19)}')
        ORDER BY recorded_at
        FORMAT TabSeparated
      `);
      chByProviderTs = rows.map((r) => ({
        recordedAtMs: new Date(r[0].replace(' ', 'T') + 'Z').getTime(),
        speed: r[1] === '\\N' ? null : parseFloat(r[1]),
        ignition: r[2] === '1',
        traction: r[3] === '\\N' ? null : parseFloat(r[3]),
        evSoc: r[4] === '\\N' ? null : parseFloat(r[4]),
      }));
    } catch (e) {
      out.chError = e.message;
    }

    // Rest windows from trip gaps
    for (let i = 0; i < trips.length; i++) {
      const end = trips[i].endTime.getTime();
      const nextStart = trips[i + 1] ? trips[i + 1].startTime.getTime() : Date.now();
      const dur = nextStart - end;
      if (dur < REST_60M) continue;

      const pollsIn = polls.filter((pl) => pl.startedAt.getTime() >= end && pl.startedAt.getTime() <= nextStart);
      const snapsIn = snaps.filter((s) => {
        const t = new Date(s.recordedAt).getTime();
        return t >= end && t <= nextStart;
      });
      const cap60 = snapsIn.some((s) => {
        const t = new Date(s.recordedAt).getTime() - end;
        return t >= REST_60M - 5 * 60_000 && t <= REST_60M + 30 * 60_000;
      });
      const cap6h = dur >= REST_6H && snapsIn.some((s) => {
        const t = new Date(s.recordedAt).getTime() - end;
        return t >= REST_6H - 5 * 60_000 && t <= REST_6H + 60 * 60_000;
      });

      // Provider telemetry proxy: unique CH recorded_at in window (approximate via poll count)
      const providerTsInWindow = new Set();
      for (const pl of pollsIn) {
        // find CH rows with provider ts - we don't have poll-to-ch mapping; use all unique ts between end and nextStart
      }
      const chIn = chByProviderTs.filter((r) => r.recordedAtMs >= end - 60000 && r.recordedAtMs <= nextStart);
      const uniqueTs = new Set(chIn.map((r) => r.recordedAtMs)).size;

      windowStats[ice ? 'ice' : 'bev'].push({
        label: lbl,
        restStart: new Date(end).toISOString(),
        restHours: +(dur / 3600_000).toFixed(2),
        polls: pollsIn.length,
        uniqueProviderTs: uniqueTs,
        restingCaptures: snapsIn.length,
        has60mCapture: cap60,
        has6hCapture: cap6h,
      });
    }

    // Per-snapshot analysis: find preceding trip end
    for (const s of snaps) {
      const obsMs = new Date(s.recordedAt).getTime();
      let restStart = null;
      for (let i = trips.length - 1; i >= 0; i--) {
        if (trips[i].endTime.getTime() <= obsMs) {
          restStart = trips[i].endTime.getTime();
          break;
        }
      }
      const chNear = chByProviderTs.find((r) => Math.abs(r.recordedAtMs - obsMs) < 120_000) ?? null;
      const analysis = restStart
        ? classifySnap(s, restStart, chNear)
        : { cls: 'NOT_ASSESSABLE', flags: ['NO_TRIP_END'], bucket: 'UNKNOWN' };
      allSnaps.push({
        vehicle: lbl,
        ice,
        recordedAt: s.recordedAt,
        ...analysis,
        engineRunning: s.engineRunning,
        chContext: chNear,
      });
    }
  }

  const iceW = windowStats.ice;
  const bevW = windowStats.bev;
  const sum = (arr, pred) => arr.filter(pred).length;
  out.windowAggregates = {
    ice: {
      ge60m: iceW.length,
      ge6h: sum(iceW, (w) => w.restHours >= 6),
      capture60m: sum(iceW, (w) => w.has60mCapture),
      capture6h: sum(iceW, (w) => w.has6hCapture),
      rate60m: iceW.length ? +(sum(iceW, (w) => w.has60mCapture) / iceW.length * 100).toFixed(1) : 0,
      rate6h: sum(iceW, (w) => w.restHours >= 6) ? +(sum(iceW, (w) => w.has6hCapture) / sum(iceW, (w) => w.restHours >= 6) * 100).toFixed(1) : 0,
      medianPollsPerWindow: iceW.length ? iceW.map((w) => w.polls).sort((a, b) => a - b)[Math.floor(iceW.length / 2)] : 0,
    },
    bev: {
      ge60m: bevW.length,
      ge6h: sum(bevW, (w) => w.restHours >= 6),
      capture60m: sum(bevW, (w) => w.has60mCapture),
      capture6h: sum(bevW, (w) => w.has6hCapture),
    },
  };

  out.snapAnalysis = {
    total: allSnaps.length,
    gt132: allSnaps.filter((s) => s.v > 13.2).length,
    chargingContaminated: allSnaps.filter((s) => s.cls === 'CHARGING_CONTAMINATED').length,
    wakeContaminated: allSnaps.filter((s) => s.cls === 'WAKE_CONTAMINATED').length,
    valid: allSnaps.filter((s) => s.cls === 'VALID_REST_SAMPLE').length,
    misclassified: allSnaps.filter((s) => s.cls === 'CURRENT_IMPLEMENTATION_MISCLASSIFIED').length,
    classCounts: allSnaps.reduce((a, s) => { a[s.cls] = (a[s.cls] || 0) + 1; return a; }, {}),
    bucketCounts: allSnaps.reduce((a, s) => { a[s.bucket] = (a[s.bucket] || 0) + 1; return a; }, {}),
    highVoltageExamples: allSnaps.filter((s) => s.v > 13.2).slice(0, 15),
    validExamples: allSnaps.filter((s) => s.cls === 'VALID_REST_SAMPLE').slice(0, 10),
  };

  // Identical 60m/6h from snapshots within same rest window (within 5s)
  const sameTsPairs = [];
  const byVehicle = {};
  for (const s of allSnaps) {
    byVehicle[s.vehicle] = byVehicle[s.vehicle] || [];
    byVehicle[s.vehicle].push(s);
  }
  for (const arr of Object.values(byVehicle)) {
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i];
      if (a.near60 && b.near6h && Math.abs(new Date(a.recordedAt) - new Date(b.recordedAt)) < 5000 && a.v === b.v) {
        sameTsPairs.push({ a, b });
      }
    }
  }
  out.identical60m6hPairs = sameTsPairs.length;

  // Log counts
  out.logCaptureCounts = { note: 'from PM2 grep manual count' };

  await p.$disconnect();
  const json = JSON.stringify(out, null, 2);
  fs.writeFileSync('/tmp/battery-rest-supplement.json', json);
  console.log(json.slice(0, 4000));
})().catch((e) => { console.error(e); process.exit(1); });
