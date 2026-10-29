/**
 * Read-only Tiguan rolling scenarios + Audi profile persistence audit
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/synqdrive/current/backend/package.json');
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

const resolver = require(
  '/opt/synqdrive/current/backend/dist/src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-active-rpm-profile-resolver.util.js',
);

const TIGUAN = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

// From validated fleet JSON (interval replay trips)
const tiguanTrips = [
  {
    tripId: '29b8bb31-bc76-4b0f-a92f-c8897e982988',
    startMs: Date.parse('2026-10-27T16:03:00.000Z'),
    endMs: Date.parse('2026-10-27T16:14:15.000Z'),
    profile: 'RPM_1HZ',
  },
  {
    tripId: '0e276eb6-0f53-455f-8d12-bd81d2693a4d',
    startMs: Date.parse('2026-10-27T16:26:00.000Z'),
    endMs: Date.parse('2026-10-27T16:53:00.000Z'),
    profile: 'UNKNOWN',
  },
  {
    tripId: 'f1bf4ae6-fb29-4e59-b39a-f9ea17d0714f',
    startMs: Date.parse('2026-10-27T17:11:00.000Z'),
    endMs: Date.parse('2026-10-27T17:16:26.452Z'),
    profile: 'RPM_1HZ',
  },
  {
    tripId: '4f629778-5919-4159-978d-892e44e75e86',
    startMs: Date.parse('2026-10-27T20:22:00.000Z'),
    endMs: Date.parse('2026-10-27T20:43:57.538Z'),
    profile: 'RPM_1HZ',
  },
  {
    tripId: 'b661a71f-3854-4952-91c9-bf2b12808150',
    startMs: Date.parse('2026-10-27T20:50:37.428Z'),
    endMs: Date.parse('2026-10-27T20:51:39.428Z'),
    profile: 'UNKNOWN',
  },
];

function synthFastTrip(id, endMs) {
  const intervals = [];
  for (let i = 0; i < 120; i++) intervals.push(1);
  const duration = intervals.reduce((a, b) => a + b, 0);
  const startMs = endMs - duration * 1000;
  return { tripId: id, startMs, endMs, intervalsSec: intervals };
}

function rollingFromTrips(intervalTrips) {
  const evidence = resolver.buildRpmEvidenceFromIntervalReplayTrips(intervalTrips);
  return resolver.resolveActiveRpmProfileV1(evidence);
}

async function main() {
  loadEnv('/opt/synqdrive/shared/backend.env');
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();

  // Reload Tiguan intervals from CH for hypothetical (use stored artifact logic)
  const { createClient } = require('@clickhouse/client');
  const ch = createClient({ url: process.env.CLICKHOUSE_URL, username: process.env.CLICKHOUSE_USER, password: process.env.CLICKHOUSE_PASSWORD });
  const SIGNAL = 'powertrainCombustionEngineSpeed';

  async function loadIntervals(tripId, startMs, endMs) {
    const r = await ch.query({
      query: `SELECT toUnixTimestamp64Milli(recorded_at) AS ms FROM synqdrive.telemetry_hf_points
        WHERE vehicle_id = {v:String} AND trip_id = {t:String} AND signal_name = {s:String} ORDER BY recorded_at`,
      query_params: { v: TIGUAN, t: tripId, s: SIGNAL },
      format: 'JSONEachRow',
    });
    const rows = await r.json();
    const intervals = [];
    for (let i = 1; i < rows.length; i++) {
      const d = (Number(rows[i].ms) - Number(rows[i - 1].ms)) / 1000;
      if (d > 0) intervals.push(Math.round(d * 10) / 10);
    }
    return intervals;
  }

  const intervalTrips = [];
  for (const t of tiguanTrips) {
    intervalTrips.push({
      tripId: t.tripId,
      startMs: t.startMs,
      endMs: t.endMs,
      intervalsSec: await loadIntervals(t.tripId, t.startMs, t.endMs),
    });
  }

  const currentRolling = rollingFromTrips(intervalTrips);

  const newEnd = tiguanTrips[4].endMs + 3600_000;
  const synthNew = synthFastTrip('00000000-0000-4000-8000-hypothetical01', newEnd);
  const extendedMetas = [...tiguanTrips, { tripId: synthNew.tripId, startMs: synthNew.startMs, endMs: synthNew.endMs }];
  const extendedIntervals = [...intervalTrips, synthNew];
  const afterOneNewTrip = rollingFromTrips(extendedIntervals);

  const droppedOldest = tiguanTrips[0].tripId.slice(0, 8);

  // Audi persistence
  const links = await p.vehicleDataSourceLink.findMany({
    where: { vehicleId: AUDI, deactivatedAt: null },
    select: { id: true, provider: true, activatedAt: true },
  });
  const profiles = await p.vehicleSignalCapabilityProfile.findMany({
    where: { vehicleId: AUDI },
    select: {
      providerSourceLinkId: true,
      profileRevision: true,
      evaluatedAt: true,
      signalsSnapshot: true,
    },
    orderBy: { evaluatedAt: 'desc' },
  });
  const revisions = await p.vehicleSignalCapabilityProfileRevision.findMany({
    where: { vehicleId: AUDI },
    orderBy: { profileRevision: 'desc' },
    take: 3,
    select: {
      profileRevision: true,
      evaluatedAt: true,
      materializationTrigger: true,
      signalsSnapshot: true,
      providerSourceLinkId: true,
    },
  });
  const lastTrip = await p.vehicleTrip.findFirst({
    where: { vehicleId: AUDI, endTime: { not: null } },
    orderBy: { endTime: 'desc' },
    select: { id: true, endTime: true, startTime: true },
  });
  const outbox = await p.vsiProfileLifecycleOutbox.findMany({
    where: { vehicleId: AUDI },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, eventType: true, createdAt: true, processedAt: true, lastError: true },
  });

  const audiSnapshots = profiles.map((row) => {
    const sig = row.signalsSnapshot?.find((s) => s?.canonicalSignalKey === 'engine_rpm');
    return {
      linkId: row.providerSourceLinkId,
      revision: row.profileRevision,
      evaluatedAt: row.evaluatedAt,
      hasEngineRpm: !!sig,
      activeRpmProfile: sig?.cadenceIntelligence?.activeRpmProfile ?? null,
      cadenceKeys: sig?.cadenceIntelligence ? Object.keys(sig.cadenceIntelligence) : [],
      iceApplicability: sig?.iceRpmApplicability ?? sig?.applicability,
    };
  });

  await p.$disconnect();
  await ch.close();

  console.log(
    JSON.stringify(
      {
        tiguan: {
          rollingChronological: currentRolling?.evaluatedTripIds,
          tripClassifications: currentRolling?.tripClassifications?.map((c) => ({
            trip: c.tripId.slice(0, 8),
            profile: c.profile,
            code: c.decisionCode,
          })),
          rolling: currentRolling
            ? {
                activeProfile: currentRolling.activeProfile,
                decisionCode: currentRolling.classificationDecisionCode,
                summary: currentRolling.classificationDecisionSummary,
              }
            : null,
          oldestDropsOnNextTrip: droppedOldest,
          hypotheticalNewFastTrip: {
            newTripId: synthNew.tripId.slice(0, 8),
            evaluatedTripIds: afterOneNewTrip?.evaluatedTripIds?.map((id) => id.slice(0, 8)),
            activeProfile: afterOneNewTrip?.activeProfile,
            decisionCode: afterOneNewTrip?.classificationDecisionCode,
            summary: afterOneNewTrip?.classificationDecisionSummary,
            tripClassifications: afterOneNewTrip?.tripClassifications?.map((c) => ({
              trip: c.tripId.slice(0, 8),
              profile: c.profile,
              code: c.decisionCode,
            })),
          },
        },
        audi: {
          activeLinks: links,
          lastTrip: lastTrip
            ? { id: lastTrip.id.slice(0, 8), end: lastTrip.endTime, start: lastTrip.startTime }
            : null,
          profileRows: audiSnapshots,
          recentRevisions: revisions.map((row) => {
            const sig = row.signalsSnapshot?.find((s) => s?.canonicalSignalKey === 'engine_rpm');
            return {
              linkId: row.providerSourceLinkId,
              revision: row.profileRevision,
              evaluatedAt: row.evaluatedAt,
              trigger: row.materializationTrigger,
              activeRpm: sig?.cadenceIntelligence?.activeRpmProfile?.activeProfile ?? null,
            };
          }),
          recentOutbox: outbox,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
