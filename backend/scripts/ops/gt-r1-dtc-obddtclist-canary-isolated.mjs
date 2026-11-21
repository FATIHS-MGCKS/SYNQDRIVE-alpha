/**
 * DTC obdDTCList isolated canary — Topology A (KS MS 661 / token 187361).
 *
 * Read-only: node .../gt-r1-dtc-obddtclist-canary-isolated.mjs
 * Schema probe (create disabled + delete): --validate-schema-only --execute --confirm-canary=...
 * Activate: --execute --confirm-canary=dtc-ks-ms-661-obddtclist-isolated-canary --phase=activate
 * Teardown: --execute --confirm-canary=... --phase=teardown
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import {
  CREATE_TEMP_INITIAL_STATUS,
  LEGACY_GLOBAL_PLUG_ID,
  UNPLUG_ID,
  buildProfileSemantics,
  buildTempWebhookPayload,
  findTempDefinitionsForProfile,
  parseCliArgs,
  resolveExecutionMode,
  resolveCanaryProfile,
  subscriptionsToTokenIds,
  verifyTempDefinition,
} from './gt-r1-dtc-obddtclist-canary-isolated.lib.mjs';

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

function normalizeAssetDid(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return entry.assetDID ?? entry.assetDid ?? entry.vehicle ?? entry.did ?? null;
  }
  return String(entry);
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

async function getWebhookSubscriptions(headers, webhookId) {
  const raw = (await axios.get(`${API}/v1/webhooks/${webhookId}`, { headers })).data;
  const list = Array.isArray(raw) ? raw : raw?.vehicles ?? raw?.assetDIDs ?? [];
  return list.map(normalizeAssetDid).filter(Boolean).map(String);
}

async function vehicleHasWebhook(headers, contract, tokenId, webhookId) {
  const did = assetDid(contract, tokenId);
  const raw = (await axios.get(`${API}/v1/webhooks/vehicles/${did}`, { headers })).data;
  const links = Array.isArray(raw) ? raw : raw?.webhooks ?? [];
  return links.some((e) => String(e.webhookId ?? e.id ?? '') === webhookId);
}

async function subscribeIdempotent(headers, contract, webhookId, tokenId) {
  if (await vehicleHasWebhook(headers, contract, tokenId, webhookId)) {
    return { ok: true, idempotent: true };
  }
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

async function putTempStatus(headers, tempId, semantics, targetURL, verificationToken, status) {
  return axios.put(
    `${API}/v1/webhooks/${tempId}`,
    buildTempWebhookPayload(semantics, targetURL, verificationToken, status),
    { headers, validateStatus: () => true, timeout: 15000 },
  );
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

function snapshotLegacyTriggers(webhooks) {
  const byStable = new Map(webhooks.map((w) => [stableId(w.id), pickWebhookFields(w)]));
  return {
    plug: byStable.get(stableId(LEGACY_GLOBAL_PLUG_ID)),
    unplug: byStable.get(stableId(UNPLUG_ID)),
    r9Speed: byStable.get('9eeb7158afee'),
    r9Ignition: byStable.get('5d611d470eab'),
    rpm: byStable.get('1f96faea6569'),
  };
}

const cli = parseCliArgs(process.argv.slice(2));
const execution = resolveExecutionMode(cli);
const profileResolved = resolveCanaryProfile(cli.canaryProfile);
if (!profileResolved.ok) {
  console.log(JSON.stringify({ abort: true, reason: profileResolved.reason }, null, 2));
  process.exit(1);
}
const activeProfile = profileResolved.profile;

const envPath = process.env.BACKEND_ENV_PATH || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract =
  env.DIMO_VEHICLE_NFT_CONTRACT ||
  env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ||
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const targetURL = `${(env.DIMO_WEBHOOK_BASE_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '')}/api/v1/webhooks/dimo`;
const profileSemantics = buildProfileSemantics(activeProfile);
const verificationToken = (env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '').trim();

const out = {
  sessionUtc: new Date().toISOString(),
  mode: execution.mode,
  phase: cli.phase,
  canaryProfile: activeProfile.profileKey,
  providerSchema: profileSemantics,
  authorized: execution.authorized,
  steps: [],
  abort: false,
};

try {
  const headers = await authenticate(env);
  const webhooksBefore = await listWebhooks(headers);
  out.before = {
    legacyTriggers: snapshotLegacyTriggers(webhooksBefore),
    existingTemp: findTempDefinitionsForProfile(webhooksBefore, activeProfile).map(pickWebhookFields),
  };

  if (execution.mode === 'READ_ONLY' && !cli.validateSchemaOnly) {
    out.readOnlyComplete = true;
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!verificationToken) {
    out.abort = true;
    out.reason = 'DIMO_WEBHOOK_VERIFICATION_TOKEN missing';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  if (out.before.legacyTriggers.plug?.status === 'enabled') {
    out.abort = true;
    out.reason = 'legacy_global_plug_enabled_abort';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const schemaPayload = buildTempWebhookPayload(
    profileSemantics,
    targetURL,
    verificationToken,
    CREATE_TEMP_INITIAL_STATUS,
  );

  if (cli.validateSchemaOnly || execution.mode === 'SCHEMA_VALIDATE') {
    const createRes = await axios.post(`${API}/v1/webhooks`, schemaPayload, {
      headers,
      validateStatus: () => true,
      timeout: 30000,
    });
    out.schemaValidation = {
      httpStatus: createRes.status,
      body: createRes.data,
      ok: createRes.status >= 200 && createRes.status < 300 && Boolean(createRes.data?.id),
    };
    if (out.schemaValidation.ok) {
      const tempId = createRes.data.id;
      const wh = pickWebhookFields((await listWebhooks(headers)).find((w) => w.id === tempId));
      out.schemaValidation.verifiedDefinition = wh;
      await deleteWebhookIdempotent(headers, tempId);
      out.schemaValidation.cleanedUp = true;
    } else {
      out.abort = true;
      out.reason = 'provider_schema_rejected';
    }
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.abort ? 1 : 0);
  }

  if (!execution.authorized) {
    out.abort = true;
    out.reason = execution.reason ?? 'not_authorized';
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const plugSubsBefore = subscriptionsToTokenIds(
    await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
  );

  if (cli.phase === 'activate') {
    let temps = findTempDefinitionsForProfile(webhooksBefore, activeProfile);
    if (temps.length > 1) {
      out.abort = true;
      out.reason = 'multiple_temp_definitions';
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
    let tempId = temps[0]?.id ?? null;
    if (!tempId) {
      const createRes = await axios.post(`${API}/v1/webhooks`, schemaPayload, { headers, timeout: 30000 });
      tempId = createRes.data?.id;
      out.steps.push({ step: 'CREATE_DISABLED', webhookId: tempId, httpStatus: createRes.status });
    } else {
      out.steps.push({ step: 'REUSE_EXISTING_TEMP', webhookId: tempId });
    }

    const listed = pickWebhookFields((await listWebhooks(headers)).find((w) => w.id === tempId));
    const defOk = verifyTempDefinition(listed, targetURL, profileSemantics);
    out.steps.push({
      step: 'VERIFY_TEMP_DEFINITION',
      ok: defOk.ok && listed?.status === 'disabled',
      defOk,
      status: listed?.status,
    });
    if (!defOk.ok || listed?.status !== 'disabled') {
      out.abort = true;
      out.reason = 'verify_temp_definition_failed';
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const sub = await subscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
    out.steps.push({ step: 'SUBSCRIBE_WHILE_DISABLED', tokenId: activeProfile.tokenId, ...sub });

    const subs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
    out.subscriberTokenIds = subs;
    out.subscriberCount = subs.length;
    if (subs.length !== 1 || subs[0] !== activeProfile.tokenId) {
      out.abort = true;
      out.reason = 'subscriber_verification_failed';
      await putTempStatus(headers, tempId, profileSemantics, targetURL, verificationToken, 'disabled');
      await unsubscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
      await deleteWebhookIdempotent(headers, tempId);
      out.rollbackAttempted = true;
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const plugSubsMid = subscriptionsToTokenIds(
      await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
    );
    if (JSON.stringify(plugSubsBefore) !== JSON.stringify(plugSubsMid)) {
      out.abort = true;
      out.reason = 'legacy_plug_subscribers_changed_abort';
      await unsubscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
      await deleteWebhookIdempotent(headers, tempId);
      out.rollbackAttempted = true;
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const enableRes = await putTempStatus(
      headers,
      tempId,
      profileSemantics,
      targetURL,
      verificationToken,
      'enabled',
    );
    out.steps.push({ step: 'ENABLE_TEMP', httpStatus: enableRes.status });
    const enabledWh = pickWebhookFields((await listWebhooks(headers)).find((w) => w.id === tempId));
    out.tempWebhookId = tempId;
    out.enableResult = {
      status: enabledWh?.status,
      failureCount: enabledWh?.failureCount,
      ok: String(enabledWh?.status).toLowerCase() === 'enabled' && (enabledWh?.failureCount ?? 0) === 0,
    };
    if (!out.enableResult.ok) {
      out.abort = true;
      out.reason = 'enable_verification_failed';
      await putTempStatus(headers, tempId, profileSemantics, targetURL, verificationToken, 'disabled');
      await unsubscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
      await deleteWebhookIdempotent(headers, tempId);
      out.rollbackAttempted = true;
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    out.activatedAtUtc = new Date().toISOString();
    out[activeProfile.activatedAtOutputKey] = out.activatedAtUtc;
  }

  if (cli.phase === 'teardown') {
    const temps = findTempDefinitionsForProfile(webhooksBefore, activeProfile);
    if (temps.length === 0) {
      out.teardown = { idempotent: true, reason: 'no_temp' };
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    const tempId = temps[0].id;
    await putTempStatus(headers, tempId, profileSemantics, targetURL, verificationToken, 'disabled');
    await unsubscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
    await deleteWebhookIdempotent(headers, tempId);
    out.teardown = { tempWebhookId: tempId, completed: true };
  }

  out.after = {
    legacyTriggers: snapshotLegacyTriggers(await listWebhooks(headers)),
    temp: findTempDefinitionsForProfile(await listWebhooks(headers), activeProfile).map(pickWebhookFields),
  };
  out.success = !out.abort;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.abort ? 1 : 0);
} catch (e) {
  out.abort = true;
  out.error = e.message;
  if (e.response) {
    out.httpStatus = e.response.status;
    out.responseData = e.response.data;
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
