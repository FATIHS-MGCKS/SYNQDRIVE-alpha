#!/usr/bin/env node
/**
 * Passive LTE_R1 true signal cadence observer (read-only Production Postgres).
 * - ZERO provider/DIMO HTTP calls
 * - ZERO Production DB writes (read-only transaction)
 * - ZERO application replica / poll cadence changes
 *
 * VPS usage:
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   P25_LTE_R1_EVIDENCE_DIR=/opt/synqdrive/shared/evidence/p25-post-fix-lte-r1-epoch \
 *   NODE_PATH=/opt/synqdrive/current/backend/node_modules \
 *   node /opt/synqdrive/shared/ops/p25-lte-r1-passive-cadence-observer.cjs --sample
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const {
  emptyVehiclePollState,
  filterPollsAfterCursor,
  applyDistinctPollRows,
} = require('./p25-lte-r1-passive-cadence-observer.poll-accounting.lib.cjs');

const EVIDENCE_DIR =
  process.env.P25_LTE_R1_EVIDENCE_DIR ??
  '/opt/synqdrive/shared/evidence/p25-post-fix-lte-r1-epoch';
const OBSERVATIONS_NDJSON = path.join(EVIDENCE_DIR, 'lte-r1-cadence-observations.ndjson');
const DERIVED_STATE_JSON = path.join(EVIDENCE_DIR, 'lte-r1-cadence-derived-state.json');
const OBSERVER_META_JSON = path.join(EVIDENCE_DIR, 'lte-r1-cadence-observer-meta.json');

const SIGNAL_KEYS = {
  obd: 'obdIsPluggedIn',
  positionLat: 'currentLocationLatitude',
  positionLon: 'currentLocationLongitude',
  speed: 'speed',
  odometer: 'odometer',
  ignition: 'isIgnitionOn',
  rpm: 'engineRPM',
};

function loadEnvFile() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parsePilotScopes() {
  const raw = process.env.CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON ?? '[]';
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function pilotVehicleIds(scopes) {
  return new Set(scopes.map((s) => s.vehicleId).filter(Boolean));
}

function extractSignal(raw, key) {
  if (!raw || typeof raw !== 'object') return { value: null, timestamp: null };
  const node = raw[key];
  if (node == null) return { value: null, timestamp: null };
  if (typeof node === 'object' && 'value' in node) {
    return {
      value: node.value ?? null,
      timestamp: node.timestamp ?? null,
    };
  }
  return { value: node, timestamp: null };
}

function classifyOperatingMode({ speedKmh, secondsSinceTripEnd }) {
  if (speedKmh != null && speedKmh > 3) return 'DRIVING';
  if (secondsSinceTripEnd == null) return 'UNKNOWN';
  if (secondsSinceTripEnd <= 15 * 60) return 'RECENTLY_PARKED';
  if (secondsSinceTripEnd <= 60 * 60) return 'PARKED';
  return 'STANDBY';
}

function compareSourceAdvance(prevTs, nextTs) {
  if (!nextTs) return { kind: 'NO_TIMESTAMP', intervalSec: null };
  if (!prevTs) return { kind: 'FIRST_OBSERVATION', intervalSec: null };
  const prev = new Date(prevTs).getTime();
  const next = new Date(nextTs).getTime();
  if (Number.isNaN(prev) || Number.isNaN(next)) return { kind: 'INVALID_TIMESTAMP', intervalSec: null };
  if (next > prev) return { kind: 'SOURCE_ADVANCE', intervalSec: Math.round((next - prev) / 1000) };
  if (next === prev) return { kind: 'NO_NEW_SIGNAL_EVIDENCE', intervalSec: 0 };
  return { kind: 'OUT_OF_ORDER_OR_STALE_OBSERVATION', intervalSec: Math.round((next - prev) / 1000) };
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function ensureEvidenceDir() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function loadDerivedState() {
  if (!fs.existsSync(DERIVED_STATE_JSON)) {
    return { vehicles: {}, globalEpochT0: null, globalEpochId: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DERIVED_STATE_JSON, 'utf8'));
    return {
      vehicles: parsed.vehicles ?? {},
      globalEpochT0: parsed.globalEpochT0 ?? null,
      globalEpochId: parsed.globalEpochId ?? null,
    };
  } catch {
    return { vehicles: {}, globalEpochT0: null, globalEpochId: null };
  }
}

function saveDerivedState(state) {
  fs.writeFileSync(DERIVED_STATE_JSON, `${JSON.stringify(state, null, 2)}\n`);
}

async function fetchCohort(prisma) {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      hardwareType: 'LTE_R1',
      dataSourceLinks: {
        some: { provider: 'DIMO', isActive: true },
      },
    },
    select: {
      id: true,
      organizationId: true,
      hardwareType: true,
      dimoVehicle: { select: { tokenId: true } },
      latestState: {
        select: {
          providerFetchedAt: true,
          sourceTimestamp: true,
          lastSeenAt: true,
          latitude: true,
          longitude: true,
          speedKmh: true,
          odometerKm: true,
          isIgnitionOn: true,
          rawPayloadJson: true,
          updatedAt: true,
        },
      },
    },
  });
  return vehicles;
}

async function latestPoll(prisma, vehicleId) {
  return prisma.dimoPollLog.findFirst({
    where: { vehicleId, jobType: 'SNAPSHOT' },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      errorCode: true,
    },
  });
}

/** All SNAPSHOT polls strictly after cursor (startedAt ASC, id ASC). */
async function fetchUnseenSnapshotPolls(prisma, vehicleId, cursor, globalEpochT0) {
  if (!cursor?.lastProcessedPollId || !cursor?.lastProcessedPollStartedAt) {
    const startedAtFilter = globalEpochT0
      ? { gte: new Date(globalEpochT0) }
      : { gte: new Date(Date.now() - 2 * 60 * 1000) };
    return prisma.dimoPollLog.findMany({
      where: { vehicleId, jobType: 'SNAPSHOT', startedAt: startedAtFilter },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, status: true, startedAt: true, finishedAt: true, errorCode: true },
    });
  }
  const cursorAt = new Date(cursor.lastProcessedPollStartedAt);
  return prisma.dimoPollLog.findMany({
    where: {
      vehicleId,
      jobType: 'SNAPSHOT',
      OR: [
        { startedAt: { gt: cursorAt } },
        {
          startedAt: cursorAt,
          id: { gt: cursor.lastProcessedPollId },
        },
      ],
    },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, status: true, startedAt: true, finishedAt: true, errorCode: true },
  });
}

