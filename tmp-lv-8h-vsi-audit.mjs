/**
 * Read-only LV 8H standby intelligence production audit
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/synqdrive/current/backend/package.json');
const cadenceStats = require(
  '/opt/synqdrive/current/backend/dist/src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence-stats.util.js',
);
const cadenceEnricher = require(
  '/opt/synqdrive/current/backend/dist/src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence.enricher.js',
);

function loadEnv(p) {
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    let v = t.slice(eq + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const FLEET = [
  { key: 'TIGUAN', label: 'VW Tiguan WOB L 7503', vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e' },
  { key: 'ARTEON', label: 'VW Arteon HMÜ C 215', vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48' },
  { key: 'AUDI', label: 'Audi A4 KS MS 661', vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359' },
];

const H8_MIN = 6 * 3600;
const H8_MAX = 10 * 3600;
const H16_MIN = 14 * 3600;
const H16_MAX = 18 * 3600;
const H24_MIN = 22 * 3600;
const H24_MAX = 26 * 3600;
const SESSION_BREAK_SEC = 3 * 3600; // strict rest segmentation (M3.3B-style)

function inBand(sec, min, max) {
  return sec >= min && sec <= max;
}

function classifyContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return 'UNCLEAR';
  const speed = ctx.speedKmh;
  const trip = ctx.hasActiveTrip === true;
  const eng = ctx.engineRunning === true;
  const ign = ctx.ignitionOn === true;
  if (trip || (speed != null && speed > 3)) return 'DURING_TRIP_OR_MOVING';
  if (eng || ign) return 'SHUTDOWN_TRANSITION';
  if (speed != null && speed <= 3 && !trip && !eng) return 'STANDBY_REST_CANDIDATE';
  if (speed == null && !trip && !eng) return 'UNCLEAR_NULL_SPEED';
  return 'UNCLEAR';
}

function segmentStandbyIntervals(timestampsSec, classes) {
  const segments = [];
  let cur = [];
  for (let i = 0; i < timestampsSec.length; i++) {
    const ptClass = classes[i];
    const ts = timestampsSec[i];
    if (ptClass !== 'STANDBY_REST_CANDIDATE') {
      if (cur.length >= 2) segments.push([...cur]);
      cur = [];
      continue;
    }
    if (cur.length === 0) {
      cur.push(ts);
      continue;
    }
    const gap = ts - cur[cur.length - 1];
    if (gap > SESSION_BREAK_SEC) {
      if (cur.length >= 2) segments.push([...cur]);
      cur = [ts];
    } else {
      cur.push(ts);
    }
  }
  if (cur.length >= 2) segments.push(cur);
  return segments;
}

function intervalStats(intervalsSec) {
  if (!intervalsSec.length) return null;
  const s = [...intervalsSec].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return {
    count: intervalsSec.length,
    median: cadenceStats.medianSeconds(intervalsSec),
    p25: pct(25),
    p75: pct(75),
    p95: cadenceStats.percentileSeconds(s, 95),
    band8h: intervalsSec.filter((x) => inBand(x, H8_MIN, H8_MAX)).length,
    band16h: intervalsSec.filter((x) => inBand(x, H16_MIN, H16_MAX)).length,
    band24h: intervalsSec.filter((x) => inBand(x, H24_MIN, H24_MAX)).length,
  };
}

async function analyzeVehicle(p, veh, since) {
  const link = await p.vehicleDataSourceLink.findFirst({
    where: { vehicleId: veh.vehicleId, deactivatedAt: null, provider: 'DIMO' },
    orderBy: { activatedAt: 'desc' },
    select: { id: true, activatedAt: true, provider: true },
  });

  const rows = await p.batteryMeasurement.findMany({
    where: {
      vehicleId: veh.vehicleId,
      type: 'LIVE_VOLTAGE',
      quality: 'VALID',
      providerTimestamp: { not: null, gte: since },
      observedAt: { gte: since },
    },
    orderBy: { providerTimestamp: 'asc' },
    select: {
      id: true,
      observedAt: true,
      providerTimestamp: true,
      context: true,
      provenance: true,
    },
  });

  const linkActivatedMs = link?.activatedAt?.getTime() ?? 0;
  const scoped = rows.filter((r) => r.providerTimestamp.getTime() >= linkActivatedMs);

  const points = scoped.map((r) => ({
    observedAtMs: r.observedAt.getTime(),
    providerTimestampMs: r.providerTimestamp.getTime(),
    ctx: r.context,
  }));

  const deduped = cadenceStats.dedupeLvPointsBySourceAdvance(points);
  const dupProviderTs =
    scoped.length - new Set(scoped.map((r) => r.providerTimestamp.getTime())).size;
  const missingProviderTs = rows.length - scoped.length;

  const tsSec = deduped.map((p) => (p.providerTimestampMs ?? p.observedAtMs) / 1000);
  const classes = deduped.map((p) => classifyContext(p.ctx));

  const allIntervals = [];
  for (let i = 1; i < tsSec.length; i++) {
    allIntervals.push(tsSec[i] - tsSec[i - 1]);
  }

  const standbySegments = segmentStandbyIntervals(tsSec, classes);
  const standbyIntervals = [];
  for (const seg of standbySegments) {
    for (let i = 1; i < seg.length; i++) standbyIntervals.push(seg[i] - seg[i - 1]);
  }

  const eightHourSequences = standbySegments.filter((seg) => {
    if (seg.length < 3) return false;
    let hits = 0;
    for (let i = 1; i < seg.length; i++) {
      if (inBand(seg[i] - seg[i - 1], H8_MIN, H8_MAX)) hits++;
    }
    return hits >= 2;
  });

  const lvEvidence = {
    points: deduped.map((p) => ({
      observedAtMs: p.observedAtMs,
      providerTimestampMs: p.providerTimestampMs,
    })),
    provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
    linkActivatedAtMs: linkActivatedMs,
    linkDeactivatedAtMs: null,
  };
  const vsiCadence = cadenceStats.analyzeLvVoltageCadence(lvEvidence);

  const prof = await p.vehicleSignalCapabilityProfile.findFirst({
    where: { vehicleId: veh.vehicleId, providerSourceLinkId: link?.id },
    select: { signalsSnapshot: true, evaluatedAt: true, profileRevision: true },
  });
  const lvSig = prof?.signalsSnapshot?.find((s) => s?.canonicalSignalKey === 'lv_voltage');

  const classCounts = {};
  for (const c of classes) classCounts[c] = (classCounts[c] ?? 0) + 1;

  return {
    key: veh.key,
    label: veh.label,
    vehicleId: veh.vehicleId,
    activeLink: link,
    windowDays: 30,
    rawRowCount: rows.length,
    missingProviderInWindow: missingProviderTs,
    duplicateProviderTimestamps: dupProviderTs,
    distinctSourceAdvances: deduped.length,
    contextClassCounts: classCounts,
    allIntervalStats: intervalStats(allIntervals),
    standbyIntervalStats: intervalStats(standbyIntervals),
    standbySegmentCount: standbySegments.length,
    eightHourLadderSequences: eightHourSequences.length,
    sampleStandby8hIntervals: standbyIntervals.filter((x) => inBand(x, H8_MIN, H8_MAX)).slice(0, 8),
    vsiRegimes: vsiCadence.regimes,
    vsiDensity: vsiCadence.observedDensityLabel,
    vsiMedianSec: vsiCadence.intervalMedianSeconds,
    vsiP95Sec: vsiCadence.intervalP95Seconds,
    persistedLvCadence: lvSig?.cadenceIntelligence ?? null,
    persistedEmpirical: lvSig?.empiricalObservation,
    profileRevision: prof?.profileRevision,
    profileEvaluatedAt: prof?.evaluatedAt,
  };
}

async function main() {
  loadEnv('/opt/synqdrive/shared/backend.env');
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const out = { generatedAt: new Date().toISOString(), vehicles: [] };
  for (const veh of FLEET) {
    out.vehicles.push(await analyzeVehicle(p, veh, since));
  }
  await p.$disconnect();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
