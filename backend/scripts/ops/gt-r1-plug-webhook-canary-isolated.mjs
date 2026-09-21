/**
 * VDC OBD PLUG — topology A isolated canary (temporary webhook, WOB-only subscribe).
 *
 * Activate order: CREATE disabled → verify → SUBSCRIBE WOB → verify WOB-only → ENABLE → verify → record activatedAt.
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
  CREATE_TEMP_INITIAL_STATUS,
  ACTIVATION_SEQUENCE,
  PARTIAL_ROLLBACK_SEQUENCE,
  TEARDOWN_SEQUENCE,
  parseIsolatedCliArgs,
  resolveIsolatedExecutionMode,
  buildTempWebhookPayload,
  verifyTempDefinition,
  validateExistingTempBeforeActivate,
  validatePreEnableWobOnly,
  subscriptionsToTokenIds,
  buildPostActivateVerification,
  postActivateVerificationPasses,
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

function findTempCanary(webhooks) {
  return webhooks.filter((w) => w.displayName === TEMP_PLUG_DISPLAY_NAME);
}

async function getWebhookFromList(headers, webhookId) {
  const webhooks = await listWebhooks(headers);
  return webhooks.find((w) => String(w.id) === String(webhookId)) ?? null;
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

async function putTempStatus(headers, tempId, targetURL, verificationToken, status) {
  return axios.put(
    `${API}/v1/webhooks/${tempId}`,
    buildTempWebhookPayload(TEMP_PLUG_SEMANTICS, targetURL, verificationToken, status),
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

/** Explicit partial activation rollback: DISABLE → UNSUBSCRIBE → DELETE */
async function explicitPartialActivationRollback(headers, contract, tempId, targetURL, verificationToken, stepsOut) {
  const results = [];
  try {
    const disableRes = await putTempStatus(headers, tempId, targetURL, verificationToken, 'disabled');
    results.push({ step: 'ROLLBACK_DISABLE_TEMP', httpStatus: disableRes.status });
    stepsOut.push(results[results.length - 1]);
  } catch (e) {
    results.push({ step: 'ROLLBACK_DISABLE_TEMP', error: e.message });
    stepsOut.push(results[results.length - 1]);
  }
  try {
    const unsub = await unsubscribeIdempotent(headers, contract, tempId, TOKEN_WOB_7503);
    results.push({ step: 'ROLLBACK_UNSUBSCRIBE_WOB', ...unsub });
    stepsOut.push(results[results.length - 1]);
  } catch (e) {
    results.push({ step: 'ROLLBACK_UNSUBSCRIBE_WOB', error: e.message });
    stepsOut.push(results[results.length - 1]);
  }
  try {
    const del = await deleteWebhookIdempotent(headers, tempId);
    results.push({ step: 'ROLLBACK_DELETE_TEMP', ...del });
    stepsOut.push(results[results.length - 1]);
  } catch (e) {
    results.push({ step: 'ROLLBACK_DELETE_TEMP', error: e.message });
    stepsOut.push(results[results.length - 1]);
  }
  return { sequence: PARTIAL_ROLLBACK_SEQUENCE, results };
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
  activationSequence: ACTIVATION_SEQUENCE,
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
    createTempInitialStatusDisabled: true,
    enableIsFinalMutatingActivationStep: true,
    preexistingEnabledTempAbortSupported: true,
    foreignSubscriberAbortSupported: true,
    multipleTempAbortSupported: true,
    partialActivationRollbackExplicit: true,
    rollbackIdempotent: true,
    teardownFullPostconditionVerification: true,
    legacyGlobalPlugUntouchedOnActivate: true,
    unplugWebhookUntouched: true,
    notLabeledWobOnlyForLegacyGlobalEnable: true,
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
  const legacyPlugSubsBefore = subscriptionsToTokenIds(
    await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
  );

  if (cli.dryRunPlan && !execution.authorized) {
    out.dryRunPlan = {
      activate: [
        `POST /v1/webhooks status=${CREATE_TEMP_INITIAL_STATUS}`,
        'VERIFY temp definition (metric, condition, callback, disabled); legacy PLUG disabled',
        `POST subscribe WOB ${TOKEN_WOB_7503} while temp disabled`,
        'VERIFY TEMP_CANARY_SUBSCRIBER_COUNT=1 and token 192922 only',
        'PUT status=enabled',
        'VERIFY provider enabled; then record PLUG_WEBHOOK_CANARY_ACTIVATED_AT',
      ],
      teardown: TEARDOWN_SEQUENCE,
      partialRollbackOnFailure: PARTIAL_ROLLBACK_SEQUENCE,
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
    const existingCheck = validateExistingTempBeforeActivate(out.before.temporaryCanaryDefinitions ?? []);
    if (existingCheck.abort) {
      out.abort = true;
      out.reason = existingCheck.reason;
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    let tempId = existingCheck.existing?.id ?? null;
    let createdThisRun = false;

    if (!tempId) {
      const createPayload = buildTempWebhookPayload(
        TEMP_PLUG_SEMANTICS,
        targetURL,
        verificationToken,
        CREATE_TEMP_INITIAL_STATUS,
      );
      const createRes = await axios.post(`${API}/v1/webhooks`, createPayload, { headers, timeout: 30000 });
      tempId = createRes.data?.id;
      createdThisRun = true;
      out.steps.push({
        step: 'CREATE_DISABLED',
        tempWebhookId: tempId,
        stableId: stableId(tempId),
        initialStatus: CREATE_TEMP_INITIAL_STATUS,
      });
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      const preSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
      const foreignCheck = validatePreEnableWobOnly(preSubs);
      if (preSubs.length > 0 && foreignCheck.abort && foreignCheck.reason === 'foreign_subscriber_abort') {
        out.abort = true;
        out.reason = 'foreign_subscriber_abort';
        out.subscriberAnalysis = foreignCheck.analysis;
        console.log(JSON.stringify(out, null, 2));
        process.exit(1);
      }
      out.steps.push({ step: 'CREATE_DISABLED', skipped: true, tempWebhookId: tempId });
    }

    let tempWebhook = pickWebhookFields(await getWebhookFromList(headers, tempId));
    const verifyAfterCreate = verifyTempDefinition(tempWebhook, targetURL);
    out.steps.push({ step: 'VERIFY_TEMP_DEFINITION', ...verifyAfterCreate, status: tempWebhook?.status });
    if (
      !verifyAfterCreate.ok ||
      String(tempWebhook?.status).toLowerCase() !== CREATE_TEMP_INITIAL_STATUS
    ) {
      out.abort = true;
      out.reason = 'verify_temp_definition_failed';
      if (createdThisRun) {
        out.partialRollback = await explicitPartialActivationRollback(
          headers,
          contract,
          tempId,
          targetURL,
          verificationToken,
          out.steps,
        );
      }
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
    if (out.before.legacyGlobalPlug?.status === 'enabled') {
      out.abort = true;
      out.reason = 'legacy_global_plug_enabled_during_activate';
      if (createdThisRun) {
        out.partialRollback = await explicitPartialActivationRollback(
          headers,
          contract,
          tempId,
          targetURL,
          verificationToken,
          out.steps,
        );
      }
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const sub = await subscribeIdempotent(headers, contract, tempId, TOKEN_WOB_7503);
    out.steps.push({ step: 'SUBSCRIBE_WOB_WHILE_DISABLED', tokenId: TOKEN_WOB_7503, ...sub });

    const preEnableSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
    const preEnableGate = validatePreEnableWobOnly(preEnableSubs);
    out.steps.push({ step: 'VERIFY_WOB_ONLY_SUBSCRIBER', ...preEnableGate.analysis });
    if (preEnableGate.abort) {
      out.abort = true;
      out.reason = preEnableGate.reason;
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        targetURL,
        verificationToken,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const enableRes = await putTempStatus(headers, tempId, targetURL, verificationToken, 'enabled');
    out.steps.push({ step: 'ENABLE_TEMP', httpStatus: enableRes.status });
    if (enableRes.status < 200 || enableRes.status >= 300) {
      out.abort = true;
      out.reason = 'enable_temp_non_2xx';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        targetURL,
        verificationToken,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    tempWebhook = pickWebhookFields(await getWebhookFromList(headers, tempId));
    const enabledOk = String(tempWebhook?.status).toLowerCase() === 'enabled';
    out.steps.push({ step: 'VERIFY_ENABLED', ok: enabledOk, status: tempWebhook?.status });
    if (!enabledOk) {
      out.abort = true;
      out.reason = 'verify_enabled_failed';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        targetURL,
        verificationToken,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const postSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
    const legacyPlugSubsAfter = subscriptionsToTokenIds(
      await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
    );
    const afterState = await inspectState(headers, contract);
    out.activationVerification = buildPostActivateVerification({
      tempWebhook,
      subscriberTokenIds: postSubs,
      legacyGlobalPlug: afterState.legacyGlobalPlug,
      legacyUnplug: afterState.legacyUnplug,
      legacyPlugSubscriptionTokenIdsBefore: legacyPlugSubsBefore,
      legacyPlugSubscriptionTokenIdsAfter: legacyPlugSubsAfter,
      expectedTargetURL: targetURL,
    });
    if (!postActivateVerificationPasses(out.activationVerification)) {
      out.abort = true;
      out.reason = 'post_activate_verification_failed';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        targetURL,
        verificationToken,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    out.plugWebhookCanaryActivatedAt = new Date().toISOString();
    out.steps.push({ step: 'RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT', at: out.plugWebhookCanaryActivatedAt });
    out.tempWebhookId = tempId;
  }

  if (cli.phase === 'teardown') {
    const temps = out.before.temporaryCanaryDefinitions ?? [];
    if (temps.length === 0) {
      out.teardownVerification = { TEMP_DEFINITION_ABSENT: true };
      out.message = 'No temp canary webhook to teardown (idempotent no-op).';
      out.after = await inspectState(headers, contract);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    out.teardownVerification = { perWebhook: [] };
    for (const t of temps) {
      const tempId = t.id;
      const disableRes = await putTempStatus(headers, tempId, targetURL, verificationToken, 'disabled');
      out.steps.push({ step: 'DISABLE_TEMP', webhookId: tempId, httpStatus: disableRes.status });
      const afterDisable = pickWebhookFields(await getWebhookFromList(headers, tempId));
      const disabledOk = String(afterDisable?.status).toLowerCase() === 'disabled';
      out.steps.push({ step: 'VERIFY_DISABLED', ok: disabledOk, status: afterDisable?.status });

      const unsub = await unsubscribeIdempotent(headers, contract, tempId, TOKEN_WOB_7503);
      out.steps.push({ step: 'UNSUBSCRIBE_WOB', webhookId: tempId, ...unsub });
      const stillLinked = await vehicleHasWebhook(headers, contract, TOKEN_WOB_7503, tempId);
      out.steps.push({ step: 'VERIFY_UNSUBSCRIBED', ok: !stillLinked });

      const del = await deleteWebhookIdempotent(headers, tempId);
      out.steps.push({ step: 'DELETE_TEMP', webhookId: tempId, ...del });
      const remaining = findTempCanary(await listWebhooks(headers));
      const absent = !remaining.some((w) => String(w.id) === String(tempId));
      out.steps.push({ step: 'VERIFY_TEMP_ABSENT', ok: absent });
      out.teardownVerification.perWebhook.push({
        webhookId: tempId,
        disabledOk,
        unsubscribedOk: !stillLinked,
        absentOk: absent,
      });
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
