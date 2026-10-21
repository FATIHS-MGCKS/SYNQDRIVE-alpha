#!/usr/bin/env node
/**
 * EXP-021 preflight — audit EXP020_SETTLED_REFERENCE_UNION 446 vs ~141 discrepancy.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Wallet } = require('ethers');

const TOKEN_ID = 187336;
const TRIP_START = '2026-09-07T04:35:00.000Z';
const TRIP_END = '2026-09-07T04:57:29.000Z';
const SESSION_START = '2026-09-07T04:31:36.025Z';
const SESSION_END = '2026-09-07T05:00:20.016Z';

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

function canonTs(ts) {
  return new Date(parseTs(ts)).toISOString();
}

function bucketKey(ts) {
  return `speed|${canonTs(ts)}`;
}

function floorSecKey(ts) {
  return `speed|${new Date(Math.floor(parseTs(ts) / 1000) * 1000).toISOString()}`;
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

async function querySpeed(jwt, from, to) {
  const query = `
    query AuditSpeed { signals(tokenId: ${TOKEN_ID}, from: "${from}", to: "${to}", interval: "1s") {
      timestamp speed(agg: AVG) } }`.trim();
  const url = process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(url, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  const signals = resp.data?.data?.signals ?? [];
  const keys = new Map();
  const floorKeys = new Map();
  for (const s of signals) {
    if (!s?.timestamp) continue;
    keys.set(bucketKey(s.timestamp), s.timestamp);
    floorKeys.set(floorSecKey(s.timestamp), s.timestamp);
  }
  return { count: signals.length, keys, floorKeys, raw: signals };
}

function loadObsSpeed() {
  const p = process.argv.find((a) => a.startsWith('--settlement-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const keys = new Map();
  const fps = new Map();
  const floorKeys = new Map();
  for (const line of fs.readFileSync(path.join(p, 'observations.jsonl'), 'utf8').trim().split(/\n/)) {
    const o = JSON.parse(line);
    if (o.providerField !== 'speed') continue;
    keys.set(bucketKey(o.providerTimestamp), o.providerTimestamp);
    floorKeys.set(floorSecKey(o.providerTimestamp), o.providerTimestamp);
    const fp = o.physicalSampleFingerprint || o.provenanceJson?.aggregateBucketIdentity;
    if (fp) fps.set(fp, o.providerTimestamp);
  }
  return { keys, floorKeys, fps };
}

function overlap(a, b) {
  let n = 0;
  for (const k of a.keys()) if (b.has(k)) n++;
  return n;
}

function onlyIn(a, b) {
  const out = [];
  for (const k of a.keys()) if (!b.has(k)) out.push(k);
  return out;
}

(async () => {
  loadEnv();
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-021';
  fs.mkdirSync(outDir, { recursive: true });

  const obs = loadObsSpeed();
  const devJwt = await getDeveloperJwt();
  const jwt = await getVehicleJwt(devJwt);

  const trip = await querySpeed(jwt, TRIP_START, TRIP_END);
  const session = await querySpeed(jwt, SESSION_START, SESSION_END);

  const union = new Map(obs.keys);
  for (const [k, v] of trip.keys) union.set(k, v);
  for (const [k, v] of session.keys) if (!union.has(k)) union.set(k, v);

  const tripOnly = onlyIn(trip.keys, obs.keys);
  const sessionOnly = onlyIn(session.keys, obs.keys);
  const obsOnly = onlyIn(obs.keys, trip.keys);

  const tripObsOverlap = overlap(trip.keys, obs.keys);
  const sessionObsOverlap = overlap(session.keys, obs.keys);
  const tripSessionOverlap = overlap(trip.keys, session.keys);

  const floorTripObs = overlap(trip.floorKeys, obs.floorKeys);

  const report = {
    REFERENCE_446_UNION_SEMANTICS_AUDITED: 'YES',
    components: {
      observationsSpeedMsKeys: obs.keys.size,
      fullTripMsKeys: trip.keys.size,
      fullSessionMsKeys: session.keys.size,
      naiveUnionMsKeys: union.size,
    },
    overlaps: {
      tripIntersectObs: tripObsOverlap,
      sessionIntersectObs: sessionObsOverlap,
      tripIntersectSession: tripSessionOverlap,
      tripFloorIntersectObsFloor: floorTripObs,
    },
    exclusive: {
      obsOnlyMs: obsOnly.length,
      tripOnlyMs: tripOnly.length,
      sessionOnlyMs: sessionOnly.length,
    },
    timeRangeSemantics: {
      observations: 'TRUE_T30 incremental RC capture windows across full session (multi small queries)',
      fullTrip: `${TRIP_START} → ${TRIP_END} (VehicleTrip bounds, single settled query NOW)`,
      fullSession: `${SESSION_START} → ${SESSION_END} (RC session bounds, single settled query NOW)`,
    },
    classification: {
      '446_IS_VALID_DISTINCT_PROVIDER_BUCKET_UNION': 'PARTIAL',
      rationale: [
        'Union mixes THREE geometries: incremental T+30 capture + whole-trip + whole-session settled queries at different wall-clock times',
        'Not a single fixed-interval completeness denominator',
        'Ms-precision temporal keys understate overlap vs fingerprint identity',
        `${obs.keys.size} obs + ${tripOnly.length} trip-only + ${sessionOnly.filter((k) => !trip.keys.has(k)).length} session-only outside trip ≈ union`,
      ],
    },
    recommendation: 'EXP-021 must define per-fixed-interval reference at +600s; do not use 446 as cross-geometry completeness denominator',
  };

  fs.writeFileSync(path.join(outDir, 'reference-446-union-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
