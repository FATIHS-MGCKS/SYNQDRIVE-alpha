#!/usr/bin/env node
/**
 * EXP-020 — HF retrospective window geometry + post-trip reconstruction matrix (READ-ONLY).
 * Tests settled retrieval geometry (A1) — NOT settlement-timing counterfactual (A2).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Wallet } = require('ethers');

const TOKEN_ID = 187336;
const SESSION_ID = '2508b697-f101-4155-a0d3-8436e46bb779';
const INTERVAL = '1s';
const FIELDS = ['speed', 'powertrainCombustionEngineSpeed', 'obdThrottlePosition', 'obdEngineLoad', 'powertrainCombustionEngineTPS'];
const QUERY_DELAY_MS = 350;

/** VehicleTrip bounds (EXP-019 canonical). */
const TRIP_START = '2026-09-07T04:35:00.000Z';
const TRIP_END = '2026-09-07T04:57:29.000Z';
const SESSION_START = '2026-09-07T04:31:36.025Z';
const SESSION_END = '2026-09-07T05:00:20.016Z';

const GT_GAPS = [
  { id: 'GT-10-P0', phase: '10s', start: '2026-09-07T04:35:29.538Z', end: '2026-09-07T04:35:52.304Z' },
  { id: 'GT-20-P0', phase: '20s', start: '2026-09-07T04:37:13.913Z', end: '2026-09-07T04:40:02.534Z' },
  { id: 'GT-30-P0', phase: '30s', start: '2026-09-07T04:42:54.742Z', end: '2026-09-07T04:44:52.054Z' },
  { id: 'GT-30-P1', phase: '30s', start: '2026-09-07T04:46:16.344Z', end: '2026-09-07T04:47:35.968Z' },
  { id: 'GT-60-P0', phase: '60s', start: '2026-09-07T04:54:29.814Z', end: '2026-09-07T04:56:56.693Z' },
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

function parseTs(ts) {
  return Date.parse(ts);
}

function canonicalTs(ts) {
  return new Date(parseTs(ts)).toISOString();
}

function bucketKey(field, ts) {
  return `${field}|${canonicalTs(ts)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pctl(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

function gapStats(timestamps, rangeStart, rangeEnd) {
  const ts = timestamps
    .map((t) => parseTs(t))
    .filter((t) => t >= parseTs(rangeStart) && t <= parseTs(rangeEnd))
    .sort((a, b) => a - b);
  if (ts.length < 2) {
    return { count: ts.length, medianDt: null, p90: null, p95: null, maxGap: null, ge10: 0, ge20: 0, ge60: 0 };
  }
  const dts = [];
  const gaps = [];
  for (let i = 1; i < ts.length; i++) {
    const g = ts[i] - ts[i - 1];
    dts.push(g);
    gaps.push(g);
  }
  const dur = ts[ts.length - 1] - ts[0];
  const ge10 = gaps.filter((g) => g >= 10000).reduce((s, g) => s + g, 0) / (dur || 1);
  const ge20 = gaps.filter((g) => g >= 20000).reduce((s, g) => s + g, 0) / (dur || 1);
  const ge60 = gaps.filter((g) => g >= 60000).reduce((s, g) => s + g, 0) / (dur || 1);
  return {
    count: ts.length,
    medianDt: median(dts),
    p90: pctl(dts, 0.9),
    p95: pctl(dts, 0.95),
    maxGap: Math.max(...gaps),
    ge10,
    ge20,
    ge60,
  };
}

function inGapInterior(ts, gapStart, gapEnd) {
  const t = parseTs(ts);
  return t > parseTs(gapStart) && t < parseTs(gapEnd);
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
  const { state, challenge: msg } = challenge.data;
  const wallet = new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({ client_id: CLIENT_ID, domain: DOMAIN, grant_type: 'authorization_code', state, signature }).toString(),
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

function buildSpeedQuery(tokenId, from, to) {
  return `
    query Exp020SpeedWindow {
      signals(tokenId: ${tokenId}, from: "${from}", to: "${to}", interval: "${INTERVAL}") {
        timestamp
        speed(agg: AVG)
      }
    }
  `.trim();
}

function extractSpeedBuckets(signals) {
  const buckets = new Map();
  const timestamps = [];
  for (const s of signals || []) {
    if (!s?.timestamp) continue;
    const key = bucketKey('speed', s.timestamp);
    if (!buckets.has(key)) {
      buckets.set(key, { timestamp: canonicalTs(s.timestamp), speed: s.speed });
      timestamps.push(s.timestamp);
    }
  }
  return { buckets, timestamps };
}

async function queryWindow(jwt, fromIso, toIso) {
  const started = Date.now();
  try {
    const result = await gql(jwt, buildSpeedQuery(TOKEN_ID, fromIso, toIso));
    const signals = result?.data?.signals ?? [];
    const errors = result?.errors;
    const durationMs = Date.now() - started;
    const { buckets, timestamps } = extractSpeedBuckets(signals);
    return {
      status: errors?.length ? 'ERROR' : signals.length === 0 ? 'ZERO_RESULT' : 'SUCCESS',
      error: errors?.[0]?.message || null,
      rawRows: signals.length,
      uniqueBuckets: buckets.size,
      buckets,
      timestamps,
      durationMs,
      windowMs: parseTs(toIso) - parseTs(fromIso),
    };
  } catch (err) {
    return {
      status: 'ERROR',
      error: err.message,
      rawRows: 0,
      uniqueBuckets: 0,
      buckets: new Map(),
      timestamps: [],
      durationMs: Date.now() - started,
      windowMs: parseTs(toIso) - parseTs(fromIso),
    };
  }
}

function mergeBuckets(target, source) {
  let newCount = 0;
  let dupCount = 0;
  for (const [k, v] of source) {
    if (target.has(k)) dupCount++;
    else {
      target.set(k, v);
      newCount++;
    }
  }
  return { newCount, dupCount };
}

function buildNonOverlapWindows(startIso, endIso, windowMs) {
  const windows = [];
  let cur = parseTs(startIso);
  const end = parseTs(endIso);
  while (cur < end) {
    const next = Math.min(cur + windowMs, end);
    windows.push([new Date(cur).toISOString(), new Date(next).toISOString()]);
    cur = next;
  }
  return windows;
}

function buildOverlapWindows(startIso, endIso, windowMs, stepMs) {
  const windows = [];
  let cur = parseTs(startIso);
  const end = parseTs(endIso);
  while (cur + windowMs <= end) {
    windows.push([new Date(cur).toISOString(), new Date(cur + windowMs).toISOString()]);
    cur += stepMs;
  }
  return windows;
}

function loadObservationsReference(obsPath) {
  const buckets = new Map();
  const fingerprints = new Set();
  const lines = fs.readFileSync(obsPath, 'utf8').trim().split(/\n/);
  for (const line of lines) {
    const o = JSON.parse(line);
    if (o.providerField !== 'speed') continue;
    const key = bucketKey('speed', o.providerTimestamp);
    buckets.set(key, { timestamp: canonicalTs(o.providerTimestamp), speed: o.normalizedValueJson });
    if (o.physicalSampleFingerprint) fingerprints.add(o.physicalSampleFingerprint);
    if (o.provenanceJson?.aggregateBucketIdentity) fingerprints.add(o.provenanceJson.aggregateBucketIdentity);
  }
  return { buckets, fingerprints, observationCount: lines.length };
}

function computeFirstObservationAge(obsPath) {
  const firstSeen = new Map();
  const lines = fs.readFileSync(obsPath, 'utf8').trim().split(/\n/);
  for (const line of lines) {
    const o = JSON.parse(line);
    const fp = o.physicalSampleFingerprint || o.provenanceJson?.aggregateBucketIdentity;
    if (!fp || !o.requestStartedAt || !o.providerTimestamp) continue;
    const age = parseTs(o.requestStartedAt) - parseTs(o.providerTimestamp);
    if (!firstSeen.has(fp) || age < firstSeen.get(fp).ageMs) {
      firstSeen.set(fp, { ageMs: age, providerTimestamp: o.providerTimestamp, requestStartedAt: o.requestStartedAt });
    }
  }
  const ages = [...firstSeen.values()].map((v) => v.ageMs).filter((a) => a >= 0);
  return {
    available: ages.length > 0,
    count: ages.length,
    p50: median(ages),
    p75: pctl(ages, 0.75),
    p90: pctl(ages, 0.9),
    p95: pctl(ages, 0.95),
    p99: pctl(ages, 0.99),
    max: ages.length ? Math.max(...ages) : null,
  };
}

function completenessRatio(strategyBuckets, referenceBuckets) {
  if (!referenceBuckets.size) return null;
  let matched = 0;
  for (const k of referenceBuckets.keys()) {
    if (strategyBuckets.has(k)) matched++;
  }
  return matched / referenceBuckets.size;
}

function countInteriorBuckets(buckets, gapStart, gapEnd) {
  let n = 0;
  for (const [, v] of buckets) {
    if (inGapInterior(v.timestamp, gapStart, gapEnd)) n++;
  }
  return n;
}

(async () => {
  loadEnv();
  const settlementDir = process.argv.find((a) => a.startsWith('--settlement-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const alignDir = process.argv.find((a) => a.startsWith('--align-dir='))?.split('=')[1] || '/tmp/exp-019-video-alignment';
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-020';
  fs.mkdirSync(outDir, { recursive: true });

  const phaseBounds = JSON.parse(fs.readFileSync(path.join(alignDir, 'phase-boundaries.json'), 'utf8'));
  const obsRef = loadObservationsReference(path.join(settlementDir, 'observations.jsonl'));
  const firstObsAge = computeFirstObservationAge(path.join(settlementDir, 'observations.jsonl'));
  const provenance = JSON.parse(fs.readFileSync(path.join(settlementDir, 'provenance-ring.json'), 'utf8'));

  const implementationAudit = {
    queryStructure: 'GraphQL signals(tokenId, from, to, interval)',
    interval: '1s (fixed for all EXP-020 queries)',
    aggregation: 'AVG per field (speed)',
    pagination: 'NONE in client or query — single response array',
    HF_QUERY_PAGINATION_PRESENT: 'NO',
    HF_QUERY_RESULT_CAP_PRESENT: 'UNKNOWN',
    HF_QUERY_WINDOW_MAX_DURATION: 'NONE in SynqDrive client — provider may truncate/time out on very large windows',
    HF_QUERY_WINDOW_SIZE_ALTERS_AGGREGATION: 'NO',
    productionPostTrip: {
      service: 'trip-behavior-enrichment.service.ts → DimoSegmentsService.fetchHighFrequency',
      queryWindow: 'whole trip startTime → endTime (single request)',
      interval: '1s',
      chunking: 'NONE',
      overlap: 'NONE',
      settlementDelay: 'NONE (query at enrichment time, post-trip)',
      delayedRetry: 'NONE',
      CURRENT_PROD_POST_TRIP_QUERY_STRATEGY: 'SINGLE_WHOLE_TRIP_1S',
      CURRENT_PROD_QUERY_WINDOW_GEOMETRY: `ONE_REQUEST [trip.startTime, trip.endTime] — e.g. EXP-019 trip ${TRIP_START} → ${TRIP_END}`,
      CURRENT_PROD_POST_TRIP_SETTLEMENT_DELAY: 'IMPLICIT_NOW_AT_ENRICHMENT — no explicit delay parameter',
    },
    referenceCaptureLive: {
      windowBuilder: 'buildHfQueryWindow (HF Recovery V2)',
      queryTo: 'requestStartedAt - settlementDelayMs (8000ms default)',
      overlap: 'recoveryOverlapMs (6000ms)',
      typicalWindow: 'incremental from watermark — often << poll interval during block polling',
      note: 'EXP-019 live queries used small incremental windows, not whole-trip',
    },
  };

  console.log('Authenticating DIMO...');
  const devJwt = await getDeveloperJwt();
  const vehJwt = await getVehicleJwt(devJwt);

  // Build settled reference union: observations + full-trip + full-session queries
  const referenceBuckets = new Map(obsRef.buckets);
  console.log('Building EXP020_SETTLED_REFERENCE_UNION...');
  const fullTrip = await queryWindow(vehJwt, TRIP_START, TRIP_END);
  await sleep(QUERY_DELAY_MS);
  const fullSession = await queryWindow(vehJwt, SESSION_START, SESSION_END);
  await sleep(QUERY_DELAY_MS);

  const refTripMerge = mergeBuckets(referenceBuckets, fullTrip.buckets);
  const refSessionMerge = mergeBuckets(referenceBuckets, fullSession.buckets);

  const settledReference = {
    REFERENCE_AUTHORITY: 'EXP020_SETTLED_REFERENCE_UNION',
    sources: ['TRUE_T30_observations.jsonl', 'FULL_TRIP_SETTLED_QUERY', 'FULL_SESSION_SETTLED_QUERY'],
    REFERENCE_UNIQUE_BUCKET_COUNT: referenceBuckets.size,
    REFERENCE_TEMPORAL_START_COUNT: referenceBuckets.size,
    observationSpeedBuckets: obsRef.buckets.size,
    fullTripBuckets: fullTrip.uniqueBuckets,
    fullSessionBuckets: fullSession.uniqueBuckets,
    newFromFullTrip: refTripMerge.newCount,
    newFromFullSession: refSessionMerge.newCount,
  };

  // Non-overlap matrix (session bounds — canonical drive window)
  const matrixStrategies = [
    { id: 'W060', windowMs: 60000 },
    { id: 'W120', windowMs: 120000 },
    { id: 'W180', windowMs: 180000 },
    { id: 'W240', windowMs: 240000 },
    { id: 'W300', windowMs: 300000 },
  ];

  const queryMatrix = [];
  const jwt = vehJwt;

  for (const strat of matrixStrategies) {
    const windows = buildNonOverlapWindows(SESSION_START, SESSION_END, strat.windowMs);
    const union = new Map();
    let success = 0,
      zero = 0,
      err = 0,
      raw = 0,
      dups = 0;
    for (const [from, to] of windows) {
      const res = await queryWindow(jwt, from, to);
      await sleep(QUERY_DELAY_MS);
      if (res.status === 'SUCCESS') success++;
      else if (res.status === 'ZERO_RESULT') zero++;
      else err++;
      raw += res.rawRows;
      const m = mergeBuckets(union, res.buckets);
      dups += m.dupCount;
    }
    const ts = [...union.values()].map((b) => b.timestamp);
    const gs = gapStats(ts, SESSION_START, SESSION_END);
    queryMatrix.push({
      strategy: strat.id,
      mode: 'NON_OVERLAP',
      requestCount: windows.length,
      successCount: success,
      zeroResultCount: zero,
      errorCount: err,
      rawReturnedRows: raw,
      uniqueBucketIdentities: union.size,
      uniqueTemporalStarts: union.size,
      duplicateIdentities: dups,
      revisionIdentities: 0,
      medianTemporalDtMs: gs.medianDt,
      p90TemporalDtMs: gs.p90,
      p95TemporalDtMs: gs.p95,
      maxGapMs: gs.maxGap,
      completenessVsReference: completenessRatio(union, referenceBuckets),
      ge10GapFraction: gs.ge10,
      ge20GapFraction: gs.ge20,
      ge60GapFraction: gs.ge60,
    });
  }

  // FULL_PHASE
  for (const phase of ['10s', '20s', '30s', '60s']) {
    const p = phaseBounds.phases[phase];
    const res = await queryWindow(jwt, p.phaseStartedAt, p.phaseEndedAt);
    await sleep(QUERY_DELAY_MS);
    const gs = gapStats(res.timestamps, p.phaseStartedAt, p.phaseEndedAt);
    queryMatrix.push({
      strategy: `FULL_PHASE_${phase}`,
      mode: 'FULL_PHASE',
      requestCount: 1,
      successCount: res.status === 'SUCCESS' ? 1 : 0,
      zeroResultCount: res.status === 'ZERO_RESULT' ? 1 : 0,
      errorCount: res.status === 'ERROR' ? 1 : 0,
      rawReturnedRows: res.rawRows,
      uniqueBucketIdentities: res.uniqueBuckets,
      uniqueTemporalStarts: res.uniqueBuckets,
      duplicateIdentities: 0,
      medianTemporalDtMs: gs.medianDt,
      p90TemporalDtMs: gs.p90,
      maxGapMs: gs.maxGap,
      completenessVsReference: completenessRatio(res.buckets, referenceBuckets),
      ge10GapFraction: gs.ge10,
      ge20GapFraction: gs.ge20,
      ge60GapFraction: gs.ge60,
    });
  }

  queryMatrix.push({
    strategy: 'FULL_TRIP',
    mode: 'FULL_TRIP',
    requestCount: 1,
    ...fullTrip,
    uniqueBucketIdentities: fullTrip.uniqueBuckets,
    uniqueTemporalStarts: fullTrip.uniqueBuckets,
    completenessVsReference: completenessRatio(fullTrip.buckets, referenceBuckets),
    ge10GapFraction: gapStats(fullTrip.timestamps, TRIP_START, TRIP_END).ge10,
    ge20GapFraction: gapStats(fullTrip.timestamps, TRIP_START, TRIP_END).ge20,
    ge60GapFraction: gapStats(fullTrip.timestamps, TRIP_START, TRIP_END).ge60,
  });

  queryMatrix.push({
    strategy: 'FULL_SESSION',
    mode: 'FULL_SESSION',
    requestCount: 1,
    ...fullSession,
    uniqueBucketIdentities: fullSession.uniqueBuckets,
    uniqueTemporalStarts: fullSession.uniqueBuckets,
    completenessVsReference: completenessRatio(fullSession.buckets, referenceBuckets),
  });

  // Overlap matrix
  const overlapConfigs = [
    { id: 'W060_O30', windowMs: 60000, stepMs: 30000 },
    { id: 'W120_O60', windowMs: 120000, stepMs: 60000 },
    { id: 'W180_O60', windowMs: 180000, stepMs: 60000 },
    { id: 'W300_O60', windowMs: 300000, stepMs: 60000 },
    { id: 'W300_O120', windowMs: 300000, stepMs: 120000 },
    { id: 'Q120_L300', windowMs: 300000, stepMs: 120000, label: 'every_120s_lookback_300s' },
  ];

  const overlapMatrix = [];
  for (const cfg of overlapConfigs) {
    const windows = buildOverlapWindows(SESSION_START, SESSION_END, cfg.windowMs, cfg.stepMs);
    const union = new Map();
    let success = 0,
      zero = 0,
      raw = 0,
      dups = 0;
    for (const [from, to] of windows) {
      const res = await queryWindow(jwt, from, to);
      await sleep(QUERY_DELAY_MS);
      if (res.status === 'SUCCESS') success++;
      else if (res.status === 'ZERO_RESULT') zero++;
      raw += res.rawRows;
      const m = mergeBuckets(union, res.buckets);
      dups += m.dupCount;
    }
    overlapMatrix.push({
      strategy: cfg.id,
      label: cfg.label || cfg.id,
      requestCount: windows.length,
      successCount: success,
      zeroResultCount: zero,
      rawReturnedRows: raw,
      uniqueBucketIdentities: union.size,
      duplicateBurden: dups,
      completenessVsReference: completenessRatio(union, referenceBuckets),
    });
  }

  // Gap expansion test
  const gapExpansion = [];
  const contextLabels = [
    { label: 'EXACT_GAP_ONLY', padMs: 0, exact: true },
    { label: 'GAP_PLUS_MINUS_30S', padMs: 30000 },
    { label: 'GAP_PLUS_MINUS_60S', padMs: 60000 },
    { label: 'GAP_PLUS_MINUS_120S', padMs: 120000 },
    { label: 'GAP_PLUS_MINUS_300S', padMs: 300000 },
  ];

  for (const gap of GT_GAPS) {
    const phase = phaseBounds.phases[gap.phase];
    const gapRow = { gapId: gap.id, contexts: {} };
    for (const ctx of contextLabels) {
      let from, to;
      if (ctx.exact) {
        from = gap.start;
        to = gap.end;
      } else {
        from = new Date(parseTs(gap.start) - ctx.padMs).toISOString();
        to = new Date(parseTs(gap.end) + ctx.padMs).toISOString();
      }
      const res = await queryWindow(jwt, from, to);
      await sleep(QUERY_DELAY_MS);
      const interior = countInteriorBuckets(res.buckets, gap.start, gap.end);
      gapRow.contexts[ctx.label] = {
        queryFrom: from,
        queryTo: to,
        status: res.status,
        uniqueBuckets: res.uniqueBuckets,
        interiorBuckets: interior,
      };
    }
    // FULL_PHASE for this gap's phase
    const fp = await queryWindow(jwt, phase.phaseStartedAt, phase.phaseEndedAt);
    await sleep(QUERY_DELAY_MS);
    gapRow.contexts.FULL_PHASE = {
      queryFrom: phase.phaseStartedAt,
      queryTo: phase.phaseEndedAt,
      status: fp.status,
      uniqueBuckets: fp.uniqueBuckets,
      interiorBuckets: countInteriorBuckets(fp.buckets, gap.start, gap.end),
    };
    gapRow.NARROW_BUCKETS_INSIDE_GAP = gapRow.contexts.EXACT_GAP_ONLY?.interiorBuckets ?? 0;
    gapRow.WIDE_BUCKETS_INSIDE_GAP = gapRow.contexts.GAP_PLUS_MINUS_300S?.interiorBuckets ?? 0;
    gapRow.NEW_INTERIOR_BUCKETS_FROM_WINDOW_EXPANSION =
      gapRow.WIDE_BUCKETS_INSIDE_GAP - gapRow.NARROW_BUCKETS_INSIDE_GAP;
    gapExpansion.push(gapRow);
  }

  // Post-trip strategies (trip bounds)
  const tripMs = parseTs(TRIP_END) - parseTs(TRIP_START);
  const postTrip = [];

  // P1 whole trip
  postTrip.push({
    id: 'P1',
    description: 'whole trip single query',
    requestCount: 1,
    uniqueBuckets: fullTrip.uniqueBuckets,
    completenessVsReference: completenessRatio(fullTrip.buckets, referenceBuckets),
    ge10GapFraction: gapStats(fullTrip.timestamps, TRIP_START, TRIP_END).ge10,
    maxGapMs: gapStats(fullTrip.timestamps, TRIP_START, TRIP_END).maxGap,
  });

  const chunkStrategies = [
    { id: 'P2', chunkMs: 300000, overlapMs: 0 },
    { id: 'P3', chunkMs: 300000, overlapMs: 60000 },
    { id: 'P4', chunkMs: 180000, overlapMs: 60000 },
    { id: 'P5', chunkMs: 120000, overlapMs: 60000 },
  ];

  for (const cs of chunkStrategies) {
    const step = cs.chunkMs - cs.overlapMs;
    const windows = [];
    let cur = parseTs(TRIP_START);
    const end = parseTs(TRIP_END);
    while (cur < end) {
      const next = Math.min(cur + cs.chunkMs, end);
      windows.push([new Date(cur).toISOString(), new Date(next).toISOString()]);
      if (next >= end) break;
      cur += step;
    }
    const union = new Map();
    let success = 0,
      dups = 0;
    for (const [from, to] of windows) {
      const res = await queryWindow(jwt, from, to);
      await sleep(QUERY_DELAY_MS);
      if (res.status === 'SUCCESS') success++;
      const m = mergeBuckets(union, res.buckets);
      dups += m.dupCount;
    }
    const ts = [...union.values()].map((b) => b.timestamp);
    const gs = gapStats(ts, TRIP_START, TRIP_END);
    postTrip.push({
      id: cs.id,
      description: `${cs.chunkMs / 60000}min chunks overlap ${cs.overlapMs / 1000}s`,
      requestCount: windows.length,
      successCount: success,
      uniqueBuckets: union.size,
      duplicateBurden: dups,
      completenessVsReference: completenessRatio(union, referenceBuckets),
      ge10GapFraction: gs.ge10,
      ge20GapFraction: gs.ge20,
      ge60GapFraction: gs.ge60,
      maxGapMs: gs.maxGap,
      requestsPer30MinTrip: (windows.length / (tripMs / 60000)) * 30,
    });
  }

  // Rolling simulation (settled geometry only)
  const rolling = [
    { id: 'R1', stepMs: 60000, lookbackMs: 120000 },
    { id: 'R2', stepMs: 120000, lookbackMs: 180000 },
    { id: 'R3', stepMs: 120000, lookbackMs: 300000 },
    { id: 'R4', stepMs: 180000, lookbackMs: 300000 },
    { id: 'R5', stepMs: 300000, lookbackMs: 300000 },
  ].map((r) => {
    const windows = buildOverlapWindows(SESSION_START, SESSION_END, r.lookbackMs, r.stepMs);
    const requestsPer30Min = (windows.length / ((parseTs(SESSION_END) - parseTs(SESSION_START)) / 60000)) * 30;
    return {
      ...r,
      requestCount: windows.length,
      requestsPer30MinTrip: requestsPer30Min,
      SETTLED_RETRIEVAL_COMPLETENESS: 'DERIVED_FROM_OVERLAP_MATRIX',
      THEORETICAL_REQUEST_RATE_PER_30MIN: requestsPer30Min,
      REAL_TIME_AVAILABILITY_PROVEN: 'NO',
    };
  });

  // GT interior recovery from reference union + full trip
  const gtRecovery = {};
  for (const gap of GT_GAPS) {
    const obsInterior = countInteriorBuckets(obsRef.buckets, gap.start, gap.end);
    const refInterior = countInteriorBuckets(referenceBuckets, gap.start, gap.end);
    const tripInterior = countInteriorBuckets(fullTrip.buckets, gap.start, gap.end);
    const ge = gapExpansion.find((g) => g.gapId === gap.id);
    gtRecovery[gap.id] = {
      obsInterior,
      refInterior,
      tripInterior,
      wide300Interior: ge?.contexts?.GAP_PLUS_MINUS_300S?.interiorBuckets ?? 0,
      fullPhaseInterior: ge?.contexts?.FULL_PHASE?.interiorBuckets ?? 0,
      INTERIOR_RECOVERED: refInterior > 0 ? 'YES' : 'NO',
    };
  }

  // Request cost model (30 min trip extrapolation from session)
  const sessionMin = (parseTs(SESSION_END) - parseTs(SESSION_START)) / 60000;
  const costModel = queryMatrix
    .filter((q) => q.strategy.startsWith('W') || q.strategy === 'FULL_TRIP')
    .map((q) => ({
      strategy: q.strategy,
      requestsThisSession: q.requestCount,
      requestsPer30MinTrip: (q.requestCount / sessionMin) * 30,
      requestsPer100VehiclesPerTrip: ((q.requestCount / sessionMin) * 30) * 100,
      requestsPer1000VehiclesPerTrip: ((q.requestCount / sessionMin) * 30) * 1000,
    }));

  // Hypothesis classification
  const w060 = queryMatrix.find((q) => q.strategy === 'W060');
  const w300 = queryMatrix.find((q) => q.strategy === 'W300');
  const fullTripRow = queryMatrix.find((q) => q.strategy === 'FULL_TRIP');
  const bestPostTrip = [...postTrip].sort((a, b) => (b.completenessVsReference || 0) - (a.completenessVsReference || 0))[0];

  const anyGapRecovered = Object.values(gtRecovery).some((g) => g.refInterior > 0);
  const largerImproves =
    (w300?.uniqueBucketIdentities || 0) > (w060?.uniqueBucketIdentities || 0) ||
    (fullTripRow?.uniqueBucketIdentities || 0) > (w060?.uniqueBucketIdentities || 0);

  const overlapBest = overlapMatrix.reduce((best, row) =>
    (row.completenessVsReference || 0) > (best.completenessVsReference || 0) ? row : best,
  overlapMatrix[0]);

  const hypotheses = {
    H1_LARGER_WINDOWS: largerImproves ? 'SUPPORTED' : 'NOT_SUPPORTED',
    H2_OVERLAP: (overlapBest?.completenessVsReference || 0) > (w060?.completenessVsReference || 0) ? 'SUPPORTED' : 'MIXED',
    H3_POST_TRIP_RECONSTRUCTION:
      (bestPostTrip?.completenessVsReference || 0) >= (w060?.completenessVsReference || 0) && (bestPostTrip?.requestCount || 99) < (w060?.requestCount || 0)
        ? 'SUPPORTED'
        : 'MIXED',
    H4_GAPS_CAUSED_BY_SMALL_WINDOWS: anyGapRecovered ? 'CONTRADICTED' : 'UNKNOWN',
    H5_GAPS_PERSIST_WITH_LARGE_WINDOWS: anyGapRecovered ? 'CONTRADICTED' : 'SUPPORTED',
  };

  const decision = {
    EXP020_EXECUTED: 'YES',
    SETTLED_WINDOW_GEOMETRY_TESTABLE_NOW: 'YES',
    HISTORICAL_AS_OF_SETTLEMENT_COUNTERFACTUAL_AVAILABLE: firstObsAge.available ? 'PARTIAL' : 'NO',
    REFERENCE_UNIQUE_BUCKET_COUNT: referenceBuckets.size,
    W060_COMPLETENESS: w060?.completenessVsReference,
    W120_COMPLETENESS: queryMatrix.find((q) => q.strategy === 'W120')?.completenessVsReference,
    W180_COMPLETENESS: queryMatrix.find((q) => q.strategy === 'W180')?.completenessVsReference,
    W240_COMPLETENESS: queryMatrix.find((q) => q.strategy === 'W240')?.completenessVsReference,
    W300_COMPLETENESS: w300?.completenessVsReference,
    FULL_PHASE_COMPLETENESS: Math.max(
      ...queryMatrix.filter((q) => q.strategy.startsWith('FULL_PHASE')).map((q) => q.completenessVsReference || 0),
    ),
    FULL_TRIP_COMPLETENESS: fullTripRow?.completenessVsReference,
    BEST_POST_TRIP_STRATEGY: bestPostTrip?.id,
    BEST_POST_TRIP_COMPLETENESS: bestPostTrip?.completenessVsReference,
    BEST_POST_TRIP_REQUEST_COUNT: bestPostTrip?.requestCount,
    LARGER_WINDOWS_IMPROVE_SETTLED_RECOVERY: hypotheses.H1_LARGER_WINDOWS,
    OVERLAP_IMPROVES_SETTLED_RECOVERY: hypotheses.H2_OVERLAP,
    GT_10_P0_INTERIOR_RECOVERED: gtRecovery['GT-10-P0'].INTERIOR_RECOVERED,
    GT_20_P0_INTERIOR_RECOVERED: gtRecovery['GT-20-P0'].INTERIOR_RECOVERED,
    GT_30_P0_INTERIOR_RECOVERED: gtRecovery['GT-30-P0'].INTERIOR_RECOVERED,
    GT_30_P1_INTERIOR_RECOVERED: gtRecovery['GT-30-P1'].INTERIOR_RECOVERED,
    GT_60_P0_INTERIOR_RECOVERED: gtRecovery['GT-60-P0'].INTERIOR_RECOVERED,
    BUCKET_FIRST_OBSERVATION_AGE_DISTRIBUTION_AVAILABLE: firstObsAge.available ? 'YES' : 'NO',
    SETTLEMENT_DELAY_60S_VALIDATED: 'NO',
    SETTLEMENT_DELAY_120S_VALIDATED: 'NO',
    SETTLEMENT_DELAY_180S_VALIDATED: 'NO',
    SETTLEMENT_DELAY_300S_VALIDATED: 'NO',
    CURRENT_PROD_POST_TRIP_QUERY_STRATEGY: implementationAudit.productionPostTrip.CURRENT_PROD_POST_TRIP_QUERY_STRATEGY,
    CURRENT_PROD_QUERY_WINDOW_GEOMETRY: implementationAudit.productionPostTrip.CURRENT_PROD_QUERY_WINDOW_GEOMETRY,
    CURRENT_PROD_POST_TRIP_SETTLEMENT_DELAY: implementationAudit.productionPostTrip.CURRENT_PROD_POST_TRIP_SETTLEMENT_DELAY,
    ...hypotheses,
    BEST_ARCHITECTURE_DIRECTION_FROM_CURRENT_EVIDENCE: anyGapRecovered ? 'POST_TRIP_PLUS_GAP_RECOVERY' : 'POST_TRIP_HF_RECONSTRUCTION_OR_MULTI_AUTHORITY',
    CONFIDENCE: 'MEDIUM',
    EXP021_SHADOW_SETTLEMENT_TEST_REQUIRED: 'YES',
    COUNTERBALANCED_60_30_20_10_DRIVE_STILL_REQUIRED: 'YES',
    PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED: 'NO',
    RUNTIME_CODE_CHANGED: 'NO',
    READY_FOR_HUMAN_EXP020_REVIEW: 'YES',
  };

  fs.writeFileSync(path.join(outDir, 'query-matrix.json'), JSON.stringify({ implementationAudit, settledReference, queryMatrix, overlapMatrix }, null, 2));
  fs.writeFileSync(path.join(outDir, 'gap-expansion.json'), JSON.stringify({ gapExpansion, gtRecovery }, null, 2));
  fs.writeFileSync(path.join(outDir, 'post-trip-strategies.json'), JSON.stringify(postTrip, null, 2));
  fs.writeFileSync(path.join(outDir, 'rolling-strategies.json'), JSON.stringify(rolling, null, 2));
  fs.writeFileSync(path.join(outDir, 'first-observation-age.json'), JSON.stringify({ firstObsAge, provenanceRequestCount: provenance.length }, null, 2));
  fs.writeFileSync(path.join(outDir, 'request-cost-model.json'), JSON.stringify(costModel, null, 2));
  fs.writeFileSync(path.join(outDir, 'final-comparison.json'), JSON.stringify({ hypotheses, decision, gtRecovery }, null, 2));

  console.log(JSON.stringify({ settledReference, decision, gtRecovery, hypotheses }, null, 2));
})();
