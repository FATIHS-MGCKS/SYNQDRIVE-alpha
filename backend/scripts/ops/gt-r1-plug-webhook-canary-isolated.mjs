/**
 * VDC OBD PLUG — topology A isolated canary (temporary webhook, WOB-only subscribe).
 *
 * Default READ_ONLY inspect (provider GET only):
 *   node backend/scripts/ops/gt-r1-plug-webhook-canary-isolated.mjs
 *
 * Dry-run mutation plan (no API writes):
 *   node backend/scripts/ops/gt-r1-plug-webhook-canary-isolated.mjs --dry-run-plan --phase=activate
 *
 * Authorized activate (CREATE → SUBSCRIBE WOB → ENABLE temp only; legacy global PLUG untouched):
 *   node backend/scripts/ops/gt-r1-plug-webhook-canary-isolated.mjs \
 *     --execute --phase=activate --confirm-canary=vdc-wob-7503-plug-isolated-canary
 *
 * Authorized teardown (DISABLE → UNSUBSCRIBE → DELETE temp; idempotent 404 tolerated):
 *   node backend/scripts/ops/gt-r1-plug-webhook-canary-isolated.mjs \
 *     --execute --phase=teardown --confirm-canary=vdc-wob-7503-plug-isolated-canary
 *
 * NOT a WOB-only canary: enabling legacy global PLUG (`7a0562d3-…`) — use gt-r1-plug-webhook-restoration.mjs
 * only with explicit blast-radius review.
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import {
  CANARY_CONFIRM_VALUE,
  TOKEN_WOB_7503,
  LEGACY_GLOBAL_PLUG_ID,
  UNPLUG_ID,
  TEMP_PLUG_DISPLAY_NAME,
  TEMP_PLUG_SEMANTICS,
  parseIsolatedCliArgs,
  resolveIsolatedExecutionMode,
} from './gt-r1-plug-webhook-canary-isolated.lib.mjs';

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

function assetDid(contract, tokenId) {
  return `did:erc721:137:${contract}:${tokenId}`;
}

function pickWebhookFields(w) {
  if (!w) return null;
  return {
    id: w.id,
    stableId: stableId(w.id),
    displayName: w.displayName,
    metricName: w.metricName,
    condition: w.condition,
    targetURL: w.targetURL ?? w.url,
    status: w.status,
    failureCount: w.failureCount,
  };
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

function findTempCanary(webhooks) {
  return webhooks.filter((w) => w.displayName === TEMP_PLUG_DISPLAY_NAME);
}

async function vehicleHasWebhook(headers, contract, tokenId, webhookId) {
  const did = assetDid(contract, tokenId);
  const raw = (await axios.get(`${API}/v1/webhooks/vehicles/${did}`, { headers })).data;
  const links = Array.isArray(raw) ? raw : raw?.webhooks ?? [];
  return links.some((e) => String(e.webhookId ?? e.id ?? '') === webhookId);
}

async function subscribeIdempotent(headers, contract, webhookId, tokenId) {
  const already = await vehicleHasWebhook(headers, contract, tokenId, webhookId);
  if (already) return { ok: true, idempotent: true };
  const did = encodeURIComponent(assetDid(contract, tokenId));
  await axios.post(`${API}/v1/webhooks/${webhookId}/subscribe/${did}`, {}, { headers, timeout: 15000 });
  return { ok: true, idempotent: false };
}

async function unsubscribeIdempotent(headers, contract, webhookId, tokenId) {
  const did = encodeURIComponent(assetDid(contract, tokenId));
  try {
    await axios.delete(`${API}/v1/webhooks/${webhookId}/unsubscribe/${did}`, { headers, timeout: 15000 });
    return { ok: true };
  } catch (e) {
    if (e.response?.status === 404) return { ok: true, idempotent: true };
    throw e;
  }
}

async function deleteWebhookIdempotent(headers, webhookId) {
  try {
    await axios.delete(`${API}/v1/webhooks/${webhookId}`, { headers, timeout: 15000 });
    return { ok: true };
  } catch (e) {
    if (e.response?.status === 404) return { ok: true, idempotent: true };
    throw e;
  }
}

async function inspectState(headers, contract) {
  const webhooks = await listWebhooks(headers);
  const legacyPlug = webhooks.find((w) => w.id === LEGACY_GLOBAL_PLUG_ID);
  const legacyUnplug = webhooks.find((w) => w.id === UNPLUG_ID);
  const temps = findTempCanary(webhooks);
  const wobAssetDid = assetDid(contract, TOKEN_WOB_7503);
  let wobLinks = [];
  try {
    const raw = (await axios.get(`${API}/v1/webhooks/vehicles/${wobAssetDid}`, { headers })).data;
    wobLinks = Array.isArray(raw) ? raw : raw?.webhooks ?? [];
  } catch {
    wobLinks = [];
  }
  return {
    legacyGlobalPlug: pickWebhookFields(legacyPlug),
    legacyUnplug: pickWebhookFields(legacyUnplug),
    temporaryCanaryDefinitions: temps.map(pickWebhookFields),
    wobVehicleLinks: wobLinks.map((l) => ({
      webhookId: l.webhookId ?? l.id,
      stableId: stableId(l.webhookId ?? l.id ?? ''),
    })),
    topology: 'A_TEMPORARY_PARALLEL_PLUG_WEBHOOK',
    notWobOnlyIfLegacyGlobalPlugEnabled: true,
    globalLegacyPlugEnableBlastRadiusNote:
      'Enabling 7a0562d3-… activates all tokens on legacy PLUG subscription list (6), not WOB-only.',
  };
}

const cli = parseIsolatedCliArgs(process.argv.slice(2));
const execution = resolveIsolatedExecutionMode(cli);

const envPath = process.env.BACKEND_ENV_PATH || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const callbackBase = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '');
const targetURL = `${callbackBase}/api/v1/webhooks/dimo`;

const out = {
  sessionUtc: new Date().toISOString(),
  mode: execution.mode,
  phase: cli.phase,
  executionGate: {
    executeFlag: cli.execute,
    confirmCanary: cli.confirmCanary,
    dryRunPlan: cli.dryRunPlan,
    authorized: execution.authorized,
    gateReason: execution.reason ?? null,
    expectedConfirm: CANARY_CONFIRM_VALUE,
  },
  opsSafety: {
    defaultModeReadOnly: true,
    explicitExecuteRequired: true,
    exactCanaryConfirmationRequired: true,
    dryRunSupported: true,
    legacyGlobalPlugUntouchedOnActivate: true,
    unplugWebhookUntouched: true,
    notLabeledWobOnlyForLegacyGlobalEnable: true,
    rollbackTeardownPhase: 'teardown',
    idempotentSubscribe: true,
    idempotentTeardown: true,
  },
  abort: false,
  before: null,
  steps: [],
  after: null,
};

console.error(`MODE=${execution.mode} PHASE=${cli.phase}`);

try {
  const headers = await authenticate(env);
  out.before = await inspectState(headers, contract);

  if (cli.dryRunPlan && !execution.authorized) {
    out.dryRunPlan = {
      activate: [
        'POST /v1/webhooks (temp PLUG semantics, status=enabled after verification wait)',
        `POST /v1/webhooks/{tempId}/subscribe/${assetDid(contract, TOKEN_WOB_7503)}`,
        'PUT /v1/webhooks/{tempId} status=enabled',
        'VERIFY legacy PLUG 7a0562d3-… remains disabled',
      ],
      teardown: [
        'PUT /v1/webhooks/{tempId} status=disabled',
        `DELETE /v1/webhooks/{tempId}/unsubscribe/${assetDid(contract, TOKEN_WOB_7503)}`,
        'DELETE /v1/webhooks/{tempId}',
      ],
    };
    out.message = 'Dry-run plan only; no provider mutation.';
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!execution.authorized) {
    out.readOnlyComplete = true;
    out.message =
      'Read-only inspect complete. For WOB-only canary use topology A (this script). Do not enable legacy global PLUG for isolated test.';
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const verificationToken = env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  if (!verificationToken) {
    out.abort = true;
    out.reason = 'DIMO_WEBHOOK_VERIFICATION_TOKEN missing';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (out.before.legacyGlobalPlug?.status === 'enabled') {
    out.abort = true;
    out.reason = 'legacy_global_plug_already_enabled_abort';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (cli.phase === 'activate') {
    const existing = out.before.temporaryCanaryDefinitions ?? [];
    if (existing.length > 1) {
      out.abort = true;
      out.reason = 'multiple_temp_canary_definitions_conflict';
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    let tempId = existing[0]?.id ?? null;
    if (!tempId) {
      const createPayload = {
        ...TEMP_PLUG_SEMANTICS,
        targetURL,
        status: 'enabled',
        verificationToken,
      };
      const createRes = await axios.post(`${API}/v1/webhooks`, createPayload, { headers, timeout: 30000 });
      tempId = createRes.data?.id;
      out.steps.push({ step: 'CREATE', tempWebhookId: tempId, stableId: stableId(tempId) });
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      out.steps.push({ step: 'CREATE', skipped: true, tempWebhookId: tempId });
    }

    const sub = await subscribeIdempotent(headers, contract, tempId, TOKEN_WOB_7503);
    out.steps.push({ step: 'SUBSCRIBE_WOB', tokenId: TOKEN_WOB_7503, ...sub });

    const putRes = await axios.put(
      `${API}/v1/webhooks/${tempId}`,
      { ...TEMP_PLUG_SEMANTICS, targetURL, status: 'enabled', verificationToken },
      { headers, validateStatus: () => true },
    );
    out.steps.push({ step: 'ENABLE_TEMP', httpStatus: putRes.status });
    if (putRes.status < 200 || putRes.status >= 300) {
      out.abort = true;
      out.reason = 'enable_temp_non_2xx';
      out.partialRollbackAttempted = true;
      try {
        await deleteWebhookIdempotent(headers, tempId);
        out.steps.push({ step: 'ROLLBACK_DELETE_TEMP', ok: true });
      } catch (e) {
        out.steps.push({ step: 'ROLLBACK_DELETE_TEMP', error: e.message });
      }
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    out.plugWebhookCanaryActivatedAt = new Date().toISOString();
    out.tempWebhookId = tempId;
  }

  if (cli.phase === 'teardown') {
    const temps = out.before.temporaryCanaryDefinitions ?? [];
    if (temps.length === 0) {
      out.message = 'No temp canary webhook to teardown (idempotent no-op).';
      out.after = await inspectState(headers, contract);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    for (const t of temps) {
      const tempId = t.id;
      const disableRes = await axios.put(
        `${API}/v1/webhooks/${tempId}`,
        {
          ...TEMP_PLUG_SEMANTICS,
          targetURL,
          status: 'disabled',
          verificationToken,
        },
        { headers, validateStatus: () => true },
      );
      out.steps.push({ step: 'DISABLE_TEMP', webhookId: tempId, httpStatus: disableRes.status });
      const unsub = await unsubscribeIdempotent(headers, contract, tempId, TOKEN_WOB_7503);
      out.steps.push({ step: 'UNSUBSCRIBE_WOB', webhookId: tempId, ...unsub });
      const del = await deleteWebhookIdempotent(headers, tempId);
      out.steps.push({ step: 'DELETE_TEMP', webhookId: tempId, ...del });
    }
    out.plugWebhookCanaryDeactivatedAt = new Date().toISOString();
  }

  out.after = await inspectState(headers, contract);
  if (out.after.legacyGlobalPlug?.id !== LEGACY_GLOBAL_PLUG_ID) out.abort = true;
  if (out.after.legacyUnplug?.status !== 'enabled') out.abort = true;
  if (cli.phase === 'activate' && out.after.legacyGlobalPlug?.status === 'enabled') out.abort = true;

  out.success = !out.abort;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.abort ? 1 : 0);
} catch (e) {
  out.abort = true;
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
