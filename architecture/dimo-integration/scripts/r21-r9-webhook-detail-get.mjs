#!/usr/bin/env node
/** READ-ONLY: GET R9 + legacy webhook definition details (sanitized). */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';

const TARGET_STABLE = new Set(['9eeb7158afee', '5d611d470eab', 'a257daa23ee5', 'b977124a025a', '1f96faea6569']);

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

function sanitizeWebhook(w) {
  if (!w) return null;
  const url = String(w.targetURL ?? w.url ?? '');
  let targetHost = null;
  try {
    targetHost = new URL(url).host;
  } catch {
    targetHost = 'invalid';
  }
  return {
    id: w.id,
    stableId: stableId(w.id),
    displayName: w.displayName,
    service: w.service,
    metricName: w.metricName,
    condition: w.condition,
    coolDownPeriod: w.coolDownPeriod,
    status: w.status,
    failureCount: w.failureCount ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    targetHost,
    description: w.description ? String(w.description).slice(0, 120) : null,
  };
}

const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const clientId = env.DIMO_CLIENT_ID;
const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x') ? env.DIMO_PRIVATE_KEY : `0x${env.DIMO_PRIVATE_KEY}`;
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
const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
const headers = { Authorization: `Bearer ${jwt}` };
const api = 'https://vehicle-triggers-api.dimo.zone';

const listRaw = (await axios.get(`${api}/v1/webhooks`, { headers, timeout: 15000 })).data;
const list = Array.isArray(listRaw) ? listRaw : listRaw?.webhooks ?? [];
const targets = list.filter((w) => TARGET_STABLE.has(stableId(w.id)));

const details = [];
for (const w of targets) {
  let subscribers = null;
  let subscriberCount = null;
  try {
    const subRes = await axios.get(`${api}/v1/webhooks/${w.id}`, { headers, timeout: 15000 });
    const body = subRes.data;
    if (Array.isArray(body)) {
      subscriberCount = body.length;
      subscribers = body.map((did) => {
        const m = String(did).match(/:(\d+)$/);
        return m ? parseInt(m[1], 10) : null;
      }).filter((n) => n != null);
    }
  } catch (e) {
    subscribers = { error: 'GET_SUBSCRIBERS_FAILED' };
  }
  details.push({ definition: sanitizeWebhook(w), subscriberCount, subscriberTokenIds: subscribers });
}

console.log(
  JSON.stringify(
    {
      auditMode: 'READ_ONLY_GET',
      observedAt: new Date().toISOString(),
      definitions: details,
    },
    null,
    2,
  ),
);
