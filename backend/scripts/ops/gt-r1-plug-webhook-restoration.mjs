/**
 * VDC OBD PLUG webhook restoration ops script — SAFE-BY-DEFAULT.
 *
 * Default (READ_ONLY provider inspection — auth handshake + GET inspection only; no webhook mutation):
 *   node backend/scripts/ops/gt-r1-plug-webhook-restoration.mjs
 *
 * Authorized mutation (requires fresh operator authorization OUTSIDE this script):
 *   node backend/scripts/ops/gt-r1-plug-webhook-restoration.mjs \
 *     --execute \
 *     --confirm-webhook=7a0562d3-369a-45eb-b5ed-8d35258091dd
 *
 * Scope note: DIMO PLUG/UNPLUG definitions are account-global; enabling PLUG affects all
 * vehicles subscribed to the PLUG webhook (not per-vehicle enable). Review blast radius in output.
 *
 * Script existence is NOT authorization. Never rerun PUT without explicit operator approval.
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import {
  PLUG_ID,
  PLUG_STABLE,
  UNPLUG_ID,
  UNPLUG_STABLE,
  R9_SPEED_STABLE,
  R9_IGN_STABLE,
  TOKEN_WOB_7503,
  EXPECTED_PLUG_SEMANTICS,
  parseCliArgs,
  resolveExecutionMode,
} from './gt-r1-plug-webhook-restoration.lib.mjs';

const API = 'https://vehicle-triggers-api.dimo.zone';
const AUTH_URL = 'https://auth.dimo.zone';

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

function plugSemanticsMatch(w) {
  const fields = pickWebhookFields(w);
  if (!fields) return false;
  for (const [k, v] of Object.entries(EXPECTED_PLUG_SEMANTICS)) {
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

async function collectPreflight(headers, contract) {
  const webhooks = await listWebhooks(headers);
  const byStable = new Map(webhooks.map((w) => [stableId(w.id), w]));
  const plug = byStable.get(PLUG_STABLE);
  const unplug = byStable.get(UNPLUG_STABLE);

  if (!plug || plug.id !== PLUG_ID) {
    return { abort: true, reason: 'plug_uuid_mismatch_or_missing' };
  }
  if (stableId(plug.id) !== PLUG_STABLE) {
    return { abort: true, reason: 'plug_stable_id_mismatch' };
  }
  if (!plugSemanticsMatch(plug)) {
    return {
      abort: true,
      reason: 'plug_semantics_mismatch',
      before: { plug: pickWebhookFields(plug) },
    };
  }

  if (!unplug || unplug.id !== UNPLUG_ID) {
    return { abort: true, reason: 'unplug_uuid_mismatch_or_missing', before: { plug: pickWebhookFields(plug) } };
  }
  if (unplug.status !== 'enabled') {
    return {
      abort: true,
      reason: 'unplug_not_enabled',
      before: { plug: pickWebhookFields(plug), unplug: pickWebhookFields(unplug) },
    };
  }

  const plugSubs = await getSubscriptions(headers, PLUG_ID);
  const unplugSubs = await getSubscriptions(headers, UNPLUG_ID);
  const plugTokenIds = subscriptionsToTokenIds(plugSubs);
  const unplugTokenIds = subscriptionsToTokenIds(unplugSubs);
  const wobPlugSubscribed =
    (await vehicleHasWebhook(headers, contract, TOKEN_WOB_7503, PLUG_ID)) ||
    plugTokenIds.includes(TOKEN_WOB_7503);
  const plugDisabled = plug?.status === 'disabled';

  if (!plugDisabled) {
    return {
      abort: true,
      reason: 'plug_not_disabled',
      before: { plug: pickWebhookFields(plug), unplug: pickWebhookFields(unplug) },
    };
  }

  return {
    abort: false,
    subscriptionScope: 'GLOBAL_WEBHOOK_DEFINITION_PER_TOKEN_SUBSCRIPTIONS',
    blastRadius: {
      plugSubscriptionTokenIds: plugTokenIds,
      plugSubscriptionAssetDidCount: plugSubs.length,
      unplugSubscriptionTokenIds: unplugTokenIds,
      note:
        'Enabling PLUG is global for webhook id 7a0562d3-…; all subscribed tokens receive PLUG events when provider emits.',
    },
    before: {
      plug: pickWebhookFields(plug),
      unplug: pickWebhookFields(unplug),
      r9Speed: pickWebhookFields(byStable.get(R9_SPEED_STABLE)),
      r9Ignition: pickWebhookFields(byStable.get(R9_IGN_STABLE)),
      plugSubscriptionAssetDidCount: plugSubs.length,
      plugSubscriptionTokenIds: plugTokenIds,
      unplugSubscriptionAssetDidCount: unplugSubs.length,
      unplugSubscriptionTokenIds: unplugTokenIds,
      token192922PlugSubscribed: wobPlugSubscribed,
      token192922PlugSubscribedViaPlugList: plugTokenIds.includes(TOKEN_WOB_7503),
      token192922PlugSubscribedViaVehicleLinks: await vehicleHasWebhook(
        headers,
        contract,
        TOKEN_WOB_7503,
        PLUG_ID,
      ),
      plugDisabled,
      unplugEnabled: unplug.status === 'enabled',
    },
    plugSubs,
    unplugSubs,
    plugTokenIds,
    unplugTokenIds,
    plug,
    unplug,
    r9SpeedBefore: pickWebhookFields(byStable.get(R9_SPEED_STABLE)),
    r9IgnBefore: pickWebhookFields(byStable.get(R9_IGN_STABLE)),
  };
}

const cli = parseCliArgs(process.argv.slice(2));
const execution = resolveExecutionMode(cli);

const envPath = process.env.BACKEND_ENV_PATH || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

const out = {
  sessionUtc: new Date().toISOString(),
  mode: execution.mode,
  executionGate: {
    executeFlag: cli.execute,
    confirmWebhook: cli.confirmWebhook,
    authorized: execution.authorized,
    gateReason: execution.reason ?? null,
  },
  abort: false,
  before: null,
  put: null,
  after: null,
};

console.error(`MODE=${execution.mode}`);

try {
  const headers = await authenticate(env);
  const preflight = await collectPreflight(headers, contract);

  if (preflight.abort) {
    out.abort = true;
    out.reason = preflight.reason;
    if (preflight.before) out.before = preflight.before;
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  out.subscriptionScope = preflight.subscriptionScope;
  out.blastRadius = preflight.blastRadius;
  out.before = preflight.before;

  if (!preflight.plugTokenIds.includes(TOKEN_WOB_7503)) {
    out.canaryReadiness = {
      wobPlugWebhookSubscribed: false,
      blocker: 'token_192922_missing_from_plug_webhook_subscription_list',
      remediation: 'POST /v1/webhooks/{PLUG_ID}/subscribe/{assetDID} for WOB before enable delivers events',
    };
  } else {
    out.canaryReadiness = { wobPlugWebhookSubscribed: true };
  }

  if (!execution.authorized) {
    out.readOnlyComplete = true;
    out.message =
      'Read-only provider inspection complete (auth handshake + GET inspection only). No Vehicle Triggers webhook mutation performed. Enabling PLUG is GLOBAL for subscribed vehicles — review blastRadius. Use --execute --confirm-webhook=<plug-uuid> only with fresh operator authorization.';
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!preflight.plugTokenIds.includes(TOKEN_WOB_7503)) {
    out.abort = true;
    out.reason = 'token_192922_not_subscribed_to_plug_webhook_list';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const verificationToken = env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  if (!verificationToken) {
    out.abort = true;
    out.reason = 'DIMO_WEBHOOK_VERIFICATION_TOKEN missing';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const putPayload = {
    ...EXPECTED_PLUG_SEMANTICS,
    status: 'enabled',
    verificationToken,
  };
  const putStarted = new Date().toISOString();
  let putRes;
  try {
    putRes = await axios.put(`${API}/v1/webhooks/${PLUG_ID}`, putPayload, { headers, validateStatus: () => true });
  } catch (e) {
    out.abort = true;
    out.put = { startedUtc: putStarted, error: e.message };
    console.log(JSON.stringify(out, null, 2));
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
  out.plugWebhookActivatedAt = out.put.completedUtc;
  out.providerTriggerId = PLUG_ID;
  out.activationScope = preflight.subscriptionScope;

  if (putRes.status < 200 || putRes.status >= 300) {
    out.abort = true;
    out.reason = 'put_non_2xx';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const webhooksAfter = await listWebhooks(headers);
  const byStableAfter = new Map(webhooksAfter.map((w) => [stableId(w.id), w]));
  const plugAfter = byStableAfter.get(PLUG_STABLE);
  const unplugAfter = byStableAfter.get(UNPLUG_STABLE);
  const r9SpeedAfter = pickWebhookFields(byStableAfter.get(R9_SPEED_STABLE));
  const r9IgnAfter = pickWebhookFields(byStableAfter.get(R9_IGN_STABLE));
  const plugSubsAfter = await getSubscriptions(headers, PLUG_ID);
  const unplugSubsAfter = await getSubscriptions(headers, UNPLUG_ID);
  const plugTokenIdsAfter = subscriptionsToTokenIds(plugSubsAfter);
  const unplugTokenIdsAfter = subscriptionsToTokenIds(unplugSubsAfter);
  const wobPlugAfter =
    (await vehicleHasWebhook(headers, contract, TOKEN_WOB_7503, PLUG_ID)) ||
    plugTokenIdsAfter.includes(TOKEN_WOB_7503);

  const {
    plugSubs: plugSubsBefore,
    unplugSubs: unplugSubsBefore,
    plugTokenIds: plugTokenIdsBefore,
    unplugTokenIds: unplugTokenIdsBefore,
    r9SpeedBefore,
    r9IgnBefore,
    plug: plugBefore,
  } = preflight;
  const semanticsPreserved = plugSemanticsMatch(plugAfter);

  out.after = {
    plug: pickWebhookFields(plugAfter),
    unplug: pickWebhookFields(unplugAfter),
    r9Speed: r9SpeedAfter,
    r9Ignition: r9IgnAfter,
    plugSubscriptionAssetDidCount: plugSubsAfter.length,
    plugSubscriptionTokenIds: plugTokenIdsAfter,
    unplugSubscriptionAssetDidCount: unplugSubsAfter.length,
    unplugSubscriptionTokenIds: unplugTokenIdsAfter,
    token192922PlugSubscribed: wobPlugAfter,
    plugEnabled: plugAfter?.status === 'enabled',
    unplugEnabled: unplugAfter?.status === 'enabled',
    semanticsPreserved,
    plugSubscriptionsUnchanged:
      plugSubsBefore.length === plugSubsAfter.length &&
      JSON.stringify(plugSubsBefore) === JSON.stringify(plugSubsAfter),
    unplugSubscriptionsUnchanged:
      unplugSubsBefore.length === unplugSubsAfter.length &&
      JSON.stringify(unplugSubsBefore) === JSON.stringify(unplugSubsAfter),
    r9Untouched:
      JSON.stringify(r9SpeedBefore) === JSON.stringify(r9SpeedAfter) &&
      JSON.stringify(r9IgnBefore) === JSON.stringify(r9IgnAfter),
  };

  if (plugAfter?.id !== PLUG_ID) out.abort = true;
  if (plugAfter?.status !== 'enabled') out.abort = true;
  if (unplugAfter?.status !== 'enabled') out.abort = true;
  if (!semanticsPreserved) out.abort = true;
  if (!plugTokenIdsBefore.includes(TOKEN_WOB_7503)) out.abort = true;
  if (!out.after.token192922PlugSubscribed && !plugTokenIdsAfter.includes(TOKEN_WOB_7503)) out.abort = true;
  if (!out.after.plugSubscriptionsUnchanged) out.abort = true;
  if (!out.after.unplugSubscriptionsUnchanged) out.abort = true;
  if (!out.after.r9Untouched) out.abort = true;

  out.success = !out.abort;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.abort ? 1 : 0);
} catch (e) {
  out.abort = true;
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
