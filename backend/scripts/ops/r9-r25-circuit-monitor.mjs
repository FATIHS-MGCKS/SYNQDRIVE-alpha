#!/usr/bin/env node
/**
 * R2.6 — Read-only R9 webhook circuit monitor (DIMO GET + optional public /health GET).
 * NEVER POSTs to /api/v1/webhooks/dimo. No provider PUT/subscribe. No secrets in output.
 */
import fs from 'fs';
import axios from 'axios';
import { Wallet } from 'ethers';
import crypto from 'crypto';
import {
  R9_SPEED_ID,
  R9_IGNITION_ID,
  evaluateR9DefinitionHealth,
  evaluatePublicHealthGet,
  parseSubscriberList,
  classifyDimoApiError,
} from './r9-r25-circuit-monitor.lib.mjs';

const CHECK_PUBLIC_HEALTH = process.argv.includes('--check-public-health');
const MIN_INTERVAL_MS = parseInt(process.env.R9_MONITOR_MIN_INTERVAL_MS || '60000', 10);

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
  if (!jwt) throw Object.assign(new Error('auth_jwt_missing'), { code: 'AUTH_JWT_MISSING' });
  return { Authorization: `Bearer ${jwt}` };
}

const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const api = 'https://vehicle-triggers-api.dimo.zone';
const report = {
  observedAt: new Date().toISOString(),
  mode: 'READ_ONLY_MONITOR',
  dimoApiReachable: false,
  healthy: false,
};

try {
  const headers = await authenticate(env);
  const listRaw = (await axios.get(`${api}/v1/webhooks`, { headers, timeout: 20000 })).data;
  const list = Array.isArray(listRaw) ? listRaw : listRaw?.webhooks;
  if (!Array.isArray(list)) {
    report.dimoApiReachable = true;
    report.parseError = 'WEBHOOK_LIST_UNEXPECTED_SHAPE';
    report.healthy = false;
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  report.dimoApiReachable = true;
  const byId = new Map(list.map((w) => [String(w.id), w]));

  const speedDef = pickDef(byId.get(R9_SPEED_ID));
  const ignDef = pickDef(byId.get(R9_IGNITION_ID));

  const speedSubsRaw = (await axios.get(`${api}/v1/webhooks/${R9_SPEED_ID}`, { headers, timeout: 20000 })).data;
  const ignSubsRaw = (await axios.get(`${api}/v1/webhooks/${R9_IGNITION_ID}`, { headers, timeout: 20000 })).data;
  const speedParsed = parseSubscriberList(speedSubsRaw);
  const ignParsed = parseSubscriberList(ignSubsRaw);

  const speedHealth = evaluateR9DefinitionHealth(speedDef, speedParsed.ok ? speedParsed.tokenIds : []);
  const ignHealth = evaluateR9DefinitionHealth(ignDef, ignParsed.ok ? ignParsed.tokenIds : []);

  if (!speedParsed.ok) speedHealth.alerts.push({ code: speedParsed.error, severity: 'CRITICAL' });
  if (!ignParsed.ok) ignHealth.alerts.push({ code: ignParsed.error, severity: 'CRITICAL' });

  report.speed = { definition: speedDef, subscriberTokenIds: speedParsed.tokenIds ?? [], ...speedHealth };
  report.ignition = { definition: ignDef, subscriberTokenIds: ignParsed.tokenIds ?? [], ...ignHealth };

  if (CHECK_PUBLIC_HEALTH) {
    const base = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '');
    const health = await axios.get(`${base}/api/v1/health`, { timeout: 15000, validateStatus: () => true });
    report.publicHealth = evaluatePublicHealthGet(health.status);
  }

  report.healthy =
    report.speed.healthy &&
    report.ignition.healthy &&
    (!report.publicHealth || report.publicHealth.ok);

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.healthy ? 0 : 2);
} catch (err) {
  report.dimoApiReachable = false;
  report.dimoApiError = classifyDimoApiError(err);
  report.healthy = false;
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
