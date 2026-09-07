#!/usr/bin/env node
/**
 * EXP-021 preflight — identical settled interval queried Q1/Q2/Q3 back-to-back.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Wallet } = require('ethers');

const TOKEN_ID = 187336;
/** Fixed closed interval from EXP-019 trip mid-drive (prospective example). */
const INTERVAL_FROM = '2026-09-07T04:40:00.000Z';
const INTERVAL_TO = '2026-09-07T04:41:00.000Z';

function loadEnv() {
  for (const envPath of ['/opt/synqdrive/shared/backend.env']) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function canonTs(ts) {
  return new Date(Date.parse(ts)).toISOString();
}

function bucketKey(ts) {
  return `speed|${canonTs(ts)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function query(jwt, label) {
  const started = new Date().toISOString();
  const queryStr = `
    query Idempotence${label} {
      signals(tokenId: ${TOKEN_ID}, from: "${INTERVAL_FROM}", to: "${INTERVAL_TO}", interval: "1s") {
        timestamp speed(agg: AVG) } }`.trim();
  const url = process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(url, { query: queryStr }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  const signals = resp.data?.data?.signals ?? [];
  const keys = new Set();
  for (const s of signals) if (s?.timestamp) keys.add(bucketKey(s.timestamp));
  return {
    label,
    requestStartedAt: started,
    requestCompletedAt: new Date().toISOString(),
    status: signals.length ? 'SUCCESS' : 'ZERO_RESULT',
    rawRowCount: signals.length,
    uniqueBucketKeys: [...keys].sort(),
    uniqueBucketCount: keys.size,
  };
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 1;
}

(async () => {
  loadEnv();
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-021';
  fs.mkdirSync(outDir, { recursive: true });

  const devJwt = await getDeveloperJwt();
  const jwt = await getVehicleJwt(devJwt);

  const q1 = await query(jwt, 'Q1');
  await sleep(500);
  const q2 = await query(jwt, 'Q2');
  await sleep(500);
  const q3 = await query(jwt, 'Q3');

  const j12 = jaccard(q1.uniqueBucketKeys, q2.uniqueBucketKeys);
  const j23 = jaccard(q2.uniqueBucketKeys, q3.uniqueBucketKeys);
  const j13 = jaccard(q1.uniqueBucketKeys, q3.uniqueBucketKeys);

  let stability = 'IDENTICAL';
  if (j12 < 1 || j23 < 1) stability = j12 >= 0.99 && j23 >= 0.99 ? 'NEAR_IDENTICAL' : 'UNSTABLE';

  const result = {
    IDENTICAL_QUERY_STABILITY_TEST_EXECUTED: 'YES',
    intervalFrom: INTERVAL_FROM,
    intervalTo: INTERVAL_TO,
    queries: [q1, q2, q3],
    jaccard: { Q1_Q2: j12, Q2_Q3: j23, Q1_Q3: j13 },
    IDENTICAL_QUERY_RESULT_STABILITY: stability,
    onlyInQ2: q2.uniqueBucketKeys.filter((k) => !q1.uniqueBucketKeys.includes(k)),
    onlyInQ3: q3.uniqueBucketKeys.filter((k) => !q1.uniqueBucketKeys.includes(k)),
  };

  fs.writeFileSync(path.join(outDir, 'idempotence-preflight.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
