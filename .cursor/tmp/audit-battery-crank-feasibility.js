/* READ-ONLY Prompt 4/8 — crank feasibility analysis */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
const WIN_BEFORE_MS = 60_000;
const WIN_AFTER_MS = 180_000;

function pct(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(q * (s.length - 1)));
  return s[i];
}
const median = (arr) => pct(arr, 0.5);

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
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const text = await res.text();
  return text.trim() ? text.trim().split('\n').map((l) => l.split('\t')) : [];
}

function parseCrankLogs() {
  const raw = execSync('grep -h "Crank features captured" /root/.pm2/logs/synqdrive-out*.log 2>/dev/null || true', {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('Crank features captured')) continue;
    const tripM = line.match(/trip=([a-f0-9-]+)/);
    const vehM = line.match(/vehicle=([a-f0-9-]+)/);
    const vPreM = line.match(/vPre=([\d.]+|—)/);
    const dropM = line.match(/drop=([\d.]+|—)V/);
    const tsM = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+)/);
    if (!tripM) continue;
    entries.push({
      tripId: tripM[1],
      vehicleId: vehM?.[1] ?? null,
      logAt: tsM ? new Date(tsM[1] + 'Z') : null,
      vPre: vPreM && vPreM[1] !== '—' ? parseFloat(vPreM[1]) : null,
      crankDrop: dropM && dropM[1] !== '—' ? parseFloat(dropM[1]) : null,
    });
  }
  return entries;
}

function isIce(ft) {
  const f = (ft || '').toUpperCase();
  return f !== 'ELECTRIC' && f !== 'EV' && f !== 'BEV';
}

