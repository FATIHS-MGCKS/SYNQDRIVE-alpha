#!/usr/bin/env node
/**
 * READ-ONLY R9 cohort provider audit (GET /v1/webhooks* only after developer JWT).
 * Provider mutations: NONE. DB: NONE.
 *
 * Usage on Production VPS:
 *   node r2-r9-get-only-audit.mjs
 *
 * Env: reads /opt/synqdrive/shared/backend.env (no output of secrets).
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';

const R9_AUTHORIZED_TOKEN_IDS = [186946, 187336, 187361, 187784, 192922];
const EXCLUDED_FORMER_FLEET = 190497;

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    env[line.slice(0, idx).trim()] = val;
  }
  return env;
}

function stableId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

async function developerJwt(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x')
    ? env.DIMO_PRIVATE_KEY
    : `0x${env.DIMO_PRIVATE_KEY}`;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN;
  const authUrl = 'https://auth.dimo.zone';
  const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
    params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
    timeout: 15000,
  });
  const { challenge, state: st } = challengeRes.data;
  const wallet = new Wallet(privateKey);
  const signature = await wallet.signMessage(challenge);
  const submitBody = new URLSearchParams({
    client_id: clientId,
    domain,
    grant_type: 'authorization_code',
    response_type: 'code',
    scope: 'openid email',
    state: st,
    signature,
    address: clientId,
  });
  const submitRes = await axios.post(`${authUrl}/auth/web3/submit_challenge`, submitBody.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
}

const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const jwt = await developerJwt(env);
const headers = { Authorization: `Bearer ${jwt}` };
const api = 'https://vehicle-triggers-api.dimo.zone';
const contract =
  env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

const webhooksRaw = (await axios.get(`${api}/v1/webhooks`, { headers, timeout: 15000 })).data;
const webhooks = Array.isArray(webhooksRaw) ? webhooksRaw : webhooksRaw?.webhooks ?? [];
const r9 = webhooks.filter((w) => String(w.displayName || '').startsWith('SynqDrive R9'));

let subscribedSpeed = 0;
let subscribedIgnition = 0;
let subscribedBoth = 0;
const perVehicle = [];

for (const tokenId of R9_AUTHORIZED_TOKEN_IDS) {
  const assetDid = `did:erc721:137:${contract}:${tokenId}`;
  const links = await axios
    .get(`${api}/v1/webhooks/vehicles/${encodeURIComponent(assetDid)}`, { headers, timeout: 15000 })
    .then((r) => (Array.isArray(r.data) ? r.data : []));
  const byId = new Map(webhooks.map((w) => [String(w.id), w]));
  const linked = links.map((e) => byId.get(String(e.webhookId ?? ''))).filter(Boolean);
  const speed = linked.some((w) => String(w.metricName || '').toLowerCase().includes('speed'));
  const ign = linked.some((w) => {
    const m = String(w.metricName || '').toLowerCase();
    return m.includes('ignition');
  });
  if (speed) subscribedSpeed++;
  if (ign) subscribedIgnition++;
  if (speed && ign) subscribedBoth++;
  perVehicle.push({
    tokenId,
    linkCount: links.length,
    speed,
    ignition: ign,
    webhookStableIds: linked.map((w) => stableId(w.id)),
  });
}

const out = {
  auditMode: 'READ_ONLY_GET',
  observedAt: new Date().toISOString(),
  apiBase: api,
  r9AuthorizedCohort: R9_AUTHORIZED_TOKEN_IDS,
  excludedFormerFleetTokenId: EXCLUDED_FORMER_FLEET,
  cohortSize: R9_AUTHORIZED_TOKEN_IDS.length,
  subscribedSpeed,
  subscribedIgnition,
  subscribedBoth,
  r9DefinitionCount: r9.length,
  r9Definitions: r9.map((w) => ({
    stableId: stableId(w.id),
    displayName: w.displayName,
    metricName: w.metricName,
    status: w.status,
    failureCount: w.failureCount ?? null,
  })),
  perVehicle,
};

console.log(JSON.stringify(out, null, 2));
