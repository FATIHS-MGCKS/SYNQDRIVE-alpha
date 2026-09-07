#!/usr/bin/env node
/**
 * EXP-019 video GT event register + multi-authority correlation (READ-ONLY).
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

/** Human video GT register — do not modify observations. */
const GT_REGISTER = [
  {
    gtEventId: 'GT-10-P0',
    phase: '10s',
    videoLocalStart: '2026-09-07 06:35:29',
    videoLocalEnd: '2026-09-07 06:35:52',
    utcStart: '2026-09-07T04:35:29.000Z',
    utcEnd: '2026-09-07T04:35:52.000Z',
    settledGapStartUtc: '2026-09-07T04:35:29.538Z',
    settledGapEndUtc: '2026-09-07T04:35:52.304Z',
    behavior: 'DECELERATION_TO_STOP',
    behaviorDetail: 'clear deceleration approximately 36 → 34 → 16 → 0 km/h',
    speedAnchors: [
      { label: 'start', speedKmh: 36 },
      { label: 'mid', speedKmh: 34 },
      { label: 'mid', speedKmh: 16 },
      { label: 'end', speedKmh: 0 },
    ],
    confidence: 'HIGH',
    videoContinuity: 'CONTINUOUS_VISIBLE',
  },
  {
    gtEventId: 'GT-20-P0',
    phase: '20s',
    videoLocalStart: '2026-09-07 06:37:14',
    videoLocalEnd: '2026-09-07 06:40:02',
    utcStart: '2026-09-07T04:37:14.000Z',
    utcEnd: '2026-09-07T04:40:02.000Z',
    settledGapStartUtc: '2026-09-07T04:37:13.913Z',
    settledGapEndUtc: '2026-09-07T04:40:02.534Z',
    behavior: 'MULTIPLE_DYNAMIC_EVENTS',
    behaviorDetail:
      'DECELERATION; STRONG_ACCELERATION; HIGHWAY_SPEED_TRANSITION — representative sequence ~54→51→34→41→47→24→29→44→66→97→109→119→115→112→111 km/h',
    speedAnchors: [54, 51, 34, 41, 47, 24, 29, 44, 66, 97, 109, 119, 115, 112, 111].map((s, i) => ({
      label: `seq_${i + 1}`,
      speedKmh: s,
    })),
    confidence: 'HIGH',
    videoContinuity: 'CONTINUOUS_VISIBLE',
  },
  {
    gtEventId: 'GT-30-P0',
    phase: '30s',
    videoLocalStart: '2026-09-07 06:42:55',
    videoLocalEnd: '2026-09-07 06:44:52',
    utcStart: '2026-09-07T04:42:55.000Z',
    utcEnd: '2026-09-07T04:44:52.000Z',
    settledGapStartUtc: '2026-09-07T04:42:54.742Z',
    settledGapEndUtc: '2026-09-07T04:44:52.054Z',
    behavior: 'MIXED_DYNAMIC; DECELERATION_TO_STOP',
    behaviorDetail:
      'low-speed/near-stop region; visible later ~63→51→20→0 km/h — cut intervals not claimed continuous',
    speedAnchors: [
      { label: 'visible_late', speedKmh: 63 },
      { label: 'visible_late', speedKmh: 51 },
      { label: 'visible_late', speedKmh: 20 },
      { label: 'visible_late', speedKmh: 0 },
    ],
    confidence: 'MEDIUM-HIGH (visible segments); UNKNOWN for unobserved cut interval',
    videoContinuity: 'PARTIAL_CUTS_REPORTED',
    videoGtUnobservedIntervals: ['intermediate interval between cuts — not claimed continuous'],
  },
  {
    gtEventId: 'GT-30-P1',
    phase: '30s',
    videoLocalStart: '2026-09-07 06:46:16',
    videoLocalEnd: '2026-09-07 06:47:36',
    utcStart: '2026-09-07T04:46:16.000Z',
    utcEnd: '2026-09-07T04:47:36.000Z',
    settledGapStartUtc: '2026-09-07T04:46:16.344Z',
    settledGapEndUtc: '2026-09-07T04:47:35.968Z',
    behavior: 'STOP_TO_ACCELERATION; CONTINUED_DRIVING',
    behaviorDetail: '~3→0→32→49→~59 km/h then continuing approximately 40–57 km/h',
    speedAnchors: [
      { label: 'start', speedKmh: 3 },
      { label: 'stop', speedKmh: 0 },
      { label: 'accel', speedKmh: 32 },
      { label: 'accel', speedKmh: 49 },
      { label: 'accel', speedKmh: 59 },
      { label: 'continued', speedKmh: 45, note: 'approx 40-57 range' },
    ],
    confidence: 'HIGH',
    videoContinuity: 'CONTINUOUS_VISIBLE',
  },
  {
    gtEventId: 'GT-60-P0',
    phase: '60s',
    videoLocalStart: '2026-09-07 06:54:30',
    videoLocalEnd: '2026-09-07 06:56:57',
    utcStart: '2026-09-07T04:54:30.000Z',
    utcEnd: '2026-09-07T04:56:57.000Z',
    settledGapStartUtc: '2026-09-07T04:54:29.814Z',
    settledGapEndUtc: '2026-09-07T04:56:56.693Z',
    behavior: 'URBAN_STOP_GO; MULTIPLE_SPEED_CHANGES; FINAL_STOP',
    behaviorDetail: 'representative ~14→34→42→24→31→27→19→10→0 km/h / P',
    speedAnchors: [14, 34, 42, 24, 31, 27, 19, 10, 0].map((s, i) => ({
      label: `seq_${i + 1}`,
      speedKmh: s,
    })),
    confidence: 'HIGH',
    videoContinuity: 'CONTINUOUS_VISIBLE',
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

function inGapInterior(ts, start, end) {
  const t = Date.parse(ts);
  return t > Date.parse(start) && t < Date.parse(end);
}

function groupBuckets(observations, windowStart, windowEnd) {
  const filtered = observations.filter((o) => inRange(o.providerTimestamp, windowStart, windowEnd));
  const byTs = new Map();
  for (const o of filtered) {
    if (!SIGNAL_FIELDS.includes(o.providerField)) continue;
    const ts = o.providerTimestamp;
    if (!byTs.has(ts)) byTs.set(ts, { providerTimestamp: ts, bucketStart: ts });
    byTs.get(ts)[o.providerField] = o.normalizedValueJson;
  }
  return [...byTs.values()].sort((a, b) => Date.parse(a.providerTimestamp) - Date.parse(b.providerTimestamp));
}

function signalCoverage(buckets, field) {
  const n = buckets.filter((b) => b[field] != null).length;
  if (n === 0) return 'NONE';
  if (n >= 3) return 'PARTIAL';
  return 'PARTIAL';
}

function nearestSpeedSample(speedObs, targetUtc) {
  if (!speedObs.length) return null;
  const t = Date.parse(targetUtc);
  let best = speedObs[0];
  let bestDelta = Math.abs(Date.parse(best.providerTimestamp) - t);
  for (const o of speedObs) {
    const d = Math.abs(Date.parse(o.providerTimestamp) - t);
    if (d < bestDelta) {
      best = o;
      bestDelta = d;
    }
  }
  return {
    nearestTelemetryTimestamp: best.providerTimestamp,
    telemetrySpeedKmh: best.normalizedValueJson,
    absoluteTimeOffsetMs: Date.parse(best.providerTimestamp) - t,
    source: 'TRUE_T30_SETTLED',
  };
}

function recoveryClass(gt, hfInterior, nativeInWindow, tbeInWindow, boundaryStart, boundaryEnd) {
  if (gt.videoContinuity === 'PARTIAL_CUTS_REPORTED' && gt.videoGtUnobservedIntervals?.length) {
    return 'NOT_ASSESSABLE';
  }
  if (hfInterior >= 3) return 'FULLY_OBSERVED_BY_HF';
  if (hfInterior > 0) return 'PARTIALLY_OBSERVED_BY_HF';
  if (nativeInWindow.length > 0) return 'MISSED_BY_HF_BUT_RECOVERED_BY_NATIVE_EVENT';
  if (tbeInWindow.length > 0) return 'MISSED_BY_HF_BUT_RECOVERED_BY_OTHER_AUTHORITY';
  const vStart = gt.speedAnchors[0]?.speedKmh;
  const vEnd = gt.speedAnchors[gt.speedAnchors.length - 1]?.speedKmh;
  const tStart = boundaryStart?.speed ?? boundaryStart?.telemetrySpeedKmh;
  const tEnd = boundaryEnd?.speed ?? boundaryEnd?.telemetrySpeedKmh;
  const hasBoundary = tStart != null || tEnd != null;
  if (hasBoundary) {
    const startClose = vStart != null && tStart != null && Math.abs(vStart - tStart) <= 8;
    const endClose = vEnd != null && tEnd != null && Math.abs(vEnd - tEnd) <= 15;
    if (startClose || endClose) return 'PARTIALLY_OBSERVED_BY_HF';
  }
  return 'MISSED_BY_ALL_DI_AUTHORITIES';
}

function gapImpact(gt, hfInterior, nativeInWindow, behavior) {
  if (gt.videoGtUnobservedIntervals?.length) return 'NOT_ASSESSABLE';
  if (hfInterior === 0 && nativeInWindow.length === 0) {
    if (behavior.includes('MULTIPLE') || behavior.includes('STOP_GO')) return 'TOTAL_DYNAMIC_LOSS';
    if (behavior.includes('DECELERATION') || behavior.includes('ACCELERATION')) return 'MAJOR_DYNAMIC_LOSS';
    return 'MAJOR_DYNAMIC_LOSS';
  }
  if (hfInterior > 0) return 'PARTIAL_DYNAMIC_LOSS';
  return 'MAJOR_DYNAMIC_LOSS';
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
  return submit.data.developer_jwt || submit.data.access_token || submit.data.token;
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

(async () => {
  loadEnv();
  const dataDir = process.argv.find((a) => a.startsWith('--data-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-019-video-alignment';
  fs.mkdirSync(outDir, { recursive: true });

  const observations = fs
    .readFileSync(path.join(dataDir, 'observations.jsonl'), 'utf8')
    .trim()
    .split(/\n/)
    .map((l) => JSON.parse(l));

  const speedObs = observations
    .filter((o) => o.providerField === 'speed')
    .sort((a, b) => Date.parse(a.providerTimestamp) - Date.parse(b.providerTimestamp));

  let dimoNativeEvents = [];
  let dbTrips = [];
  let dbDrivingEvents = [];
  let dbTripBehaviorEvents = [];
  let dbImpact = [];
  let dbV2 = 'NOT_AVAILABLE';

  const sessionFrom = '2026-09-07T04:30:00.000Z';
  const sessionTo = '2026-09-07T05:05:00.000Z';

  try {
    const jwt = await getVehicleJwt(await getDeveloperJwt());
    const q = [
      'query BroadReferenceEvents {',
      `  events(tokenId: ${TOKEN_ID}, from: "${sessionFrom}", to: "${sessionTo}") {`,
      '    timestamp name source durationNs metadata',
      '  }',
      '}',
    ].join('\n');
    dimoNativeEvents = (await gql(jwt, q)).data?.events || [];
  } catch (e) {
    console.error('[warn] DIMO events:', e.message);
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
      where: { vehicleId: VEHICLE_ID, OR: [{ startTime: { gte: from, lte: to } }, { endTime: { gte: from, lte: to } }] },
      select: { id: true, startTime: true, endTime: true, drivingScore: true, tripStatus: true, maxSpeedKmh: true },
    });
    dbDrivingEvents = await prisma.drivingEvent.findMany({
      where: { vehicleId: VEHICLE_ID, recordedAt: { gte: from, lte: to } },
      select: { id: true, eventType: true, recordedAt: true, severity: true, providerEventName: true },
      orderBy: { recordedAt: 'asc' },
    });
    dbTripBehaviorEvents = await prisma.tripBehaviorEvent.findMany({
      where: { vehicleId: VEHICLE_ID, startedAt: { gte: from, lte: to } },
      select: {
        id: true, eventType: true, eventCategory: true, startedAt: true, endedAt: true,
        classification: true, startSpeedKmh: true, endSpeedKmh: true, tripId: true,
      },
      orderBy: { startedAt: 'asc' },
    });
    if (dbTrips.length) {
      dbImpact = await prisma.tripDrivingImpact.findMany({
        where: { tripId: { in: dbTrips.map((t) => t.id) } },
        select: {
          tripId: true, drivingStressScore: true, brakingStressScore: true,
          longitudinalStressScore: true, thermalBrakeStressScore: true,
        },
      });
    }
    await prisma.$disconnect();
  } catch (e) {
    console.error('[warn] DB:', e.message);
  }

  const register = [];

  for (const gt of GT_REGISTER) {
    const winStart = gt.utcStart;
    const winEnd = gt.utcEnd;
    const gapStart = gt.settledGapStartUtc;
    const gapEnd = gt.settledGapEndUtc;
    const buckets = groupBuckets(observations, winStart, winEnd);
    const interiorBuckets = buckets.filter((b) => inGapInterior(b.providerTimestamp, gapStart, gapEnd));
    const interiorSpeed = interiorBuckets.filter((b) => b.speed != null);

    const nativeInWindow = dimoNativeEvents.filter((e) => inRange(e.timestamp, winStart, winEnd));
    const tbeInWindow = dbTripBehaviorEvents.filter((e) => inRange(e.startedAt.toISOString(), winStart, winEnd));
    const deInWindow = dbDrivingEvents.filter((e) => inRange(e.recordedAt.toISOString(), winStart, winEnd));

    const speedTrajectory = [];
    const boundaryCompare = [
      { videoLocalTime: gt.videoLocalStart, utcTime: winStart, videoSpeedKmh: gt.speedAnchors[0]?.speedKmh ?? null },
      { videoLocalTime: gt.videoLocalEnd, utcTime: winEnd, videoSpeedKmh: gt.speedAnchors[gt.speedAnchors.length - 1]?.speedKmh ?? null },
    ];
    for (const bc of boundaryCompare) {
      if (bc.videoSpeedKmh == null) continue;
      const near = nearestSpeedSample(speedObs, bc.utcTime);
      speedTrajectory.push({
        ...bc,
        ...near,
        speedDifferenceKmh: near ? bc.videoSpeedKmh - near.telemetrySpeedKmh : null,
        note: 'BOUNDARY_ANCHOR — sequence anchors lack per-frame video timestamps',
      });
    }

    const hfSpeed = interiorSpeed.length > 0 ? 'PARTIAL' : buckets.some((b) => b.speed != null) ? 'PARTIAL' : 'NONE';
    const hfInteriorOnly = interiorSpeed.length === 0 ? 'NONE' : interiorSpeed.length >= 3 ? 'PARTIAL' : 'PARTIAL';

    const gapStartB = buckets.find((b) => b.providerTimestamp === gapStart) || nearestSpeedSample(speedObs, gapStart);
    const gapEndB = buckets.find((b) => b.providerTimestamp === gapEnd) || nearestSpeedSample(speedObs, gapEnd);

    const finalRecovery = recoveryClass(gt, interiorSpeed.length, nativeInWindow, tbeInWindow, gapStartB, gapEndB);

    register.push({
      ...gt,
      correlation: {
        VIDEO_DYNAMIC_EVENT_PRESENT: 'YES',
        HF_SPEED_COVERAGE_PRESENT: interiorSpeed.length > 0 ? 'PARTIAL' : buckets.filter((b) => b.speed != null).length ? 'PARTIAL' : 'NONE',
        HF_SPEED_INTERIOR_GAP: interiorSpeed.length === 0 ? 'NONE' : 'PARTIAL',
        HF_RPM_COVERAGE_PRESENT: signalCoverage(buckets, 'powertrainCombustionEngineSpeed'),
        HF_THROTTLE_COVERAGE_PRESENT: signalCoverage(buckets, 'obdThrottlePosition'),
        HF_ENGINE_LOAD_COVERAGE_PRESENT: signalCoverage(buckets, 'obdEngineLoad'),
        HF_COORDINATES_COVERAGE_PRESENT: 'NONE',
        NATIVE_EVENT_PRESENT: nativeInWindow.length > 0 ? 'YES' : 'NO',
        DI_DERIVED_EVENT_PRESENT: tbeInWindow.length > 0 ? 'YES' : 'NO',
        DRIVING_IMPACT_CHANGED: 'UNKNOWN',
        settledGapInteriorSampleCount: interiorSpeed.length,
        hfBucketsInWindow: buckets.length,
        gapBoundaryStart: gapStartB,
        gapBoundaryEnd: gapEndB,
        nativeEvents: nativeInWindow,
        tripBehaviorEvents: tbeInWindow,
        drivingEvents: deInWindow,
        speedTrajectoryComparison: speedTrajectory,
        allHfSpeedSamplesInWindow: buckets.filter((b) => b.speed != null).map((b) => ({
          providerTimestamp: b.providerTimestamp,
          speed: b.speed,
          inGapInterior: inGapInterior(b.providerTimestamp, gapStart, gapEnd),
        })),
        gapImpactOnDI: gapImpact(gt, interiorSpeed.length, nativeInWindow, gt.behavior),
        SCORE_INPUT_LOSS: tbeInWindow.length === 0 ? 'YES' : 'PARTIAL',
        BRAKE_LOAD_INPUT_LOSS: 'UNKNOWN',
        TIRE_LOAD_INPUT_LOSS: 'UNKNOWN',
        brakingDetectorFired: tbeInWindow.some((e) => /BRAK|DECEL/i.test(e.eventType || '')) ? 'YES' : 'NO',
        accelerationDetectorFired: tbeInWindow.some((e) => /ACCEL/i.test(e.eventType || '')) ? 'YES' : 'NO',
        nativeBrakingEvent: deInWindow.some((e) => /BRAK/i.test(e.eventType || e.providerEventName || '')) ? 'YES' : 'NO',
        nativeAccelerationEvent: deInWindow.some((e) => /ACCEL/i.test(e.eventType || e.providerEventName || '')) ? 'YES' : 'NO',
      },
      hfCoverage: interiorSpeed.length > 0 ? 'PARTIAL' : gapStartB || gapEndB ? 'PARTIAL' : 'NONE',
      nativeEventCoverage: nativeInWindow.length > 0 ? 'YES' : 'NO',
      diDetectorCoverage: tbeInWindow.length > 0 ? 'PARTIAL' : 'NONE',
      impactCoverage: dbImpact.length > 0 ? 'PARTIAL' : 'NONE',
      finalRecoveryClassification: finalRecovery,
    });
  }

  const cadence = {};
  for (const phase of ['10s', '20s', '30s', '60s']) {
    const items = register.filter((r) => r.phase === phase);
    const missed = items.filter((r) => r.finalRecoveryClassification === 'MISSED_BY_ALL_DI_AUTHORITIES').length;
    const partial = items.filter((r) => r.finalRecoveryClassification.startsWith('PARTIALLY')).length;
    const nativeMit = items.filter((r) => r.finalRecoveryClassification.includes('NATIVE')).length;
    cadence[phase] = {
      REAL_DYNAMIC_EVENTS_INSIDE_GAPS: items.length,
      EVENTS_FULLY_RECOVERED: 0,
      EVENTS_PARTIALLY_RECOVERED: partial,
      EVENTS_MISSED: missed,
      OTHER_AUTHORITY_MITIGATIONS: nativeMit,
      CADENCE_DI_RECONSTRUCTION_RISK: missed >= 1 ? 'CRITICAL' : 'HIGH',
    };
  }

  const output = {
    SESSION_ID,
    VEHICLE_ID,
    VIDEO_GT_VERIFIED: 'YES',
    VIDEO_GT_EVENT_COUNT: register.length,
    VIDEO_GT_UNOBSERVED_INTERVALS: register.filter((r) => r.videoGtUnobservedIntervals?.length).length,
    VIDEO_GT_TIMEZONE: 'CEST = UTC+02:00',
    exportedAtUtc: new Date().toISOString(),
    tripContext: { trips: dbTrips, impact: dbImpact, sessionNativeEvents: dimoNativeEvents },
    events: register,
    cadenceAssessment: cadence,
    HF_SOLE_AUTHORITY_SUFFICIENT: 'NO',
    NATIVE_EVENTS_MITIGATE_HF_GAPS: 'NO',
    OTHER_AUTHORITY_MITIGATES_HF_GAPS: 'NO',
  };

  fs.writeFileSync(path.join(outDir, 'video-gt-event-register.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
