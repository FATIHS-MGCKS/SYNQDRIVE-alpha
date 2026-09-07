#!/usr/bin/env node
/**
 * EXP-019 video GT vs telemetry correlation (READ-ONLY forensic).
 * Run on VPS: cd /opt/synqdrive/current/backend && sudo node architecture/.../exp-019-video-gt-correlation-export.cjs
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Wallet } = require('ethers');

const SESSION_ID = '2508b697-f101-4155-a0d3-8436e46bb779';
const VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const TOKEN_ID = 187336;
const SIGNAL_FIELDS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
  'obdEngineLoad',
];

const GT_EVENTS = [
  {
    id: 'GT-10-P0',
    phase: '10s',
    gapStartUtc: '2026-09-07T04:35:29.538Z',
    gapEndUtc: '2026-09-07T04:35:52.304Z',
    reviewStartUtc: '2026-09-07T04:35:19.538Z',
    reviewEndUtc: '2026-09-07T04:36:02.304Z',
    videoCestStart: '06:35:29.538',
    videoCestEnd: '06:35:52.304',
  },
  {
    id: 'GT-20-P0',
    phase: '20s',
    gapStartUtc: '2026-09-07T04:37:13.913Z',
    gapEndUtc: '2026-09-07T04:40:02.534Z',
    reviewStartUtc: '2026-09-07T04:37:03.913Z',
    reviewEndUtc: '2026-09-07T04:40:12.534Z',
    videoCestStart: '06:37:13.913',
    videoCestEnd: '06:40:02.534',
  },
  {
    id: 'GT-30-P0',
    phase: '30s',
    gapStartUtc: '2026-09-07T04:42:54.742Z',
    gapEndUtc: '2026-09-07T04:44:52.054Z',
    reviewStartUtc: '2026-09-07T04:42:44.742Z',
    reviewEndUtc: '2026-09-07T04:45:02.054Z',
    videoCestStart: '06:42:54.742',
    videoCestEnd: '06:44:52.054',
  },
  {
    id: 'GT-30-P1',
    phase: '30s',
    gapStartUtc: '2026-09-07T04:46:16.344Z',
    gapEndUtc: '2026-09-07T04:47:35.968Z',
    reviewStartUtc: '2026-09-07T04:46:06.344Z',
    reviewEndUtc: '2026-09-07T04:47:45.968Z',
    videoCestStart: '06:46:16.344',
    videoCestEnd: '06:47:35.968',
  },
  {
    id: 'GT-60-P0',
    phase: '60s',
    gapStartUtc: '2026-09-07T04:54:29.814Z',
    gapEndUtc: '2026-09-07T04:56:56.693Z',
    reviewStartUtc: '2026-09-07T04:54:19.814Z',
    reviewEndUtc: '2026-09-07T04:57:06.693Z',
    videoCestStart: '06:54:29.814',
    videoCestEnd: '06:56:56.693',
  },
];

function loadEnv() {
  for (const envPath of ['/opt/synqdrive/shared/backend.env']) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function inRange(ts, start, end) {
  const t = Date.parse(ts);
  return t >= Date.parse(start) && t <= Date.parse(end);
}

function inGapInterior(ts, gapStart, gapEnd) {
  const t = Date.parse(ts);
  return t > Date.parse(gapStart) && t < Date.parse(gapEnd);
}

function bucketRow(obsByField) {
  const ts = obsByField.speed?.providerTimestamp;
  if (!ts) return null;
  const row = { providerTimestamp: ts, bucketStart: ts };
  for (const f of SIGNAL_FIELDS) {
    if (obsByField[f]) row[f] = obsByField[f].normalizedValueJson;
  }
  return row;
}

function groupSpeedBuckets(observations) {
  const byTs = new Map();
  for (const o of observations) {
    if (!SIGNAL_FIELDS.includes(o.providerField)) continue;
    const ts = o.providerTimestamp;
    if (!byTs.has(ts)) byTs.set(ts, {});
    byTs.get(ts)[o.providerField] = o;
  }
  return [...byTs.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
    .map(([, fields]) => bucketRow(fields))
    .filter(Boolean);
}

async function getDeveloperJwt() {
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = process.env.DIMO_CLIENT_ID;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY;
  const DOMAIN = process.env.DIMO_REDIRECT_URI || process.env.DIMO_DOMAIN || 'https://auth.dimo.zone';
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: CLIENT_ID, domain: DOMAIN, scope: 'openid email', response_type: 'code', address: CLIENT_ID },
    timeout: 30000,
  });
  const wallet = new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  const signature = await wallet.signMessage(challenge.data.challenge);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      domain: DOMAIN,
      grant_type: 'authorization_code',
      state: challenge.data.state,
      signature,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 },
  );
  const d = submit.data;
  return d.developer_jwt || d.access_token || d.token;
}

async function getVehicleJwt(devJwt) {
  const url = process.env.DIMO_TOKEN_EXCHANGE_URL || 'https://token-exchange-api.dimo.zone';
  const nft = process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${url}/v1/tokens/exchange`,
    { nftContractAddress: nft, privileges: [1, 2, 3, 4, 5], tokenId: TOKEN_ID },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  return resp.data.token || resp.data.access_token || resp.data.jwt;
}

async function gql(jwt, query) {
  const url = process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(url, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  return resp.data;
}

function classifyHfCapture(gt, gapStartBucket, gapEndBucket, interiorBuckets) {
  if (interiorBuckets.length > 0) {
    const speeds = interiorBuckets.map((b) => b.speed).filter((v) => v != null);
    if (speeds.length >= 3) return 'FULLY_OBSERVED';
    return 'PARTIALLY_OBSERVED';
  }
  const startSp = gapStartBucket?.speed;
  const endSp = gapEndBucket?.speed;
  if (startSp == null && endSp == null) return 'NOT_OBSERVED';
  if (startSp === 0 && endSp === 0) return 'NOT_OBSERVED';
  if (gapStartBucket || gapEndBucket) return 'BOUNDARY_ONLY';
  return 'NOT_OBSERVED';
}

function matrixLevel(captureClass) {
  if (captureClass === 'FULLY_OBSERVED') return 'FULL';
  if (captureClass === 'PARTIALLY_OBSERVED') return 'PARTIAL';
  if (captureClass === 'BOUNDARY_ONLY') return 'BOUNDARY_ONLY';
  return 'NONE';
}

function nativeLevel(events) {
  if (!events || events.length === 0) return 'NONE';
  return events.length >= 2 ? 'FULL' : 'PARTIAL';
}

function detectorLevel(events) {
  if (!events || events.length === 0) return 'NONE';
  return 'PARTIAL';
}

function severityFromMatrix(hf, native, detector, downstream) {
  if (hf === 'NONE' && native === 'NONE' && detector === 'NONE' && downstream === 'NO_CONTRIBUTION') return 'CRITICAL';
  if (hf === 'BOUNDARY_ONLY' && native === 'NONE') return 'HIGH';
  if (hf === 'PARTIAL' || native === 'PARTIAL') return 'MEDIUM';
  if (hf === 'FULL' || native === 'FULL') return 'LOW';
  return 'HIGH';
}

(async () => {
  loadEnv();
  const dataDir = process.argv.find((a) => a.startsWith('--data-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-019-video-gt-correlation';
  fs.mkdirSync(outDir, { recursive: true });

  const observations = fs
    .readFileSync(path.join(dataDir, 'observations.jsonl'), 'utf8')
    .trim()
    .split(/\n/)
    .map((l) => JSON.parse(l));

  const sessionFrom = '2026-09-07T04:30:00.000Z';
  const sessionTo = '2026-09-07T05:05:00.000Z';
  const speedBuckets = groupSpeedBuckets(observations);

  let dimoNativeEvents = [];
  let dbTrips = [];
  let dbDrivingEvents = [];
  let dbTripBehaviorEvents = [];
  let dbImpact = [];

  try {
    const jwt = await getVehicleJwt(await getDeveloperJwt());
    const q = [
      'query BroadReferenceEvents {',
      `  events(tokenId: ${TOKEN_ID}, from: "${sessionFrom}", to: "${sessionTo}") {`,
      '    timestamp name source durationNs metadata',
      '  }',
      '}',
    ].join('\n');
    const result = await gql(jwt, q);
    dimoNativeEvents = result.data?.events || [];
  } catch (e) {
    console.error('[warn] DIMO events query failed:', e.message);
  }

  try {
    const backendRoot = process.argv.find((a) => a.startsWith('--backend-root='))?.split('=')[1]
      || '/opt/synqdrive/current/backend';
    process.chdir(backendRoot);
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const from = new Date(sessionFrom);
    const to = new Date(sessionTo);
    dbTrips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: VEHICLE_ID,
        OR: [{ startTime: { gte: from, lte: to } }, { endTime: { gte: from, lte: to } }],
      },
      select: { id: true, startTime: true, endTime: true, drivingScore: true, tripStatus: true },
      orderBy: { startTime: 'asc' },
    });
    dbDrivingEvents = await prisma.drivingEvent.findMany({
      where: { vehicleId: VEHICLE_ID, recordedAt: { gte: from, lte: to } },
      select: {
        id: true,
        eventType: true,
        recordedAt: true,
        severity: true,
        providerEventName: true,
      },
      orderBy: { recordedAt: 'asc' },
    });
    dbTripBehaviorEvents = await prisma.tripBehaviorEvent.findMany({
      where: { vehicleId: VEHICLE_ID, startedAt: { gte: from, lte: to } },
      select: {
        id: true,
        eventType: true,
        eventCategory: true,
        startedAt: true,
        endedAt: true,
        classification: true,
        startSpeedKmh: true,
        endSpeedKmh: true,
        tripId: true,
      },
      orderBy: { startedAt: 'asc' },
    });
    if (dbTrips.length > 0) {
      dbImpact = await prisma.tripDrivingImpact.findMany({
        where: { tripId: { in: dbTrips.map((t) => t.id) } },
        select: {
          tripId: true,
          drivingStressScore: true,
          brakingStressScore: true,
          longitudinalStressScore: true,
        },
      });
    }
    await prisma.$disconnect();
  } catch (e) {
    console.error('[warn] DB query failed:', e.message);
  }

  const clockChecks = GT_EVENTS.map((g) => {
    const datePrefix = g.gapStartUtc.slice(0, 10);
    const expectedUtcStart = `${datePrefix}T${g.videoCestStart}:00`.replace(
      `${datePrefix}T06:`,
      `${datePrefix}T04:`,
    );
    const cestHour = parseInt(g.videoCestStart.slice(0, 2), 10);
    const utcHour = parseInt(g.gapStartUtc.slice(11, 13), 10);
    const offsetHours = cestHour - utcHour;
    return {
      gtId: g.id,
      videoCestStart: g.videoCestStart,
      dimoGapStartUtc: g.gapStartUtc,
      offsetHours,
      mappingValid: offsetHours === 2,
    };
  });

  const correlations = GT_EVENTS.map((g) => {
    const reviewObs = observations.filter((o) =>
      inRange(o.providerTimestamp, g.reviewStartUtc, g.reviewEndUtc),
    );
    const interiorObs = observations.filter((o) =>
      inGapInterior(o.providerTimestamp, g.gapStartUtc, g.gapEndUtc),
    );
    const interiorBuckets = speedBuckets.filter((b) =>
      inGapInterior(b.providerTimestamp, g.gapStartUtc, g.gapEndUtc),
    );
    const gapStartBucket = speedBuckets.find((b) => b.providerTimestamp === g.gapStartUtc) || null;
    const gapEndBucket = speedBuckets.find((b) => b.providerTimestamp === g.gapEndUtc) || null;
    const before = speedBuckets.filter((b) => Date.parse(b.providerTimestamp) < Date.parse(g.gapStartUtc)).slice(-3);
    const after = speedBuckets.filter((b) => Date.parse(b.providerTimestamp) > Date.parse(g.gapEndUtc)).slice(0, 3);

    const hfCaptureClass = classifyHfCapture(g, gapStartBucket, gapEndBucket, interiorBuckets);

    const nativeInReview = dimoNativeEvents.filter((e) => inRange(e.timestamp, g.reviewStartUtc, g.reviewEndUtc));
    const nativeInGap = dimoNativeEvents.filter((e) =>
      inRange(e.timestamp, g.gapStartUtc, g.gapEndUtc),
    );

    const tbeInReview = dbTripBehaviorEvents.filter((e) =>
      inRange(e.startedAt.toISOString(), g.reviewStartUtc, g.reviewEndUtc),
    );
    const deInReview = dbDrivingEvents.filter((e) =>
      inRange(e.recordedAt.toISOString(), g.reviewStartUtc, g.reviewEndUtc),
    );

    let downstreamContribution = 'UNKNOWN';
    if (dbTrips.length === 0) {
      downstreamContribution = 'NO_CONTRIBUTION';
    } else if (tbeInReview.length > 0 || deInReview.length > 0) {
      downstreamContribution = tbeInReview.length > 0 ? 'PARTIAL_CONTRIBUTION' : 'PARTIAL_CONTRIBUTION';
    } else {
      downstreamContribution = 'NO_CONTRIBUTION';
    }

    const hfMatrix = matrixLevel(hfCaptureClass);
    const nativeMatrix = nativeLevel(nativeInReview);
    const detectorMatrix = detectorLevel(tbeInReview);
    const scoreMatrix =
      downstreamContribution === 'FULL_CONTRIBUTION'
        ? 'FULL'
        : downstreamContribution === 'PARTIAL_CONTRIBUTION'
          ? 'PARTIAL'
          : downstreamContribution === 'NO_CONTRIBUTION'
            ? 'NONE'
            : 'UNKNOWN';

    return {
      gtId: g.id,
      phase: g.phase,
      gapStartUtc: g.gapStartUtc,
      gapEndUtc: g.gapEndUtc,
      hfHistorical: {
        observationLayer: 'TRUE_T30_SETTLED',
        interiorSampleCount: interiorBuckets.length,
        gapStartBucket,
        gapEndBucket,
        bucketsBefore: before,
        bucketsAfter: after,
        hfCaptureClass,
        coordinatesAvailable: reviewObs.some((o) => o.providerField?.includes('Location')),
      },
      nativeDimoEvents: {
        found: nativeInReview.length > 0,
        countInReview: nativeInReview.length,
        countInGap: nativeInGap.length,
        events: nativeInReview,
      },
      hfDetectorOutput: {
        tripBehaviorEventCount: tbeInReview.length,
        events: tbeInReview,
        noEventReason:
          tbeInReview.length === 0
            ? dbTrips.length === 0
              ? 'reference_capture_session_not_vehicle_trip'
              : interiorBuckets.length === 0
                ? 'gap_prevented_hf_point_pair_calculation'
                : 'threshold_not_reached_or_sparse_samples'
            : null,
      },
      downstream: {
        vehicleTripCount: dbTrips.length,
        drivingEventCount: deInReview.length,
        contribution: downstreamContribution,
        trips: dbTrips,
        impact: dbImpact,
      },
      eventLossMatrix: {
        hfHistorical: hfMatrix,
        nativeEvent: nativeMatrix,
        hfDetector: detectorMatrix,
        scoreLoad: scoreMatrix,
      },
      informationLossSeverity: severityFromMatrix(hfMatrix, nativeMatrix, detectorMatrix, downstreamContribution),
    };
  });

  const cadenceSummary = {};
  for (const phase of ['10s', '20s', '30s', '60s']) {
    const phaseGts = correlations.filter((c) => c.phase === phase);
    const lost = phaseGts.filter((c) => c.hfHistorical.hfCaptureClass === 'NOT_OBSERVED').length;
    const boundary = phaseGts.filter((c) => c.hfHistorical.hfCaptureClass === 'BOUNDARY_ONLY').length;
    const partial = phaseGts.filter((c) => c.hfHistorical.hfCaptureClass === 'PARTIALLY_OBSERVED').length;
    const full = phaseGts.filter((c) => c.hfHistorical.hfCaptureClass === 'FULLY_OBSERVED').length;
    cadenceSummary[phase] = {
      GT_EVENTS_IN_GAPS: phaseGts.length,
      GT_EVENTS_FULLY_PRESERVED: full,
      GT_EVENTS_PARTIALLY_PRESERVED: partial,
      GT_EVENTS_BOUNDARY_ONLY: boundary,
      GT_EVENTS_LOST: lost,
    };
  }

  const summary = {
    SESSION_ID,
    VEHICLE_ID,
    VIDEO_GT_TIMEZONE_MAPPING_VALID: clockChecks.every((c) => c.mappingValid) ? 'YES' : 'NO',
    clockChecks,
    VIDEO_GT_EVENTS_ANALYZED: GT_EVENTS.length,
    correlations,
    cadenceSummary,
    sessionContext: {
      vehicleTripsInWindow: dbTrips.length,
      dimoNativeEventCount: dimoNativeEvents.length,
      dimoNativeEventsSession: dimoNativeEvents,
      tripBehaviorEventCount: dbTripBehaviorEvents.length,
      tripBehaviorEventsSession: dbTripBehaviorEvents,
      drivingEventsSession: dbDrivingEvents,
      referenceCaptureNote:
        'EXP-019 Reference Capture session overlapped VehicleTrip 5c788a26-c9ec-4b57-9abb-71d9cbc257a7; per-window TripBehaviorEvent rows absent.',
    },
    exportedAtUtc: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outDir, 'correlation-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'correlation-by-gt.json'), JSON.stringify(correlations, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
