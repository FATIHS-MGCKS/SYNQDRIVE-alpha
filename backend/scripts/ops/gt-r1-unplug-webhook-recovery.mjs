/**
 * GT-R1 authorized UNPLUG webhook recovery — single PUT enable on existing UUID.
 * Reads credentials from /opt/synqdrive/shared/backend.env (VPS) or process.env.
 * Outputs redacted JSON to stdout; never prints secrets.
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';

const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';
const EXPECTED_STABLE = 'a257daa23ee5';
const PLUG_STABLE = 'b977124a025a';
const R9_SPEED_STABLE = '9eeb7158afee';
const R9_IGN_STABLE = '5d611d470eab';
const TOKEN_187336 = 187336;
const API = 'https://vehicle-triggers-api.dimo.zone';
const AUTH_URL = 'https://auth.dimo.zone';

const EXPECTED_SEMANTICS = {
  service: 'signals',
  metricName: 'vss.obdIsPluggedIn',
  condition: 'valueNumber == 0',
  coolDownPeriod: 0,
  displayName: 'OBD Device unplugged',
  description: 'Driver unplugged OBD Device',
  targetURL: 'https://app.synqdrive.eu/api/v1/webhooks/dimo',
};

function loadEnv(path) {
  const env = { ...process.env };
  if (path && fs.existsSync(path)) {
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[line.slice(0, idx).trim()] = val;
    }
  }
  return env;
}

function stableId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

function normalizeAssetDid(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return entry.assetDID ?? entry.assetDid ?? entry.vehicle ?? entry.did ?? null;
  }
  return String(entry);
}

function tokenFromAssetDid(assetDid) {
  const m = String(assetDid).match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function pickWebhookFields(w) {
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
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

function semanticsMatch(w) {
  const fields = pickWebhookFields(w);
  if (!fields) return false;
  for (const [k, v] of Object.entries(EXPECTED_SEMANTICS)) {
    if (fields[k] !== v) return false;
  }
  return true;
}

async function authenticate(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY?.startsWith('0x')
    ? env.DIMO_PRIVATE_KEY
    : `0x${env.DIMO_PRIVATE_KEY}`;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN;
  const challengeRes = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
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
  });
  const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
  if (!jwt) throw new Error('auth_failed_no_jwt');
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

async function listWebhooks(headers) {
  const raw = (await axios.get(`${API}/v1/webhooks`, { headers })).data;
  return Array.isArray(raw) ? raw : raw?.webhooks ?? [];
}

async function getSubscriptions(headers, webhookId) {
  const raw = (await axios.get(`${API}/v1/webhooks/${webhookId}`, { headers })).data;
  const list = Array.isArray(raw) ? raw : raw?.vehicles ?? raw?.assetDIDs ?? [];
  return list.map(normalizeAssetDid).filter(Boolean).map(String).sort();
}

async function vehicleHasWebhook(headers, contract, tokenId, webhookId) {
  const assetDid = `did:erc721:137:${contract}:${tokenId}`;
  const raw = (await axios.get(`${API}/v1/webhooks/vehicles/${assetDid}`, { headers })).data;
  const links = Array.isArray(raw) ? raw : raw?.webhooks ?? [];
  return links.some((e) => String(e.webhookId ?? e.id ?? '') === webhookId);
}

function subscriptionsToTokenIds(assetDids) {
  return assetDids
    .map((d) => tokenFromAssetDid(d))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

const envPath = process.env.BACKEND_ENV_PATH || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const verificationToken = env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
if (!verificationToken) {
  console.log(JSON.stringify({ abort: true, reason: 'DIMO_WEBHOOK_VERIFICATION_TOKEN missing' }));
  process.exit(1);
}

const out = {
  sessionUtc: new Date().toISOString(),
  phase: null,
  abort: false,
  before: null,
  put: null,
  after: null,
};

try {
  const headers = await authenticate(env);
  const webhooks = await listWebhooks(headers);
  const byStable = new Map(webhooks.map((w) => [stableId(w.id), w]));
  const unplugBefore = byStable.get(EXPECTED_STABLE);
  const plugBefore = byStable.get(PLUG_STABLE);
  const r9SpeedBefore = pickWebhookFields(byStable.get(R9_SPEED_STABLE));
  const r9IgnBefore = pickWebhookFields(byStable.get(R9_IGN_STABLE));

  if (!unplugBefore || unplugBefore.id !== UNPLUG_ID) {
    out.abort = true;
    out.reason = 'unplug_uuid_mismatch_or_missing';
    console.log(JSON.stringify(out));
    process.exit(1);
  }
  if (stableId(unplugBefore.id) !== EXPECTED_STABLE) {
    out.abort = true;
    out.reason = 'stable_id_mismatch';
    console.log(JSON.stringify(out));
    process.exit(1);
  }
  if (!semanticsMatch(unplugBefore)) {
    out.abort = true;
    out.reason = 'semantics_mismatch_before_put';
    out.before = { unplug: pickWebhookFields(unplugBefore) };
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const subsBefore = await getSubscriptions(headers, UNPLUG_ID);
  const tokenIdsBefore = subscriptionsToTokenIds(subsBefore);
  const token187336Before = await vehicleHasWebhook(headers, contract, TOKEN_187336, UNPLUG_ID);

  out.before = {
    unplug: pickWebhookFields(unplugBefore),
    plug: pickWebhookFields(plugBefore),
    r9Speed: r9SpeedBefore,
    r9Ignition: r9IgnBefore,
    subscriptionAssetDidCount: subsBefore.length,
    subscriptionTokenIds: tokenIdsBefore,
    token187336Subscribed: token187336Before || tokenIdsBefore.includes(TOKEN_187336),
    plugDisabled: plugBefore?.status === 'disabled',
  };

  if (!out.before.token187336Subscribed) {
    out.abort = true;
    out.reason = 'token_187336_not_subscribed_before';
    console.log(JSON.stringify(out));
    process.exit(1);
  }
  if (!out.before.plugDisabled) {
    out.abort = true;
    out.reason = 'plug_not_disabled_before';
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const putPayload = {
    ...EXPECTED_SEMANTICS,
    status: 'enabled',
    verificationToken,
  };
  const putStarted = new Date().toISOString();
  let putRes;
  try {
    putRes = await axios.put(`${API}/v1/webhooks/${UNPLUG_ID}`, putPayload, { headers, validateStatus: () => true });
  } catch (e) {
    out.abort = true;
    out.put = { startedUtc: putStarted, error: e.message };
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  out.put = {
    startedUtc: putStarted,
    completedUtc: new Date().toISOString(),
    httpStatus: putRes.status,
    body: putRes.data && typeof putRes.data === 'object'
      ? { ...putRes.data, verificationToken: '[REDACTED]' }
      : putRes.data,
  };

  if (putRes.status < 200 || putRes.status >= 300) {
    out.abort = true;
    out.reason = 'put_non_2xx';
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const webhooksAfter = await listWebhooks(headers);
  const byStableAfter = new Map(webhooksAfter.map((w) => [stableId(w.id), w]));
  const unplugAfter = byStableAfter.get(EXPECTED_STABLE);
  const plugAfter = byStableAfter.get(PLUG_STABLE);
  const r9SpeedAfter = pickWebhookFields(byStableAfter.get(R9_SPEED_STABLE));
  const r9IgnAfter = pickWebhookFields(byStableAfter.get(R9_IGN_STABLE));
  const subsAfter = await getSubscriptions(headers, UNPLUG_ID);
  const tokenIdsAfter = subscriptionsToTokenIds(subsAfter);
  const token187336After = await vehicleHasWebhook(headers, contract, TOKEN_187336, UNPLUG_ID);

  const semanticsPreserved = semanticsMatch(unplugAfter);
  const failureCountBefore = unplugBefore.failureCount;
  const failureCountAfter = unplugAfter?.failureCount;
  let failureCountClass = 'OTHER';
  if (failureCountAfter === 0 && failureCountBefore > 0) failureCountClass = 'RESET_TO_ZERO';
  else if (failureCountAfter === failureCountBefore && failureCountBefore > 0) failureCountClass = 'PRESERVED_NONZERO';
  else if (failureCountAfter === 0 && failureCountBefore === 0) failureCountClass = 'RESET_TO_ZERO';

  out.after = {
    unplug: pickWebhookFields(unplugAfter),
    plug: pickWebhookFields(plugAfter),
    r9Speed: r9SpeedAfter,
    r9Ignition: r9IgnAfter,
    subscriptionAssetDidCount: subsAfter.length,
    subscriptionTokenIds: tokenIdsAfter,
    token187336Subscribed: token187336After || tokenIdsAfter.includes(TOKEN_187336),
    plugDisabled: plugAfter?.status === 'disabled',
    semanticsPreserved,
    failureCountClassification: failureCountClass,
    subscriptionsUnchanged:
      subsBefore.length === subsAfter.length &&
      JSON.stringify(subsBefore) === JSON.stringify(subsAfter),
    r9Untouched:
      JSON.stringify(r9SpeedBefore) === JSON.stringify(r9SpeedAfter) &&
      JSON.stringify(r9IgnBefore) === JSON.stringify(r9IgnAfter),
  };

  if (unplugAfter?.id !== UNPLUG_ID) out.abort = true;
  if (unplugAfter?.status !== 'enabled') out.abort = true;
  if (!semanticsPreserved) out.abort = true;
  if (!out.after.token187336Subscribed) out.abort = true;
  if (!out.after.plugDisabled) out.abort = true;
  if (subsBefore.length !== subsAfter.length) out.abort = true;
  if (JSON.stringify(tokenIdsBefore) !== JSON.stringify(tokenIdsAfter)) out.abort = true;
  if (!out.after.r9Untouched) out.abort = true;

  out.success = !out.abort;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.abort ? 1 : 0);
} catch (e) {
  out.abort = true;
  out.error = e.message;
  console.log(JSON.stringify(out));
  process.exit(1);
}
