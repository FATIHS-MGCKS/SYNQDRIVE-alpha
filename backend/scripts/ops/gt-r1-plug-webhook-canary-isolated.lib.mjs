/**
 * VDC OBD PLUG — isolated WOB canary (topology A) CLI gate + activation-order helpers.
 * SAFE-BY-DEFAULT: READ_ONLY unless --execute + exact --confirm-canary token.
 */

export const CANARY_CONFIRM_VALUE = 'vdc-wob-7503-plug-isolated-canary';
export const TOKEN_WOB_7503 = 192922;
export const VEHICLE_WOB_7503 = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
export const LEGACY_GLOBAL_PLUG_ID = '7a0562d3-369a-45eb-b5ed-8d35258091dd';
export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';

export const CREATE_TEMP_INITIAL_STATUS = 'disabled';

export const ACTIVATION_SEQUENCE = [
  'CREATE_DISABLED',
  'VERIFY_TEMP_DEFINITION',
  'SUBSCRIBE_WOB_WHILE_DISABLED',
  'VERIFY_WOB_ONLY_SUBSCRIBER',
  'ENABLE_TEMP',
  'VERIFY_ENABLED',
  'RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT',
];

export const PARTIAL_ROLLBACK_SEQUENCE = ['DISABLE_TEMP', 'UNSUBSCRIBE_WOB', 'DELETE_TEMP'];

export const TEARDOWN_SEQUENCE = [
  'DISABLE_TEMP',
  'VERIFY_DISABLED',
  'UNSUBSCRIBE_WOB',
  'VERIFY_UNSUBSCRIBED',
  'DELETE_TEMP',
  'VERIFY_TEMP_ABSENT',
];

/** Stable marker to find temporary canary definitions in provider list */
export const TEMP_PLUG_DISPLAY_NAME = 'SynqDrive VDC OBD PLUG Canary WOB 7503 (TEMP)';
export const TEMP_PLUG_DESCRIPTION = 'Temporary isolated OBD PLUG canary for WOB L 7503 — delete after GT';

export const TEMP_PLUG_SEMANTICS = {
  service: 'signals',
  metricName: 'vss.obdIsPluggedIn',
  condition: 'valueNumber == 1',
  coolDownPeriod: 0,
  displayName: TEMP_PLUG_DISPLAY_NAME,
  description: TEMP_PLUG_DESCRIPTION,
};

/**
 * @param {string} assetDid
 * @returns {number|null}
 */