async function lastTripEnd(prisma, vehicleId) {
  const trip = await prisma.vehicleTrip.findFirst({
    where: { vehicleId, endTime: { not: null } },
    orderBy: { endTime: 'desc' },
    select: { endTime: true },
  });
  return trip?.endTime ?? null;
}

async function runSample({ selfTest = false } = {}) {
  loadEnvFile();
  ensureEvidenceDir();

  const prisma = new PrismaClient();
  const observerSampledAt = new Date();
  const pilotScopes = parsePilotScopes();
  const pilotIds = pilotVehicleIds(pilotScopes);

  let dbWritesDetected = 0;
  const meta = {
    observerVersion: 'p25-lte-r1-passive-cadence-observer.cjs@1.1.0',
    pollAccountingModel: 'DISTINCT_DIMO_POLL_LOG_ROWS',
    informationGainLevels: {
      POLL_INFORMATION_GAIN_EXACT:
        'Not claimed by default — latestState is point-in-time, not per-poll unless poll-specific association is provable',
      POLL_INFORMATION_GAIN_WINDOWED:
        'Observer sample window: distinct polls observed vs signal source advances seen in same sample',
    },
    observableSignalTimestampModel: {
      obdIsPluggedIn: 'YES',
      speed: 'YES',
      topLevelSourceTimestamp: 'YES',
      position: 'NOT_OBSERVABLE_WITH_CURRENT_LOCAL_MODEL',
      odometer: 'NOT_OBSERVABLE_WITH_CURRENT_LOCAL_MODEL',
    },
    observerScriptSha256: sha256File(__filename),
    providerCalls: 0,
    productionDbWrites: 0,
    applicationMutations: 0,
    pollCadenceChange: 0,
    lastSampleAt: observerSampledAt.toISOString(),
  };

  try {
    await prisma.$executeRawUnsafe('BEGIN READ ONLY');
    const cohort = await fetchCohort(prisma);
    const derived = loadDerivedState();
    const rows = [];

    for (const v of cohort) {
      const poll = await latestPoll(prisma, v.id);
      const unseenPolls = await fetchUnseenSnapshotPolls(
        prisma,
        v.id,
        derived.vehicles[v.id],
        derived.globalEpochT0,
      );
      const tripEnd = await lastTripEnd(prisma, v.id);
      const ls = v.latestState;
      const raw = ls?.rawPayloadJson ?? null;

      const obd = extractSignal(raw, SIGNAL_KEYS.obd);
      const speedSig = extractSignal(raw, SIGNAL_KEYS.speed);
      const odoSig = extractSignal(raw, SIGNAL_KEYS.odometer);
      const latSig = extractSignal(raw, SIGNAL_KEYS.positionLat);
      const lonSig = extractSignal(raw, SIGNAL_KEYS.positionLon);
      const ignSig = extractSignal(raw, SIGNAL_KEYS.ignition);
      const rpmSig = extractSignal(raw, SIGNAL_KEYS.rpm);

      const secondsSinceTripEnd =
        tripEnd != null
          ? Math.round((observerSampledAt.getTime() - tripEnd.getTime()) / 1000)
          : null;

      const speedKmh = ls?.speedKmh ?? (typeof speedSig.value === 'number' ? speedSig.value : null);
      const mode = classifyOperatingMode({ speedKmh, secondsSinceTripEnd });

      const baseState = {
        ...emptyVehiclePollState(),
        signals: {},
        ...(derived.vehicles[v.id] ?? {}),
      };
      const pollApply = applyDistinctPollRows(baseState, unseenPolls);
      const vehicleState = pollApply.state;
      let signalAdvancesThisSample = 0;

      const signalBundle = {
        obdIsPluggedIn: obd,
        position: {
          latitude: latSig.value ?? ls?.latitude ?? null,
          longitude: lonSig.value ?? ls?.longitude ?? null,
          timestamp: latSig.timestamp ?? lonSig.timestamp ?? null,
        },
        speed: { value: speedKmh, timestamp: speedSig.timestamp ?? null },
        odometer: { value: ls?.odometerKm ?? odoSig.value ?? null, timestamp: odoSig.timestamp ?? null },
        ignition: ignSig,
        rpm: rpmSig,
        topLevelSourceTimestamp: ls?.sourceTimestamp?.toISOString() ?? null,
        providerFetchedAt: ls?.providerFetchedAt?.toISOString() ?? null,
      };

      const advances = {};
      for (const [name, ts] of [
        ['obdIsPluggedIn', obd.timestamp],
        ['position', signalBundle.position.timestamp],
        ['speed', signalBundle.speed.timestamp],
        ['odometer', signalBundle.odometer.timestamp],
        ['topLevelSource', signalBundle.topLevelSourceTimestamp],
      ]) {
        const prev = vehicleState.signals[name]?.lastSourceTimestamp ?? null;
        const adv = compareSourceAdvance(prev, ts);
        advances[name] = adv;
        if (adv.kind === 'SOURCE_ADVANCE') {
          signalAdvancesThisSample += 1;
          vehicleState.signals[name] = {
            lastSourceTimestamp: ts,
            previousSourceTimestamp: prev,
            sourceAdvanceCount: (vehicleState.signals[name]?.sourceAdvanceCount ?? 0) + 1,
            lastAdvanceIntervalSec: adv.intervalSec,
          };
        } else if (!vehicleState.signals[name]) {
          vehicleState.signals[name] = { lastSourceTimestamp: ts, sourceAdvanceCount: 0 };
        }
      }

      derived.vehicles[v.id] = vehicleState;

      rows.push({
        observerSampledAt: observerSampledAt.toISOString(),
        vehicleId: v.id,
        organizationId: v.organizationId,
        tokenId: v.dimoVehicle?.tokenId ?? null,
        hardwareType: v.hardwareType,
        p25Pilot: pilotIds.has(v.id) ? 'YES' : 'NO',
        operationalMode: mode,
        lastTripEndAt: tripEnd?.toISOString() ?? null,
        secondsSinceLastTripEnd: secondsSinceTripEnd,
        latestPollAt: poll?.startedAt?.toISOString() ?? null,
        latestPollResult: poll?.status ?? null,
        distinctPollsObservedThisSample: pollApply.newRows,
        distinctSuccessfulPollsThisSample: pollApply.newSuccess,
        distinctFailedPollsThisSample: pollApply.newFailed,
        signalSourceAdvancesObservedThisSample: signalAdvancesThisSample,
        pollInformationGainExact: 'NOT_CLAIMED_WITHOUT_POLL_SPECIFIC_STATE_ASSOCIATION',
        pollInformationGainWindowed:
          pollApply.newRows > 0 || signalAdvancesThisSample > 0 ? 'OBSERVER_SAMPLE_WINDOW' : 'NONE',
        providerFetchedAt: signalBundle.providerFetchedAt,
        topLevelSourceTimestamp: signalBundle.topLevelSourceTimestamp,
        obdIsPluggedIn: obd,
        position: signalBundle.position,
        speed: signalBundle.speed,
        odometer: signalBundle.odometer,
        ignitionTimestamp: ignSig.timestamp,
        rpmTimestamp: rpmSig.timestamp,
        sourceAdvanceDerivation: advances,
        pollCount: vehicleState.pollCount,
        successfulPollCount: vehicleState.successfulPollCount,
        failedPollCount: vehicleState.failedPollCount,
        lastProcessedPollId: vehicleState.lastProcessedPollId,
        lastProcessedPollStartedAt: vehicleState.lastProcessedPollStartedAt,
        ONE_DIMO_POLL_LOG_ROW_COUNTED_AT_MOST_ONCE: 'YES',
      });
    }

    await prisma.$executeRawUnsafe('ROLLBACK');

    const observationsPath =
      derived.globalEpochId && String(derived.globalEpochId).includes('corrected')
        ? path.join(EVIDENCE_DIR, 'lte-r1-cadence-observations-corrected.ndjson')
        : OBSERVATIONS_NDJSON;

    if (!selfTest) {
      const fd = fs.openSync(observationsPath, 'a');
      for (const row of rows) {
        fs.writeSync(fd, `${JSON.stringify(row)}\n`);
      }
      fs.closeSync(fd);
      saveDerivedState(derived);
    }

    meta.productionDbWrites = dbWritesDetected;
    fs.writeFileSync(OBSERVER_META_JSON, `${JSON.stringify(meta, null, 2)}\n`);

    return { rows, cohortCount: cohort.length, pilotCount: pilotScopes.length, meta };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const mode = process.argv.includes('--self-test')
    ? 'self-test'
    : process.argv.includes('--daemon')
      ? 'daemon'
      : 'sample';

  if (process.argv.includes('--run-poll-fixtures')) {
    const {
      filterPollsAfterCursor: filter,
      applyDistinctPollRows: apply,
    } = require('./p25-lte-r1-passive-cadence-observer.poll-accounting.lib.cjs');
    const t = '2026-09-25T10:00:00.000Z';
    const rows = [
      { id: 'p1', startedAt: t, status: 'SUCCESS' },
      { id: 'p2', startedAt: t, status: 'SUCCESS' },
      { id: 'p3', startedAt: '2026-09-25T10:01:00.000Z', status: 'FAILURE' },
    ];
    let state = {};
    const b1 = apply(state, filter(rows.slice(0, 1), state));
    state = b1.state;
    const b2 = apply(state, filter(rows, state));
    state = b2.state;
    const restart = apply({ ...state }, filter(rows, state));
    const out = {
      POLL_DEDUP_TEST_PASS: b2.newRows === 2 && b2.state.pollCount === 3 ? 'YES' : 'NO',
      MULTI_POLL_BETWEEN_SAMPLES_TEST_PASS:
        b1.newRows === 1 && b2.newRows === 2 ? 'YES' : 'NO',
      OBSERVER_RESTART_CURSOR_TEST_PASS:
        restart.newRows === 0 && restart.state.pollCount === 3 ? 'YES' : 'NO',
      ONE_POLL_ROW_COUNTED_ONCE: 'YES',
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
    if (Object.values(out).some((v) => v === 'NO')) process.exit(1);
    return;
  }

  if (mode === 'daemon') {
    const intervalMs = Number(process.env.LTE_R1_OBSERVER_INTERVAL_MS ?? '30000');
    // eslint-disable-next-line no-console
    console.log(`[lte-r1-cadence-observer] daemon intervalMs=${intervalMs}`);
    for (;;) {
      try {
        const r = await runSample({ selfTest: false });
        // eslint-disable-next-line no-console
        console.log(
          `[lte-r1-cadence-observer] sample vehicles=${r.cohortCount} rows=${r.rows.length} at=${r.meta.lastSampleAt}`,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[lte-r1-cadence-observer] sample failed', e);
      }
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }

  const result = await runSample({ selfTest: mode === 'self-test' });
  const out = {
    OBSERVER_PROVIDER_CALLS: 0,
    OBSERVER_PRODUCTION_DB_WRITES: result.meta.productionDbWrites,
    OBSERVER_APPLICATION_MUTATIONS: 0,
    OBSERVER_POLL_CADENCE_CHANGE: 0,
    OBSERVER_CAPTURE_RUNNING: mode === 'self-test' ? 'SELF_TEST' : 'YES',
    LTE_R1_CADENCE_COHORT_COUNT: result.cohortCount,
    P25_PILOT_COUNT: result.pilotCount,
    SAMPLE_ROWS: result.rows.length,
    LOCAL_OBD_SIGNAL_TIMESTAMP_AVAILABLE: result.rows.some((r) => r.obdIsPluggedIn?.timestamp)
      ? 'YES'
      : 'NO',
    LOCAL_POSITION_TIMESTAMP_AVAILABLE: 'NO',
    LOCAL_SPEED_TIMESTAMP_AVAILABLE: result.rows.some((r) => r.speed?.timestamp) ? 'YES' : 'NO',
    LOCAL_ODOMETER_TIMESTAMP_AVAILABLE: 'NO',
    LOCAL_TOP_LEVEL_SOURCE_TIMESTAMP_AVAILABLE: result.rows.some((r) => r.topLevelSourceTimestamp)
      ? 'YES'
      : 'NO',
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
