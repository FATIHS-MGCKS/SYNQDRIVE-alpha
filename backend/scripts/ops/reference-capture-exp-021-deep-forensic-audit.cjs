#!/usr/bin/env node
/**
 * EXP-021 deep forensic audit — read-only production analysis.
 * Usage: SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env node reference-capture-exp-021-deep-forensic-audit.cjs
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const AGES_MS = [30_000, 60_000, 120_000, 180_000, 300_000, 600_000];
const AGES_LABEL = ['+30', '+60', '+120', '+180', '+300', '+600'];
const EXPECTED = {
  plate: 'KS MS 661',
  vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
  tokenId: 187361,
  sessionId: '945edc40-3002-4b87-83f6-a55d8cf66ffb',
  experimentId: 'exp-021-945edc40-e7850aa0',
  calibrationSeriesId: 'c8b9cd3e-3cb9-40c2-a8f2-dd2a6ba26741',
  vehicleTripId: '2bdc6e71-3822-4c9e-bda3-b46c681e6844',
  productionSha: '2f1b4f53d418448be5e9dc087393fabf46faf4c1',
  canonicalT0: '2026-09-10T19:41:19.000Z',
  provisionalEnd: '2026-09-10T20:01:15.000Z',
  tripEndTime: '2026-09-10T20:02:05.213Z',
  pdiBoundary: '2026-09-10T20:01:15.000Z',
};

function loadEnv() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function setDiff(a, b) {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function classifyProbe(maturation) {
  const ages = AGES_MS.map((ms) => maturation[ms]).filter(Boolean);
  if (ages.length === 0) return 'UNKNOWN_REFERENCE_UNIVERSE';
  const failures = ages.filter((a) => a.status === 'ZERO_RESULT' || a.rawRowCount === 0);
  if (failures.length && failures.length === ages.length) return 'QUERY_OBSERVATION_FAILURE';
  const first = ages.find((a) => a.rawRowCount > 0);
  if (!first) return 'QUERY_OBSERVATION_FAILURE';
  const ref = new Set(first.identities);
  let lastStructuralChange = first.ageMs;
  let stableFrom = first.ageMs;
  for (const a of ages) {
    if (a.rawRowCount === 0) continue;
    const ids = new Set(a.identities);
    const added = [...ids].filter((x) => !ref.has(x));
    const removed = [...ref].filter((x) => !ids.has(x));
    if (added.length || removed.length) lastStructuralChange = a.ageMs;
    else if (a.ageMs >= stableFrom && lastStructuralChange === stableFrom) stableFrom = a.ageMs;
    for (const id of added) ref.add(id);
  }
  const at600 = maturation[600_000];
  const at30 = maturation[30_000];
  if (!at600 || at600.rawRowCount === 0) {
    if (failures.length) return 'QUERY_OBSERVATION_FAILURE';
    return 'UNKNOWN_REFERENCE_UNIVERSE';
  }
  const refUniverse = new Set(at600.identities);
  if (at30 && at30.rawRowCount > 0) {
    const earlyOnly = setDiff(at30.identities, at600.identities);
    const lateAdded = setDiff(at600.identities, at30.identities);
    if (lateAdded.length > 0 && earlyOnly.length === 0) return 'LATE_BUCKET_RECOVERY';
    if (lateAdded.length === 0 && earlyOnly.length === 0 && stableFrom <= 30_000) return 'STRUCTURALLY_COMPLETE_AT_30';
    if (lateAdded.length === 0 && earlyOnly.length > 0) return 'VALUE_REVISION_ONLY';
  }
  const missingAt600 = [...refUniverse].length === 0;
  if (missingAt600) return 'UNKNOWN_REFERENCE_UNIVERSE';
  return 'STRUCTURALLY_COMPLETE_AT_30';
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const out = { nowUtc: new Date().toISOString() };

  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { licensePlate: EXPECTED.plate },
      select: {
        id: true,
        licensePlate: true,
        latestState: { select: { dimoTokenId: true, sourceTimestamp: true, speedKmh: true } },
      },
    });

    const session = await prisma.referenceCaptureSession.findUnique({
      where: { id: EXPECTED.sessionId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        startedAt: true,
        acquisitionStateJson: true,
        updatedAt: true,
      },
    });

    const exp = await prisma.referenceCaptureSettlementShadowExperiment.findUnique({
      where: { sessionId: EXPECTED.sessionId },
      select: {
        id: true,
        experimentId: true,
        status: true,
        vehicleTripId: true,
        calibrationSeriesId: true,
        metadataJson: true,
      },
    });

    const trip = await prisma.vehicleTrip.findUnique({
      where: { id: EXPECTED.vehicleTripId },
      select: {
        id: true,
        tripStatus: true,
        startTime: true,
        endTime: true,
        possibleEndAt: true,
        possibleStartAt: true,
        endDetectionMode: true,
        endConfidence: true,
        tripAnalysisStatus: true,
        analysisCompletedAt: true,
        analysisFailedAt: true,
        analysisFailedReason: true,
        createdAt: true,
        rawDetectionMeta: true,
      },
    });

    const identityChecks = {
      vehicleId: vehicle?.id === EXPECTED.vehicleId,
      tokenId: vehicle?.latestState?.dimoTokenId === EXPECTED.tokenId,
      sessionId: session?.id === EXPECTED.sessionId,
      experimentId: exp?.experimentId === EXPECTED.experimentId,
      calibrationSeriesId:
        session?.acquisitionStateJson?.hfCalibrationSeries?.calibrationSeriesId ===
          EXPECTED.calibrationSeriesId ||
        exp?.calibrationSeriesId === EXPECTED.calibrationSeriesId,
      vehicleTripId: trip?.id === EXPECTED.vehicleTripId,
    };

    out.identity = {
      vehicle,
      sessionStatus: session?.status,
      exp,
      trip,
      identityChecks,
      RUN_IDENTITY_MATCH: Object.values(identityChecks).every(Boolean) ? 'YES' : 'NO',
    };

    const series = session?.acquisitionStateJson?.hfCalibrationSeries ?? {};
    const completed = series.completedPhaseSummaries ?? [];
    out.phases = {
      completedPhaseSummaries: completed,
      activePhase: series.activePhase ?? null,
      canonicalT0: session?.acquisitionStateJson?.exp021CanonicalT0 ?? null,
    };

    const observations = exp
      ? await prisma.referenceCaptureSettlementShadowObservation.findMany({
          where: { experimentId: exp.id },
          orderBy: [{ probeId: 'asc' }, { scheduledAgeMs: 'asc' }],
        })
      : [];

    const fixedObs = observations.filter((o) => o.probeType === 'FIXED_INTERVAL');
    const probeIds = [...new Set(fixedObs.map((o) => o.probeId))].sort();

    const fixedMaturation = {};
    for (const probeId of probeIds) {
      const maturation = {};
      const byAge = fixedObs.filter((o) => o.probeId === probeId);
      for (const ageMs of AGES_MS) {
        const row = byAge.find((o) => o.scheduledAgeMs === ageMs);
        if (!row) continue;
        const json = row.observationJson ?? {};
        maturation[ageMs] = {
          ageMs,
          ageLabel: `+${ageMs / 1000}`,
          actualAgeMs: row.actualAgeMs,
          scheduleDriftMs: row.scheduleDriftMs,
          rawRowCount: row.rawRowCount,
          status: row.providerRequestStatus,
          responseHash: row.responseHash,
          identityCount: (json.uniqueBucketIdentities ?? []).length,
          identities: json.uniqueBucketIdentities ?? [],
          newBuckets: json.newBucketIdentities ?? [],
          missingBuckets: json.missingBucketIdentities ?? [],
          fieldSampleCounts: json.fieldSampleCounts ?? {},
          phase: row.phase,
          sourceStart: row.sourceIntervalStart,
          sourceEnd: row.sourceIntervalEnd,
        };
      }
      const agesPresent = AGES_MS.filter((ms) => maturation[ms]?.rawRowCount > 0);
      let firstStableStructural = null;
      if (agesPresent.length > 0) {
        const base = new Set(maturation[agesPresent[0]].identities);
        firstStableStructural = agesPresent[0];
        for (const ms of agesPresent) {
          const ids = maturation[ms].identities;
          const added = setDiff(ids, [...base]);
          const removed = setDiff([...base], ids);
          if (added.length || removed.length) {
            firstStableStructural = ms;
            for (const id of ids) base.add(id);
          }
        }
      }
      const hashStable =
        agesPresent.length > 1 &&
        agesPresent.every((ms) => maturation[ms].responseHash === maturation[agesPresent[0]].responseHash);
      const identityStable =
        agesPresent.length > 1 &&
        agesPresent.every(
          (ms) =>
            maturation[ms].identityCount === maturation[agesPresent[0]].identityCount &&
            setDiff(maturation[ms].identities, maturation[agesPresent[0]].identities).length === 0,
        );
      fixedMaturation[probeId] = {
        maturation,
        classification: classifyProbe(maturation),
        firstStableStructuralAgeMs: firstStableStructural,
        identityStableAcrossAges: identityStable,
        responseHashStableAcrossAges: hashStable,
        structuralAt30: maturation[30_000]
          ? maturation[600_000]
            ? setDiff(maturation[600_000].identities, maturation[30_000].identities).length === 0 &&
              setDiff(maturation[30_000].identities, maturation[600_000].identities).length === 0
            : null
          : null,
      };
    }
    out.fixedMaturation = fixedMaturation;

    const pdiObs = observations.filter((o) => {
      if (o.probeType !== 'WHOLE_TRIP') return false;
      if (o.phase !== 'PHYSICAL_DRIVE_INTERVAL_SHADOW') return false;
      const endIso = new Date(o.sourceIntervalEnd).toISOString();
      return endIso === EXPECTED.pdiBoundary;
    });
    const pdiMaturation = {};
    for (const ageMs of AGES_MS) {
      const row = pdiObs.find((o) => o.scheduledAgeMs === ageMs);
      if (!row) continue;
      const json = row.observationJson ?? {};
      pdiMaturation[ageMs] = {
        probeId: row.probeId,
        actualAgeMs: row.actualAgeMs,
        scheduleDriftMs: row.scheduleDriftMs,
        rawRowCount: row.rawRowCount,
        responseHash: row.responseHash,
        identityCount: (json.uniqueBucketIdentities ?? []).length,
        identities: json.uniqueBucketIdentities ?? [],
        newBuckets: json.newBucketIdentities ?? [],
        missingBuckets: json.missingBucketIdentities ?? [],
      };
    }
    const pdiAges = AGES_MS.filter((ms) => pdiMaturation[ms]?.rawRowCount > 0);
    let pdiIdentityStable = pdiAges.length > 1;
    let pdiHashStable = pdiAges.length > 1;
    if (pdiAges.length > 1) {
      const base = pdiMaturation[pdiAges[0]].identities;
      pdiIdentityStable = pdiAges.every(
        (ms) =>
          setDiff(pdiMaturation[ms].identities, base).length === 0 &&
          setDiff(base, pdiMaturation[ms].identities).length === 0,
      );
      pdiHashStable = pdiAges.every(
        (ms) => pdiMaturation[ms].responseHash === pdiMaturation[pdiAges[0]].responseHash,
      );
    }
    let pdiLastBucketAddition = null;
    let pdiLastNewBucketCount = 0;
    for (const ms of AGES_MS) {
      const row = pdiMaturation[ms];
      if (!row) continue;
      if ((row.newBuckets ?? []).length > 0) {
        pdiLastBucketAddition = ms;
        pdiLastNewBucketCount = row.newBuckets.length;
      }
    }
    out.pdi = {
      authoritativeBoundary: EXPECTED.pdiBoundary,
      observationCount: pdiObs.length,
      maturation: pdiMaturation,
      bucketSetStableFrom30: pdiIdentityStable ? 'YES' : pdiAges.length ? 'NO' : 'UNKNOWN',
      valuesStableFrom30: 'UNKNOWN',
      valuesStableReason:
        'Persisted observationJson stores bucket identities only; VALUE_REVISION_DETECTION NOT_IMPLEMENTED in parser; responseHash includes age metadata',
      hashStableAcrossAges: pdiHashStable,
      lastBucketAdditionAgeMs: pdiLastBucketAddition,
    };

    const wholeTripSchedules = exp
      ? await prisma.referenceCaptureSettlementShadowSchedule.findMany({
          where: {
            experimentId: exp.id,
            probeType: 'WHOLE_TRIP',
            NOT: { probeId: { startsWith: 'PDI-' } },
          },
        })
      : [];
    out.wholeTrip = {
      canonicalBound: Boolean(exp?.vehicleTripId),
      scheduleCount: wholeTripSchedules.length,
      schedules: wholeTripSchedules.map((s) => ({
        probeId: s.probeId,
        age: s.scheduledAgeMs / 1000,
        status: s.status,
      })),
    };

    const phaseRates = completed.map((p) => {
      const poll = p.effectiveConfig?.effectivePollIntervalMs ?? p.effectivePollIntervalMs;
      const wallS = (p.durationMs ?? 0) / 1000;
      const movS = (p.validMovementDurationMs ?? 0) / 1000;
      const req = p.providerRequestCount ?? p.allRequestCount ?? 0;
      return {
        phaseMs: poll,
        wallSeconds: wallS,
        movementSeconds: movS,
        providerRequestCount: req,
        providerSuccessCount: p.providerSuccessCount,
        providerZeroResultCount: p.providerZeroResultCount,
        uniqueBuckets: p.uniqueTemporalBucketStartCount ?? p.providerBucketCount,
        medianDt: p.nativeMedianTemporalCadenceMs,
        p90Dt: p.nativeP90TemporalCadenceMs,
        maxGapMs: p.nativeMaxTemporalGapMs,
        reqPerWallMin: wallS > 0 ? (req / wallS) * 60 : null,
        reqPerMovementMin: movS > 0 ? (req / movS) * 60 : null,
      };
    });
    out.phaseRates = phaseRates;

    const t0Ms = Date.parse(EXPECTED.canonicalT0);
    const endMs = Date.parse(EXPECTED.provisionalEnd);
    const phase20StartMs = Date.parse('2026-09-10T19:57:06.545Z');
    const phaseDurationMs = Number.parseInt(process.env.EXP021_PHASE_DURATION_MS ?? '300000', 10);
    out.phase10Analysis = {
      t0ToPhysicalEndSeconds: (endMs - t0Ms) / 1000,
      phase20AvailableWallSeconds: (endMs - phase20StartMs) / 1000,
      requiredMovementMsPerPhase: phaseDurationMs,
      requiredMovementSecondsPerPhase: phaseDurationMs / 1000,
      phase20CouldSatisfyAdvanceRule:
        (endMs - phase20StartMs) >= phaseDurationMs ? 'WALL_ONLY_MAYBE' : 'NO_WALL_INSUFFICIENT',
      note:
        'Advance requires validMovementMs >= phaseDurationMs (default 300s), not wall clock; phase 20 never accumulated 300s MOVING before park',
    };

    const gapsRecovered = Object.values(fixedMaturation).some(
      (p) => p.classification === 'LATE_BUCKET_RECOVERY',
    );
    const gapsPersist = Object.values(fixedMaturation).some(
      (p) => p.classification === 'PERSISTENT_GAP_AT_600',
    );
    const summaryOnly = {};
    for (const [probeId, probe] of Object.entries(fixedMaturation)) {
      const ages = {};
      for (const ms of AGES_MS) {
        const row = probe.maturation[ms];
        if (!row) continue;
        ages[`+${ms / 1000}`] = {
          rows: row.rawRowCount,
          identities: row.identityCount,
          new: row.newBuckets.length,
          missing: row.missingBuckets.length,
        };
      }
      summaryOnly[probeId] = {
        classification: probe.classification,
        structuralAt30: probe.structuralAt30,
        identityStableAcrossAges: probe.identityStableAcrossAges,
        ages,
      };
    }
    out.fixedMaturationSummary = summaryOnly;
    delete out.fixedMaturation;

    out.gapSummary = {
      gapsRecoveredBySettlement: gapsRecovered ? 'PARTIAL' : 'NO',
      gapsPersistingAt600: gapsPersist ? 'YES' : 'NO',
      probes: Object.fromEntries(
        Object.entries(summaryOnly).map(([k, v]) => [k, v.classification]),
      ),
    };

    out.tripFsm = {
      ONGOING_WITH_ENDTIME_CURRENTLY_EXISTS:
        trip?.tripStatus === 'ONGOING' && trip?.endTime != null ? 'YES' : 'NO',
      tripStatus: trip?.tripStatus,
      endTime: trip?.endTime,
      possibleEndAt: trip?.possibleEndAt,
      endDetectionMode: trip?.endDetectionMode,
      endConfidence: trip?.endConfidence,
      tripAnalysisStatus: trip?.tripAnalysisStatus,
      rawDetectionMeta: trip?.rawDetectionMeta,
    };
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