export function tokenFromAssetDid(assetDid) {
  const m = String(assetDid).match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * @param {string[]} assetDids
 * @returns {number[]}
 */
export function subscriptionsToTokenIds(assetDids) {
  return assetDids
    .map((d) => tokenFromAssetDid(d))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/**
 * @param {object} semantics
 * @param {string} targetURL
 * @param {string} verificationToken
 * @param {'disabled'|'enabled'} status
 */
export function buildTempWebhookPayload(semantics, targetURL, verificationToken, status) {
  return {
    ...semantics,
    targetURL,
    status,
    verificationToken,
  };
}

/**
 * @param {object|null} webhook picked fields or raw
 * @param {string} expectedTargetURL
 */
export function verifyTempDefinition(webhook, expectedTargetURL) {
  if (!webhook) {
    return { ok: false, reason: 'temp_webhook_missing' };
  }
  if (webhook.metricName !== TEMP_PLUG_SEMANTICS.metricName) {
    return { ok: false, reason: 'temp_metric_mismatch' };
  }
  if (webhook.condition !== TEMP_PLUG_SEMANTICS.condition) {
    return { ok: false, reason: 'temp_condition_mismatch' };
  }
  const url = webhook.targetURL ?? webhook.url;
  if (url !== expectedTargetURL) {
    return { ok: false, reason: 'temp_callback_mismatch' };
  }
  return { ok: true };
}

/**
 * @param {Array<{ id?: string, status?: string }>} existingTemps
 */
export function validateExistingTempBeforeActivate(existingTemps) {
  if (!existingTemps || existingTemps.length > 1) {
    return { abort: true, reason: 'multiple_temp_canary_definitions_conflict' };
  }
  if (existingTemps.length === 0) {
    return { abort: false, existing: null };
  }
  const existing = existingTemps[0];
  if (String(existing.status).toLowerCase() === 'enabled') {
    return { abort: true, reason: 'preexisting_enabled_temp_abort' };
  }
  return { abort: false, existing };
}

/**
 * @param {number[]} subscriberTokenIds
 * @param {number} [wobToken]
 */
export function analyzeTempSubscribers(subscriberTokenIds, wobToken = TOKEN_WOB_7503) {
  const sorted = [...subscriberTokenIds].sort((a, b) => a - b);
  const foreign = sorted.filter((t) => t !== wobToken);
  return {
    TEMP_CANARY_SUBSCRIBER_COUNT: sorted.length,
    TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN: sorted.length === 1 && sorted[0] === wobToken ? wobToken : null,
    WOB_TEMP_SUBSCRIBED: sorted.includes(wobToken),
    TEMP_CANARY_WOB_ONLY: sorted.length === 1 && sorted[0] === wobToken,
    foreignSubscriberTokenIds: foreign,
  };
}

/**
 * Pre-enable gate: exactly one subscriber and it must be WOB.
 * @param {number[]} subscriberTokenIds
 */
export function validatePreEnableWobOnly(subscriberTokenIds, wobToken = TOKEN_WOB_7503) {
  const analysis = analyzeTempSubscribers(subscriberTokenIds, wobToken);
  if (analysis.foreignSubscriberTokenIds.length > 0) {
    return { abort: true, reason: 'foreign_subscriber_abort', analysis };
  }
  if (!analysis.TEMP_CANARY_WOB_ONLY) {
    return { abort: true, reason: 'pre_enable_wob_only_verification_failed', analysis };
  }
  return { abort: false, analysis };
}

/**
 * @param {object} params
 */
export function buildPostActivateVerification(params) {
  const {
    tempWebhook,
    subscriberTokenIds,
    legacyGlobalPlug,
    legacyUnplug,
    legacyPlugSubscriptionTokenIdsBefore,
    legacyPlugSubscriptionTokenIdsAfter,
    expectedTargetURL,
  } = params;

  const def = verifyTempDefinition(tempWebhook, expectedTargetURL);
  const subs = analyzeTempSubscribers(subscriberTokenIds);

  const legacySubsUnchanged =
    JSON.stringify(legacyPlugSubscriptionTokenIdsBefore ?? []) ===
    JSON.stringify(legacyPlugSubscriptionTokenIdsAfter ?? []);

  return {
    TEMP_WEBHOOK_EXISTS: Boolean(tempWebhook?.id),
    TEMP_WEBHOOK_ENABLED: String(tempWebhook?.status).toLowerCase() === 'enabled',
    TEMP_WEBHOOK_METRIC: tempWebhook?.metricName ?? null,
    TEMP_WEBHOOK_CONDITION: tempWebhook?.condition ?? null,
    TEMP_CANARY_SUBSCRIBER_COUNT: subs.TEMP_CANARY_SUBSCRIBER_COUNT,
    TEMP_CANARY_WOB_ONLY: subs.TEMP_CANARY_WOB_ONLY,
    LEGACY_GLOBAL_PLUG_ENABLED: String(legacyGlobalPlug?.status).toLowerCase() === 'enabled',
    LEGACY_GLOBAL_PLUG_SUBSCRIBERS_UNCHANGED: legacySubsUnchanged,
    UNPLUG_WEBHOOK_ENABLED: String(legacyUnplug?.status).toLowerCase() === 'enabled',
    tempDefinitionSemanticsOk: def.ok,
  };
}

/**
 * @param {object} verification from buildPostActivateVerification
 */
export function postActivateVerificationPasses(verification) {
  return (
    verification.TEMP_WEBHOOK_EXISTS &&
    verification.TEMP_WEBHOOK_ENABLED &&
    verification.TEMP_WEBHOOK_METRIC === TEMP_PLUG_SEMANTICS.metricName &&
    verification.TEMP_WEBHOOK_CONDITION === TEMP_PLUG_SEMANTICS.condition &&
    verification.TEMP_CANARY_SUBSCRIBER_COUNT === 1 &&
    verification.TEMP_CANARY_WOB_ONLY &&
    !verification.LEGACY_GLOBAL_PLUG_ENABLED &&
    verification.LEGACY_GLOBAL_PLUG_SUBSCRIBERS_UNCHANGED &&
    verification.UNPLUG_WEBHOOK_ENABLED &&
    verification.tempDefinitionSemanticsOk
  );
}

/**
 * @param {string[]} argv
 * @returns {{ execute: boolean, confirmCanary: string|null, phase: 'inspect'|'activate'|'teardown', dryRunPlan: boolean }}
 */
export function parseIsolatedCliArgs(argv = []) {
  let execute = false;
  let confirmCanary = null;
  let phase = 'inspect';
  let dryRunPlan = false;

  for (const arg of argv) {
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--dry-run-plan') {
      dryRunPlan = true;
      continue;
    }
    if (arg.startsWith('--confirm-canary=')) {
      confirmCanary = arg.slice('--confirm-canary='.length).trim();
      continue;
    }
    if (arg.startsWith('--phase=')) {
      const p = arg.slice('--phase='.length).trim();
      if (p === 'activate' || p === 'teardown' || p === 'inspect') phase = p;
      continue;
    }
  }

  return { execute, confirmCanary, phase, dryRunPlan };
}

/**
 * @returns {{ mode: 'READ_ONLY' | 'AUTHORIZED_MUTATION', authorized: boolean, reason?: string }}
 */
export function resolveIsolatedExecutionMode(parsed) {
  if (!parsed.execute && !parsed.confirmCanary && !parsed.dryRunPlan) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'default_read_only' };
  }
  if (parsed.dryRunPlan && !parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'dry_run_plan_only' };
  }
  if (!parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_execute_flag' };
  }
  if (!parsed.confirmCanary) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_confirm_canary' };
  }
  if (parsed.confirmCanary !== CANARY_CONFIRM_VALUE) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_canary_mismatch' };
  }
  if (parsed.phase === 'inspect') {
    return { mode: 'READ_ONLY', authorized: false, reason: 'inspect_phase_no_mutation' };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true };
}
