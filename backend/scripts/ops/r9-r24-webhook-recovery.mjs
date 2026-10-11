/**
 * R2.4 — Authorized R9 Speed / Ignition webhook recovery (PUT enable only).
 * Default: READ_ONLY (auth + GET). Mutation: --execute --confirm-webhook=<uuid> (allowlist).
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import {
  R9_SPEED_ID,
  R9_IGNITION_ID,
  EXPECTED_R9_COHORT,
  EXCLUDED_TOKENS,
  parseCliArgs,
  resolveExecutionMode,
  tokenIdsFromSubs,
  cohortMatches,
  semanticsForWebhookId,
  semanticsMatch,
} from './r9-r24-webhook-recovery.lib.mjs';

const API = 'https://vehicle-triggers-api.dimo.zone';
const AUTH_URL = 'https://auth.dimo.zone';

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[line.slice(0, idx).trim()] = val;
  }
  return env;
}

function stableId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

function pickFields(w) {
  if (!w) return null;
  return {
    id: w.id,
    stableId: stableId(w.id),
    service: w.service,
    metricName: w.metricName,
    condition: w.condition,
    coolDownPeriod: w.coolDownPeriod,
    displayName: w.displayName,
    description: w.description,
    targetURL: w.targetURL ?? w.url,
    status: w.status,
    failureCount: w.failureCount,
  };
}

async function authenticate(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x') ? env.DIMO_PRIVATE_KEY : `0x${env.DIMO_PRIVATE_KEY}`;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN;
  const challengeRes = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
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
  const submitRes = await axios.post(`${AUTH_URL}/auth/web3/submit_challenge`, submitBody.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });
  const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

async function getWebhook(headers, id) {
  const list = await axios.get(`${API}/v1/webhooks`, { headers, timeout: 20000 });
  const arr = Array.isArray(list.data) ? list.data : list.data?.webhooks ?? [];
  return arr.find((w) => String(w.id) === id) ?? null;
}

async function getSubs(headers, id) {
  const res = await axios.get(`${API}/v1/webhooks/${id}`, { headers, timeout: 20000 });
  return Array.isArray(res.data) ? res.data : [];
}

const cli = parseCliArgs(process.argv.slice(2));
const execution = resolveExecutionMode(cli);
const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

const out = {
  sessionUtc: new Date().toISOString(),
  mode: execution.mode,
  executionGate: execution,
  abort: false,
};

console.error(`MODE=${execution.mode}`);

try {
  const headers = await authenticate(env);
  const speedBefore = pickFields(await getWebhook(headers, R9_SPEED_ID));
  const ignBefore = pickFields(await getWebhook(headers, R9_IGNITION_ID));
  const speedSubs = tokenIdsFromSubs(await getSubs(headers, R9_SPEED_ID));
  const ignSubs = tokenIdsFromSubs(await getSubs(headers, R9_IGNITION_ID));

  out.preflight = {
    speed: { definition: speedBefore, subscriberTokenIds: speedSubs, cohortOk: cohortMatches(speedSubs) },
    ignition: { definition: ignBefore, subscriberTokenIds: ignSubs, cohortOk: cohortMatches(ignSubs) },
  };

  if (!speedBefore || !ignBefore) {
    out.abort = true;
    out.reason = 'r9_definition_missing';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  if (!out.preflight.speed.cohortOk || !out.preflight.ignition.cohortOk) {
    out.abort = true;
    out.reason = 'unexpected_subscriber_cohort';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (!execution.authorized) {
    out.readOnlyComplete = true;
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const webhookId = execution.webhookId;
  const expectedSemantics = semanticsForWebhookId(webhookId);
  const defBefore = webhookId === R9_SPEED_ID ? speedBefore : ignBefore;
  const subsBefore = webhookId === R9_SPEED_ID ? speedSubs : ignSubs;

  if (!semanticsMatch(defBefore, expectedSemantics)) {
    out.abort = true;
    out.reason = 'semantics_divergence';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (defBefore.status === 'enabled' && defBefore.failureCount === 0) {
    out.result = 'ALREADY_RECOVERED';
    out.skippedPut = true;
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const verificationToken = env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  if (!verificationToken) {
    out.abort = true;
    out.reason = 'verification_token_missing';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const putPayload = {
    service: defBefore.service,
    metricName: defBefore.metricName,
    condition: defBefore.condition,
    coolDownPeriod: defBefore.coolDownPeriod,
    description: defBefore.description,
    displayName: defBefore.displayName,
    targetURL: defBefore.targetURL,
    status: 'enabled',
    verificationToken,
  };

  const putRes = await axios.put(`${API}/v1/webhooks/${webhookId}`, putPayload, {
    headers,
    timeout: 45000,
    validateStatus: () => true,
  });

  out.put = {
    webhookId,
    httpStatus: putRes.status,
    completedUtc: new Date().toISOString(),
  };

  if (putRes.status < 200 || putRes.status >= 300) {
    out.abort = true;
    out.reason = 'put_non_2xx';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const defAfter = pickFields(await getWebhook(headers, webhookId));
  const subsAfter = tokenIdsFromSubs(await getSubs(headers, webhookId));

  out.after = {
    definition: defAfter,
    subscriberTokenIds: subsAfter,
    cohortOk: cohortMatches(subsAfter),
    subscriptionsUnchanged: JSON.stringify(subsBefore) === JSON.stringify(subsAfter),
    semanticsPreserved: semanticsMatch(defAfter, expectedSemantics),
  };

  if (defAfter?.status !== 'enabled') out.abort = true;
  if (defAfter?.failureCount !== 0) out.abort = true;
  if (!out.after.cohortOk) out.abort = true;
  if (!out.after.subscriptionsUnchanged) out.abort = true;
  if (!out.after.semanticsPreserved) out.abort = true;

  out.success = !out.abort;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.abort ? 1 : 0);
} catch (e) {
  out.abort = true;
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
