/**
 * VDC OBD PLUG — topology A isolated canary (allowlisted per-vehicle profiles).
 *
 * Activate order: CREATE disabled → verify → SUBSCRIBE profile token → verify single subscriber
 * → verify sibling canaries untouched → ENABLE → verify → record activatedAt.
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import {
  CANARY_PROFILES,
  LEGACY_GLOBAL_PLUG_ID,
  UNPLUG_ID,
  CREATE_TEMP_INITIAL_STATUS,
  ACTIVATION_SEQUENCE,
  PARTIAL_ROLLBACK_SEQUENCE,
  TEARDOWN_SEQUENCE,
  parseIsolatedCliArgs,
  resolveIsolatedExecutionMode,
  buildProfileSemantics,
  buildTempWebhookPayload,
  verifyTempDefinition,
  validateExistingTempBeforeActivate,
  validatePreEnableSingleTokenOnly,
  subscriptionsToTokenIds,
  buildPostActivateVerification,
  postActivateVerificationPasses,
  findTempDefinitionsForProfile,
  validateSiblingCanariesUntouched,
  resolveCanaryProfile,
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

async function explicitPartialActivationRollback(
  headers,
  contract,
  tempId,
  semantics,
  targetURL,
  verificationToken,
  profileTokenId,
  stepsOut,
) {
  try {
    const disableRes = await putTempStatus(headers, tempId, semantics, targetURL, verificationToken, 'disabled');
    stepsOut.push({ step: 'ROLLBACK_DISABLE_TEMP', httpStatus: disableRes.status });
  } catch (e) {
    stepsOut.push({ step: 'ROLLBACK_DISABLE_TEMP', error: e.message });
  }
  try {
    const unsub = await unsubscribeIdempotent(headers, contract, tempId, profileTokenId);
    stepsOut.push({ step: 'ROLLBACK_UNSUBSCRIBE_PROFILE_TOKEN', tokenId: profileTokenId, ...unsub });
  } catch (e) {
    stepsOut.push({ step: 'ROLLBACK_UNSUBSCRIBE_PROFILE_TOKEN', error: e.message });
  }
  try {
    const del = await deleteWebhookIdempotent(headers, tempId);
    stepsOut.push({ step: 'ROLLBACK_DELETE_TEMP', ...del });
  } catch (e) {
    stepsOut.push({ step: 'ROLLBACK_DELETE_TEMP', error: e.message });
  }
  return { sequence: PARTIAL_ROLLBACK_SEQUENCE };
}

async function buildProfileCanarySnapshot(headers, contract, webhooks, profile) {
  const temps = findTempDefinitionsForProfile(webhooks, profile).map(pickWebhookFields);
  const tempWebhook = temps[0] ?? null;
  let subscriberTokenIds = [];
  if (tempWebhook?.id) {
    subscriberTokenIds = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempWebhook.id));
  }
  return {
    profileKey: profile.profileKey,
    tokenId: profile.tokenId,
    temporaryCanaryDefinitions: temps,
    tempWebhook,
    subscriberTokenIds,
    TEMP_CANARY_SUBSCRIBER_COUNT: subscriberTokenIds.length,
    TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN:
      subscriberTokenIds.length === 1 && subscriberTokenIds[0] === profile.tokenId
        ? profile.tokenId
        : null,
  };
}

async function inspectState(headers, contract, focusProfile = null) {
  const webhooks = await listWebhooks(headers);
  const legacyPlug = webhooks.find((w) => w.id === LEGACY_GLOBAL_PLUG_ID);
  const legacyUnplug = webhooks.find((w) => w.id === UNPLUG_ID);

  const profileSnapshots = {};
  for (const profile of Object.values(CANARY_PROFILES)) {
    profileSnapshots[profile.profileKey] = await buildProfileCanarySnapshot(headers, contract, webhooks, profile);
  }

  return {
    legacyGlobalPlug: pickWebhookFields(legacyPlug),
    legacyUnplug: pickWebhookFields(legacyUnplug),
    canaryProfileModel: 'ALLOWLISTED_SINGLE_VEHICLE_PROFILES',
    arbitraryTokenInputAllowed: false,
    allowedProfiles: Object.keys(CANARY_PROFILES),
    profileSnapshots,
    focusProfile: focusProfile?.profileKey ?? null,
    topology: 'A_TEMPORARY_PARALLEL_PLUG_WEBHOOK',
    notWobOnlyIfLegacyGlobalPlugEnabled: true,
    globalLegacyPlugEnableBlastRadiusNote:
      'Enabling 7a0562d3-… activates all tokens on legacy PLUG subscription list (6), not WOB-only.',
  };
}

const cli = parseIsolatedCliArgs(process.argv.slice(2));
const execution = resolveIsolatedExecutionMode(cli);
const profileResolved = execution.profile ? { ok: true, profile: execution.profile } : resolveCanaryProfile(cli.canaryProfile);
if (!profileResolved.ok) {
  console.error(`MODE=READ_ONLY PHASE=${cli.phase} CANARY=${cli.canaryProfile ?? 'unset'}`);
  console.log(
    JSON.stringify(
      {
        abort: true,
        reason: profileResolved.reason,
        canaryProfile: cli.canaryProfile ?? null,
        arbitraryTokenInputAllowed: false,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
const activeProfile = profileResolved.profile;

const envPath = process.env.BACKEND_ENV_PATH || process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
const env = loadEnv(envPath);
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const callbackBase = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '');
const targetURL = `${callbackBase}/api/v1/webhooks/dimo`;
const profileSemantics = buildProfileSemantics(activeProfile);

const out = {
  sessionUtc: new Date().toISOString(),
  mode: execution.mode,
  phase: cli.phase,
  canaryProfile: activeProfile.profileKey,
  activationSequence: ACTIVATION_SEQUENCE,
  executionGate: {
    executeFlag: cli.execute,
    confirmCanary: cli.confirmCanary,
    canaryProfile: cli.canaryProfile,
    dryRunPlan: cli.dryRunPlan,
    authorized: execution.authorized,
    gateReason: execution.reason ?? null,
    expectedConfirm: activeProfile.confirmValue,
  },
  opsSafety: {
    defaultModeReadOnly: true,
    explicitExecuteRequired: true,
    exactCanaryConfirmationRequired: true,
    allowlistedProfilesOnly: true,
    arbitraryTokenCliRejected: true,
    dryRunSupported: true,
    createTempInitialStatusDisabled: true,
    enableIsFinalMutatingActivationStep: true,
    preexistingEnabledTempAbortSupported: true,
    foreignSubscriberAbortSupported: true,
    multipleTempPerProfileAbortSupported: true,
    siblingCanariesCoexistenceSupported: true,
    partialActivationRollbackExplicit: true,
    rollbackIdempotent: true,
    teardownProfileScoped: true,
    teardownFullPostconditionVerification: true,
    legacyGlobalPlugUntouchedOnActivate: true,
    unplugWebhookUntouched: true,
    ksRollbackCannotTouchWob: true,
    ksRollbackCannotTouchGlobalPlug: true,
    ksRollbackCannotTouchUnplug: true,
  },
  abort: false,
  before: null,
  steps: [],
  after: null,
};

console.error(`MODE=${execution.mode} PHASE=${cli.phase} CANARY=${activeProfile.profileKey}`);

try {
  const headers = await authenticate(env);
  out.before = await inspectState(headers, contract, activeProfile);
  const legacyPlugSubsBefore = subscriptionsToTokenIds(
    await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
  );

  if (cli.dryRunPlan && !execution.authorized) {
    out.dryRunPlan = {
      activate: [
        `POST /v1/webhooks status=${CREATE_TEMP_INITIAL_STATUS} displayName=${activeProfile.displayName}`,
        'VERIFY temp definition (metric, condition, callback, disabled); legacy PLUG disabled',
        `POST subscribe token ${activeProfile.tokenId} while temp disabled`,
        `VERIFY TEMP_CANARY_SUBSCRIBER_COUNT=1 and token ${activeProfile.tokenId} only`,
        'VERIFY sibling profile canaries untouched',
        'PUT status=enabled',
        `VERIFY provider enabled; record ${activeProfile.activatedAtOutputKey}`,
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
      'Read-only inspect complete. Use --canary=<PROFILE> with matching --confirm-canary for activate/teardown.';
    console.log(JSON.stringify(out, null, 2));
    process.exit(execution.reason === 'unknown_canary_profile' || execution.reason === 'missing_canary_profile' ? 1 : 0);
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

  const webhooksBeforeMutate = await listWebhooks(headers);

  if (cli.phase === 'activate') {
    const profileTemps = findTempDefinitionsForProfile(webhooksBeforeMutate, activeProfile).map(pickWebhookFields);
    const existingCheck = validateExistingTempBeforeActivate(profileTemps);
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
        profileSemantics,
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
        profileKey: activeProfile.profileKey,
      });
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      const preSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
      const foreignCheck = validatePreEnableSingleTokenOnly(preSubs, activeProfile.tokenId);
      if (preSubs.length > 0 && foreignCheck.abort && foreignCheck.reason === 'foreign_subscriber_abort') {
        out.abort = true;
        out.reason = 'foreign_subscriber_abort';
        out.subscriberAnalysis = foreignCheck.analysis;
        console.log(JSON.stringify(out, null, 2));
        process.exit(1);
      }
      out.steps.push({
        step: 'CREATE_DISABLED',
        skipped: true,
        tempWebhookId: tempId,
        profileKey: activeProfile.profileKey,
      });
    }

    let tempWebhook = pickWebhookFields(await getWebhookFromList(headers, tempId));
    const verifyAfterCreate = verifyTempDefinition(tempWebhook, targetURL, profileSemantics);
    out.steps.push({ step: 'VERIFY_TEMP_DEFINITION', ...verifyAfterCreate, status: tempWebhook?.status });
    if (!verifyAfterCreate.ok || String(tempWebhook?.status).toLowerCase() !== CREATE_TEMP_INITIAL_STATUS) {
      out.abort = true;
      out.reason = 'verify_temp_definition_failed';
      if (createdThisRun) {
        out.partialRollback = await explicitPartialActivationRollback(
          headers,
          contract,
          tempId,
          profileSemantics,
          targetURL,
          verificationToken,
          activeProfile.tokenId,
          out.steps,
        );
      }
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const sub = await subscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
    out.steps.push({
      step: 'SUBSCRIBE_WHILE_DISABLED',
      tokenId: activeProfile.tokenId,
      profileKey: activeProfile.profileKey,
      ...sub,
    });

    const preEnableSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
    const preEnableGate = validatePreEnableSingleTokenOnly(preEnableSubs, activeProfile.tokenId);
    out.steps.push({ step: 'VERIFY_ONLY_SUBSCRIBER', ...preEnableGate.analysis });
    if (preEnableGate.abort) {
      out.abort = true;
      out.reason = preEnableGate.reason;
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const siblingSnapshots = {};
    const webhooksMid = await listWebhooks(headers);
    for (const profile of Object.values(CANARY_PROFILES)) {
      if (profile.profileKey === activeProfile.profileKey) continue;
      const snap = await buildProfileCanarySnapshot(headers, contract, webhooksMid, profile);
      siblingSnapshots[profile.profileKey] = {
        tempWebhook: snap.tempWebhook,
        subscriberTokenIds: snap.subscriberTokenIds,
      };
    }
    const siblingGate = validateSiblingCanariesUntouched(siblingSnapshots, activeProfile);
    out.steps.push({ step: 'VERIFY_OTHER_PROFILE_CANARIES_UNTOUCHED', ok: siblingGate.ok, issues: siblingGate.issues });
    if (!siblingGate.ok) {
      out.abort = true;
      out.reason = 'sibling_canary_verification_failed';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    if (out.before.legacyGlobalPlug?.status === 'enabled') {
      out.abort = true;
      out.reason = 'legacy_global_plug_enabled_during_activate';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
        out.steps,
      );
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
    if (enableRes.status < 200 || enableRes.status >= 300) {
      out.abort = true;
      out.reason = 'enable_temp_non_2xx';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
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
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const postSubs = subscriptionsToTokenIds(await getWebhookSubscriptions(headers, tempId));
    const legacyPlugSubsAfter = subscriptionsToTokenIds(
      await getWebhookSubscriptions(headers, LEGACY_GLOBAL_PLUG_ID),
    );
    const afterState = await inspectState(headers, contract, activeProfile);
    out.activationVerification = buildPostActivateVerification({
      tempWebhook,
      subscriberTokenIds: postSubs,
      legacyGlobalPlug: afterState.legacyGlobalPlug,
      legacyUnplug: afterState.legacyUnplug,
      legacyPlugSubscriptionTokenIdsBefore: legacyPlugSubsBefore,
      legacyPlugSubscriptionTokenIdsAfter: legacyPlugSubsAfter,
      expectedTargetURL: targetURL,
      profile: activeProfile,
      semantics: profileSemantics,
    });
    if (!postActivateVerificationPasses(out.activationVerification)) {
      out.abort = true;
      out.reason = 'post_activate_verification_failed';
      out.partialRollback = await explicitPartialActivationRollback(
        headers,
        contract,
        tempId,
        profileSemantics,
        targetURL,
        verificationToken,
        activeProfile.tokenId,
        out.steps,
      );
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const activatedAt = new Date().toISOString();
    out[activeProfile.activatedAtOutputKey] = activatedAt;
    out.plugWebhookCanaryActivatedAt = activeProfile.profileKey === 'WOB_L_7503' ? activatedAt : out.plugWebhookCanaryActivatedAt;
    out.ksMxPlugWebhookCanaryActivatedAt =
      activeProfile.profileKey === 'KS_MX_2024' ? activatedAt : out.ksMxPlugWebhookCanaryActivatedAt;
    out.steps.push({
      step: 'RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT',
      at: activatedAt,
      profileKey: activeProfile.profileKey,
      outputKey: activeProfile.activatedAtOutputKey,
    });
    out.tempWebhookId = tempId;
  }

  if (cli.phase === 'teardown') {
    const temps = findTempDefinitionsForProfile(webhooksBeforeMutate, activeProfile).map(pickWebhookFields);
    if (temps.length === 0) {
      out.teardownVerification = { TEMP_DEFINITION_ABSENT: true, profileKey: activeProfile.profileKey };
      out.message = `No temp canary webhook for profile ${activeProfile.profileKey} (idempotent no-op).`;
      out.after = await inspectState(headers, contract, activeProfile);
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    if (temps.length > 1) {
      out.abort = true;
      out.reason = 'multiple_temp_canary_definitions_conflict';
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
    out.teardownVerification = { perWebhook: [], profileKey: activeProfile.profileKey };
    const tempId = temps[0].id;
    const disableRes = await putTempStatus(
      headers,
      tempId,
      profileSemantics,
      targetURL,
      verificationToken,
      'disabled',
    );
    out.steps.push({ step: 'DISABLE_TEMP', webhookId: tempId, httpStatus: disableRes.status });
    const afterDisable = pickWebhookFields(await getWebhookFromList(headers, tempId));
    const disabledOk = String(afterDisable?.status).toLowerCase() === 'disabled';
    out.steps.push({ step: 'VERIFY_DISABLED', ok: disabledOk, status: afterDisable?.status });

    const unsub = await unsubscribeIdempotent(headers, contract, tempId, activeProfile.tokenId);
    out.steps.push({ step: 'UNSUBSCRIBE_PROFILE_TOKEN', webhookId: tempId, tokenId: activeProfile.tokenId, ...unsub });
    const stillLinked = await vehicleHasWebhook(headers, contract, activeProfile.tokenId, tempId);
    out.steps.push({ step: 'VERIFY_UNSUBSCRIBED', ok: !stillLinked });

    const del = await deleteWebhookIdempotent(headers, tempId);
    out.steps.push({ step: 'DELETE_TEMP', webhookId: tempId, ...del });
    const remaining = findTempDefinitionsForProfile(await listWebhooks(headers), activeProfile);
    const absent = !remaining.some((w) => String(w.id) === String(tempId));
    out.steps.push({ step: 'VERIFY_TEMP_ABSENT', ok: absent });
    out.teardownVerification.perWebhook.push({
      webhookId: tempId,
      disabledOk,
      unsubscribedOk: !stillLinked,
      absentOk: absent,
    });
    out.plugWebhookCanaryDeactivatedAt = new Date().toISOString();
  }

  out.after = await inspectState(headers, contract, activeProfile);
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
