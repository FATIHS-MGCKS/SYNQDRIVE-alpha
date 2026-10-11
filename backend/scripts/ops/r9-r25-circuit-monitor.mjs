#!/usr/bin/env node
/**
 * R2.5 — Read-only R9 webhook circuit monitor (GET + optional ingress probe).
 * Default: stdout JSON, exit 0 if healthy, exit 2 if alerts (no mutation).
 */
import fs from 'fs';
import axios from 'axios';
import { Wallet } from 'ethers';
import crypto from 'crypto';
import {
  R9_SPEED_ID,
  R9_IGNITION_ID,
  evaluateR9DefinitionHealth,
  evaluateIngressProbe,
} from './r9-r25-circuit-monitor.lib.mjs';

const PROBE_INGRESS = process.argv.includes('--probe-ingress');

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

function tokenIdsFromSubs(subs) {
  return subs
    .map((entry) => {
      const did = typeof entry === 'string' ? entry : entry?.assetDID ?? entry?.assetDid ?? '';
      const m = String(did).match(/:(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n != null);
}

async function authenticate(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x') ? env.DIMO_PRIVATE_KEY : `0x${env.DIMO_PRIVATE_KEY}`;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN;
  const authUrl = 'https://auth.dimo.zone';
  const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
    params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
    timeout: 20000,
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
    timeout: 20000,
  });
  const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
  return { Authorization: `Bearer ${jwt}` };
}

function pickDef(w) {
  if (!w) return null;
  return {
    id: w.id,
    stableId: stableId(w.id),
    displayName: w.displayName,
    metricName: w.metricName,
    status: w.status,
    failureCount: w.failureCount ?? null,
    condition: w.condition,
    coolDownPeriod: w.coolDownPeriod,
  };
}

const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const api = 'https://vehicle-triggers-api.dimo.zone';
const headers = await authenticate(env);

const listRaw = (await axios.get(`${api}/v1/webhooks`, { headers, timeout: 20000 })).data;
const list = Array.isArray(listRaw) ? listRaw : listRaw?.webhooks ?? [];
const byId = new Map(list.map((w) => [String(w.id), w]));

const speedDef = pickDef(byId.get(R9_SPEED_ID));
const ignDef = pickDef(byId.get(R9_IGNITION_ID));
const speedSubs = tokenIdsFromSubs(
  (await axios.get(`${api}/v1/webhooks/${R9_SPEED_ID}`, { headers, timeout: 20000 })).data ?? [],
);
const ignSubs = tokenIdsFromSubs(
  (await axios.get(`${api}/v1/webhooks/${R9_IGNITION_ID}`, { headers, timeout: 20000 })).data ?? [],
);

const speedHealth = evaluateR9DefinitionHealth(speedDef, speedSubs);
const ignHealth = evaluateR9DefinitionHealth(ignDef, ignSubs);

let ingress = null;
if (PROBE_INGRESS) {
  const base = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '');
  const probe = await axios.post(`${base}/api/v1/webhooks/dimo`, {}, {
    validateStatus: () => true,
    timeout: 15000,
  });
  ingress = evaluateIngressProbe(probe.status);
}

const report = {
  observedAt: new Date().toISOString(),
  mode: 'READ_ONLY_MONITOR',
  speed: { definition: speedDef, subscriberTokenIds: speedSubs.sort(), ...speedHealth },
  ignition: { definition: ignDef, subscriberTokenIds: ignSubs.sort(), ...ignHealth },
  ingress,
  healthy: speedHealth.healthy && ignHealth.healthy && (!ingress || ingress.ok),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.healthy ? 0 : 2);
