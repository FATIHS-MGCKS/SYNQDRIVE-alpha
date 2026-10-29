/**
 * LV 8H evidence gap investigation (read-only)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/synqdrive/current/backend/package.json');
const cadenceStats = require(
  '/opt/synqdrive/current/backend/dist/src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence-stats.util.js',
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
  { key: 'TIGUAN', vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e' },
  { key: 'ARTEON', vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48' },
  { key: 'AUDI', vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359' },
];

const H8_MIN = 6 * 3600;
const H8_MAX = 10 * 3600;
const SESSION_BREAK = 3 * 3600;
const MAX_LV_ROWS = 256;

function classifyCtx(ctx) {
  if (!ctx || typeof ctx !== 'object') return 'CONTEXT_UNKNOWN';
  const speed = ctx.speedKmh;
  const trip = ctx.hasActiveTrip === true;
  const eng = ctx.engineRunning === true;
  const ign = ctx.ignitionOn === true;
  const lvChg = ctx.isLvCharging === true;
  const hvChg = ctx.isHvCharging === true;
  if (lvChg || hvChg) return 'ACTUAL_ACTIVITY';
  if (trip || (speed != null && speed > 3)) return 'ACTUAL_ACTIVITY';
  if (eng || ign) return 'ACTUAL_ACTIVITY';
  if (speed != null && speed <= 3 && !trip && !eng) return 'STANDBY_CANDIDATE';
  return 'CONTEXT_UNKNOWN';
}

function strictRejectionReason(a, b, gapSec) {
  const ca = classifyCtx(a.context);
  const cb = classifyCtx(b.context);
  if (ca !== 'STANDBY_CANDIDATE' || cb !== 'STANDBY_CANDIDATE') {
    if (ca === 'CONTEXT_UNKNOWN' || cb === 'CONTEXT_UNKNOWN') return 'CONTEXT_UNKNOWN';
    return 'ACTUAL_ACTIVITY';
  }
  if (gapSec > SESSION_BREAK) return 'SESSION_SEGMENTATION_BREAK';
  return 'WOULD_QUALIFY_INTRA_SESSION';
}

async function tripsBetween(p, vehicleId, t0, t1) {
  return p.vehicleTrip.findMany({
    where: {
      vehicleId,
      OR: [
        { startTime: { lte: t1 }, endTime: { gte: t0 } },
        { startTime: { gte: t0, lte: t1 } },
      ],
    },
    select: { id: true, startTime: true, endTime: true, tripStatus: true },
    orderBy: { startTime: 'asc' },
    take: 20,
  });
}

async function intermediateRows(p, vehicleId, t0, t1) {
  return p.batteryMeasurement.findMany({
    where: {
      vehicleId,
      type: 'LIVE_VOLTAGE',
      quality: 'VALID',
      providerTimestamp: { gt: t0, lt: t1 },
    },
    select: {
      providerTimestamp: true,
      numericValue: true,
      observedAt: true,
      receivedAt: true,
      context: true,
      provenance: true,
    },
    orderBy: { providerTimestamp: 'asc' },
  });
}

async function analyzeVehicle(p, veh, since) {
  const link = await p.vehicleDataSourceLink.findFirst({
    where: { vehicleId: veh.vehicleId, deactivatedAt: null, provider: 'DIMO' },
    select: { id: true, activatedAt: true },
  });
  const linkMs = link?.activatedAt?.getTime() ?? 0;

  const allRows = await p.batteryMeasurement.findMany({
    where: {
      vehicleId: veh.vehicleId,
      type: 'LIVE_VOLTAGE',
      quality: 'VALID',
      providerTimestamp: { not: null, gte: since },
    },
    orderBy: { providerTimestamp: 'asc' },
    select: {
      id: true,
      providerTimestamp: true,
      observedAt: true,
      receivedAt: true,
      numericValue: true,
      context: true,
      provenance: true,
    },
  });

  const scoped = allRows.filter((r) => r.providerTimestamp.getTime() >= linkMs);
  const points = scoped.map((r) => ({
    observedAtMs: r.observedAt.getTime(),
    providerTimestampMs: r.providerTimestamp.getTime(),
    row: r,
  }));
  const deduped = cadenceStats.dedupeLvPointsBySourceAdvance(points);

  const gaps = [];
  for (let i = 1; i < deduped.length; i++) {
    const a = deduped[i - 1].row;
    const b = deduped[i].row;
    const gapSec = (deduped[i].providerTimestampMs - deduped[i - 1].providerTimestampMs) / 1000;
    if (gapSec >= H8_MIN && gapSec <= H8_MAX) {
      gaps.push({ index: i, gapSec, a, b });
    }
  }

  // pick up to 10 spread across timeline
  const picked = [];
  if (gaps.length <= 10) {
    picked.push(...gaps);
  } else {
    const step = Math.floor(gaps.length / 10);
    for (let j = 0; j < 10; j++) picked.push(gaps[Math.min(j * step, gaps.length - 1)]);
  }

  const reconstructed = [];
  for (const g of picked) {
    const t0 = g.a.providerTimestamp;
    const t1 = g.b.providerTimestamp;
    const between = await intermediateRows(p, veh.vehicleId, t0, t1);
    const trips = await tripsBetween(p, veh.vehicleId, t0, t1);
    const obsSkewA = g.a.observedAt.getTime() - g.a.providerTimestamp.getTime();
    const obsSkewB = g.b.observedAt.getTime() - g.b.providerTimestamp.getTime();
    const recvLagB = g.b.receivedAt.getTime() - g.b.providerTimestamp.getTime();
    reconstructed.push({
      gapHours: Math.round((g.gapSec / 3600) * 10) / 10,
      providerTsA: t0.toISOString(),
      providerTsB: t1.toISOString(),
      voltageA: g.a.numericValue,
      voltageB: g.b.numericValue,
      contextA: g.a.context,
      contextB: g.b.context,
      classA: classifyCtx(g.a.context),
      classB: classifyCtx(g.b.context),
      strictRejection: strictRejectionReason(g.a, g.b, g.gapSec),
      observedAtSkewMsA: obsSkewA,
      observedAtSkewMsB: obsSkewB,
      receivedLagMsB: recvLagB,
      outcomeA: g.a.provenance?.providerObservationOutcome,
      outcomeB: g.b.provenance?.providerObservationOutcome,
      intermediateLvCount: between.length,
      intermediateSamples: between.slice(0, 5).map((r) => ({
        pt: r.providerTimestamp.toISOString(),
        v: r.numericValue,
        class: classifyCtx(r.context),
        outcome: r.provenance?.providerObservationOutcome,
      })),
      tripsOverlapping: trips.map((t) => ({
        id: t.id.slice(0, 8),
        status: t.tripStatus,
        start: t.startTime,
        end: t.endTime,
      })),
      physicalAdvanceHint:
        g.a.provenance?.providerObservationOutcome === 'NEW_OBSERVATION' &&
        g.b.provenance?.providerObservationOutcome === 'NEW_OBSERVATION' &&
        g.a.numericValue !== g.b.numericValue
          ? 'LIKELY_NEW_SAMPLES_DIFFERENT_VOLTAGE'
          : g.a.provenance?.providerObservationOutcome === 'NEW_OBSERVATION' &&
              g.b.provenance?.providerObservationOutcome === 'NEW_OBSERVATION'
            ? 'NEW_OBSERVATION_TIMESTAMPS_ADVANCED'
            : 'CHECK_OUTCOMES',
    });
  }

  // 256-row window analysis (loader order: desc take 256, reverse)
  const loaderOrder = [...scoped].sort((x, y) => y.providerTimestamp - x.providerTimestamp).slice(0, MAX_LV_ROWS);
  const loaderSet = new Set(loaderOrder.map((r) => r.id));
  const gapsInWindow = gaps.filter((g) => loaderSet.has(g.a.id) && loaderSet.has(g.b.id));
  const gapsPartial = gaps.filter((g) => loaderSet.has(g.a.id) || loaderSet.has(g.b.id));

  const rejectionCounts = {};
  for (const g of gaps) {
    const r = strictRejectionReason(g.a, g.b, g.gapSec);
    rejectionCounts[r] = (rejectionCounts[r] ?? 0) + 1;
  }

  const prof = await p.vehicleSignalCapabilityProfile.findFirst({
    where: { vehicleId: veh.vehicleId, providerSourceLinkId: link?.id },
    select: { providerSourceLinkId: true },
  });

  return {
    key: veh.key,
    activeLinkId: link?.id,
    profileLinkMatch: prof?.providerSourceLinkId === link?.id,
    total6to10hGaps30d: gaps.length,
    gapsBothEndpointsIn256Window: gapsInWindow.length,
    gapsAtLeastOneEndpointIn256: gapsPartial.length,
    strictRejectionHistogram30d: rejectionCounts,
    reconstructedIntervals: reconstructed,
    timestampAuthoritySample: scoped.slice(-3).map((r) => ({
      providerTimestamp: r.providerTimestamp.toISOString(),
      observedAt: r.observedAt.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      providerEqualsObserved: r.observedAt.getTime() === r.providerTimestamp.getTime(),
      outcome: r.provenance?.providerObservationOutcome,
    })),
  };
}

async function main() {
  loadEnv('/opt/synqdrive/shared/backend.env');
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const out = { vehicles: [] };
  for (const v of FLEET) out.vehicles.push(await analyzeVehicle(p, v, since));
  await p.$disconnect();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