function classifyTrip(t, crank, chMeta) {
  if (!isIce(t.fuelType)) return 'PROFILE_UNSUPPORTED';
  if (!crank) return 'NO_DATA';
  if (crank.crankDrop == null && crank.vPre == null) return 'NO_DATA';
  if (crank.crankDrop != null && crank.crankDrop >= 0.3 && crank.crankDrop <= 3.0) {
    if (chMeta?.rpmPointsInWindow >= 5) return 'EXACT_ENOUGH';
    return 'USABLE_START_PROXY';
  }
  if (crank.crankDrop != null && crank.crankDrop < 0.3) return 'RECOVERY_ONLY';
  if (crank.crankDrop != null && crank.crankDrop > 3.0) return 'TIMESTAMP_INCONSISTENT';
  if (chMeta && chMeta.snapshotPoints < 3) return 'INSUFFICIENT_CADENCE';
  if (t.logDelaySec != null && t.logDelaySec > 120) return 'PROVIDER_DELAY';
  return 'USABLE_START_PROXY';
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const crankLogs = parseCrankLogs();
  const crankByTrip = new Map(crankLogs.map((c) => [c.tripId, c]));

  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: { id: true, licensePlate: true, fuelType: true, dimoVehicle: { select: { tokenId: true } } },
  });
  const vehMap = new Map(vehicles.map((v) => [v.id, v]));
  const label = (v) => (v.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.id.slice(0, 8)}`);

  const trips = await p.vehicleTrip.findMany({
    where: { startTime: { gte: since } },
    select: {
      id: true,
      vehicleId: true,
      startTime: true,
      createdAt: true,
      possibleStartAt: true,
      firstActivityAt: true,
      startDetectionMode: true,
      distanceKm: true,
    },
    orderBy: { startTime: 'asc' },
  });

  const features = await p.batteryFeatures.findMany({
    select: {
      vehicleId: true,
      crankTripId: true,
      crankAt: true,
      vPreCrank: true,
      vMinCrank: true,
      crankDrop: true,
      vRecovery5s: true,
      vRecovery30s: true,
      crankObservationCount: true,
    },
  });
  const featMap = new Map(features.map((f) => [f.vehicleId, f]));

  const tripAnalysis = [];
  const classCounts = {};
  const delaySecs = [];
  const dropValues = [];
  const snapshotCounts = { before: [], in5: [], in15: [], in30: [], to180: [] };
  const rpmGaps = [];

  // Sample up to 40 ICE trips with crank for CH deep-dive
  const iceCrankTrips = trips.filter((t) => isIce(vehMap.get(t.vehicleId)?.fuelType) && crankByTrip.has(t.id));

  for (const t of trips) {
    const v = vehMap.get(t.vehicleId);
    if (!v) continue;
    const ice = isIce(v.fuelType);
    const crank = crankByTrip.get(t.id);
    const startMs = t.startTime.getTime();
    const effectiveStart = t.possibleStartAt ?? t.firstActivityAt ?? t.startTime;

    let logDelaySec = null;
    if (crank?.logAt) logDelaySec = (crank.logAt.getTime() - startMs) / 1000;

  const entry = {
      tripId: t.id,
      vehicleId: t.vehicleId,
      label: label(v),
      ice,
      startTime: t.startTime.toISOString(),
      possibleStartAt: t.possibleStartAt?.toISOString() ?? null,
      firstActivityAt: t.firstActivityAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      startDetectionMode: t.startDetectionMode,
      distanceKm: t.distanceKm,
      crank: crank ?? null,
      logDelaySec: logDelaySec != null ? +logDelaySec.toFixed(1) : null,
      feat: featMap.get(t.vehicleId) ?? null,
      isLatestCrank: featMap.get(t.vehicleId)?.crankTripId === t.id,
    };

    if (crank?.crankDrop != null) dropValues.push(crank.crankDrop);
    if (logDelaySec != null) delaySecs.push(logDelaySec);

    entry.classification = classifyTrip({ ...t, fuelType: v.fuelType, logDelaySec }, crank, null);
    classCounts[entry.classification] = (classCounts[entry.classification] || 0) + 1;
    tripAnalysis.push(entry);
  }

  // CH snapshot cadence for ICE crank trips (sample)
  const chSample = [];
  for (const t of iceCrankTrips.slice(0, 40)) {
    const start = t.startTime;
    const from = new Date(start.getTime() - WIN_BEFORE_MS).toISOString().slice(0, 19);
    const to = new Date(start.getTime() + WIN_AFTER_MS).toISOString().slice(0, 19);
    const rows = await chQuery(`
      SELECT toString(recorded_at), toString(speed_kmh), toString(is_ignition_on)
      FROM telemetry_snapshots
      WHERE vehicle_id = '${t.vehicleId}'
        AND recorded_at >= parseDateTimeBestEffort('${from}')
        AND recorded_at <= parseDateTimeBestEffort('${to}')
      ORDER BY recorded_at
      FORMAT TabSeparated
    `);
    const points = rows.map((r) => ({
      ts: new Date(r[0].replace(' ', 'T') + 'Z').getTime(),
      speed: r[1] === '\\N' ? null : parseFloat(r[1]),
      ignition: r[2] === '1',
    }));
    const startMs = start.getTime();
    const before = points.filter((p) => p.ts < startMs);
    const in5 = points.filter((p) => Math.abs(p.ts - startMs) <= 5000);
    const in15 = points.filter((p) => Math.abs(p.ts - startMs) <= 15000);
    const in30 = points.filter((p) => Math.abs(p.ts - startMs) <= 30000);
    const to180 = points.filter((p) => p.ts >= startMs && p.ts <= startMs + 180000);

    snapshotCounts.before.push(before.length);
    snapshotCounts.in5.push(in5.length);
    snapshotCounts.in15.push(in15.length);
    snapshotCounts.in30.push(in30.length);
    snapshotCounts.to180.push(to180.length);

    const gaps = [];
    for (let i = 1; i < points.length; i++) gaps.push((points[i].ts - points[i - 1].ts) / 1000);

    // HF RPM around start
    const rpmRows = await chQuery(`
      SELECT toString(recorded_at), toString(value_float)
      FROM telemetry_hf_points
      WHERE vehicle_id = '${t.vehicleId}'
        AND signal_name = 'powertrainCombustionEngineSpeed'
        AND recorded_at >= parseDateTimeBestEffort('${from}')
        AND recorded_at <= parseDateTimeBestEffort('${to}')
      ORDER BY recorded_at
      FORMAT TabSeparated
    `);
    const rpmPts = rpmRows.map((r) => ({
      ts: new Date(r[0].replace(' ', 'T') + 'Z').getTime(),
      rpm: parseFloat(r[1]),
    }));
    const rpmG = [];
    for (let i = 1; i < rpmPts.length; i++) rpmG.push((rpmPts[i].ts - rpmPts[i - 1].ts) / 1000);
    if (rpmG.length) rpmGaps.push(...rpmG);

    const crank = crankByTrip.get(t.id);
    chSample.push({
      tripId: t.id,
      snapshotPoints: points.length,
      rpmPoints: rpmPts.length,
      medianGapSec: gaps.length ? median(gaps) : null,
      p95GapSec: gaps.length ? pct(gaps, 0.95) : null,
      maxGapSec: gaps.length ? Math.max(...gaps) : null,
      crankDrop: crank?.crankDrop ?? null,
      vPre: crank?.vPre ?? null,
    });

    // Reclassify with CH meta
    const idx = tripAnalysis.findIndex((x) => x.tripId === t.id);
    if (idx >= 0) {
      tripAnalysis[idx].classification = classifyTrip(
        { fuelType: vehMap.get(t.vehicleId)?.fuelType, logDelaySec: tripAnalysis[idx].logDelaySec },
        crank,
        { snapshotPoints: points.length, rpmPointsInWindow: rpmPts.length },
      );
    }
  }

  // Recompute class counts after CH enrichment
  const classCounts2 = {};
  for (const t of tripAnalysis) classCounts2[t.classification] = (classCounts2[t.classification] || 0) + 1;

  const iceTrips = tripAnalysis.filter((t) => t.ice);
  const bevTrips = tripAnalysis.filter((t) => !t.ice);
  const iceWithCrank = iceTrips.filter((t) => t.crank);

  const out = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    crankLogEntries: crankLogs.length,
    uniqueCrankTrips: new Set(crankLogs.map((c) => c.tripId)).size,
    tripCounts: {
      total: trips.length,
      ice: iceTrips.length,
      bev: bevTrips.length,
    },
    crankCoverage: {
      iceTripsWithCrankLog: iceWithCrank.length,
      iceCrankRatePct: iceTrips.length ? +((iceWithCrank.length / iceTrips.length) * 100).toFixed(1) : 0,
      bevTripsWithCrankLog: bevTrips.filter((t) => t.crank).length,
    },
    classCounts: classCounts2,
    iceClassCounts: iceTrips.reduce((a, t) => { a[t.classification] = (a[t.classification] || 0) + 1; return a; }, {}),
    bevClassCounts: bevTrips.reduce((a, t) => { a[t.classification] = (a[t.classification] || 0) + 1; return a; }, {}),
    crankDropStats: dropValues.length
      ? { n: dropValues.length, median: median(dropValues), p95: pct(dropValues, 0.95), min: Math.min(...dropValues), max: Math.max(...dropValues) }
      : null,
    logDelayStats: delaySecs.length
      ? { median: median(delaySecs), p95: pct(delaySecs, 0.95), max: Math.max(...delaySecs) }
      : null,
    snapshotCadenceSample: {
      n: chSample.length,
      medianPointsBefore: median(snapshotCounts.before),
      medianIn5s: median(snapshotCounts.in5),
      medianIn15s: median(snapshotCounts.in15),
      medianIn30s: median(snapshotCounts.in30),
      medianTo180s: median(snapshotCounts.to180),
      medianGapSec: median(chSample.map((s) => s.medianGapSec).filter((x) => x != null)),
      p95GapSec: pct(chSample.map((s) => s.p95GapSec).filter((x) => x != null), 0.95),
      maxGapSec: chSample.length ? Math.max(...chSample.map((s) => s.maxGapSec ?? 0)) : null,
      medianRpmPoints: median(chSample.map((s) => s.rpmPoints)),
      hfRpmMedianGap: rpmGaps.length ? median(rpmGaps) : null,
      hfRpmP95Gap: rpmGaps.length ? pct(rpmGaps, 0.95) : null,
    },
    batteryFeatures: features.map((f) => ({
      vehicleId: f.vehicleId,
      label: label(vehMap.get(f.vehicleId) || { id: f.vehicleId }),
      crankTripId: f.crankTripId,
      vPreCrank: f.vPreCrank,
      crankDrop: f.crankDrop,
      vRecovery5s: f.vRecovery5s,
      vRecovery30s: f.vRecovery30s,
      crankObservationCount: f.crankObservationCount,
    })),
    duplicateCrankTrips: crankLogs.length - new Set(crankLogs.map((c) => c.tripId)).size,
    examples: {
      exactEnough: tripAnalysis.filter((t) => t.classification === 'EXACT_ENOUGH').slice(0, 5),
      usableProxy: tripAnalysis.filter((t) => t.classification === 'USABLE_START_PROXY').slice(0, 5),
      noData: tripAnalysis.filter((t) => t.ice && t.classification === 'NO_DATA').slice(0, 5),
      highDrop: tripAnalysis.filter((t) => t.crank?.crankDrop > 3).slice(0, 5),
    },
    chSample: chSample.slice(0, 10),
    hfLvVoltageSignals30d: await chQuery(`
      SELECT signal_name, count() FROM telemetry_hf_points
      WHERE recorded_at >= now()-INTERVAL 30 DAY
        AND signal_group = 'battery'
      GROUP BY signal_name FORMAT TabSeparated
    `),
  };

  await p.$disconnect();
  const json = JSON.stringify(out, null, 2);
  fs.writeFileSync('/tmp/battery-crank-feasibility.json', json);
  console.log('WROTE /tmp/battery-crank-feasibility.json');
  console.log('ICE trips:', out.tripCounts.ice, 'crank logs:', out.crankCoverage.iceTripsWithCrankLog);
  console.log('classCounts', out.iceClassCounts);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
