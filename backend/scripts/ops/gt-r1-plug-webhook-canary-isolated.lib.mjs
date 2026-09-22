/**
 * VDC OBD PLUG — isolated per-vehicle canary profiles (topology A).
 * SAFE-BY-DEFAULT: READ_ONLY unless --execute + matching --canary + --confirm-canary.
 */

export const LEGACY_GLOBAL_PLUG_ID = '7a0562d3-369a-45eb-b5ed-8d35258091dd';
export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';

export const CREATE_TEMP_INITIAL_STATUS = 'disabled';

export const ACTIVATION_SEQUENCE = [
  'CREATE_DISABLED',
  'VERIFY_TEMP_DEFINITION',
  'SUBSCRIBE_WHILE_DISABLED',
  'VERIFY_ONLY_SUBSCRIBER',
  'VERIFY_OTHER_PROFILE_CANARIES_UNTOUCHED',
  'ENABLE_TEMP',
  'VERIFY_ENABLED',
  'RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT',
];

export const PARTIAL_ROLLBACK_SEQUENCE = ['DISABLE_TEMP', 'UNSUBSCRIBE_PROFILE_TOKEN', 'DELETE_TEMP'];

export const TEARDOWN_SEQUENCE = [
  'DISABLE_TEMP',
  'VERIFY_DISABLED',
  'UNSUBSCRIBE_PROFILE_TOKEN',
  'VERIFY_UNSUBSCRIBED',
  'DELETE_TEMP',
  'VERIFY_TEMP_ABSENT',
];

export const TEMP_PLUG_METRIC = 'vss.obdIsPluggedIn';
export const TEMP_PLUG_CONDITION = 'valueNumber == 1';

/** @type {Record<string, import('./gt-r1-plug-webhook-canary-isolated.lib.mjs').CanaryProfile>} */
export const CANARY_PROFILES = {
  WOB_L_7503: {
    profileKey: 'WOB_L_7503',
    tokenId: 192922,
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    confirmValue: 'vdc-wob-7503-plug-isolated-canary',
    displayName: 'SynqDrive VDC OBD PLUG Canary WOB 7503 (TEMP)',
    description: 'Temporary isolated OBD PLUG canary for WOB L 7503 — delete after GT',
    activatedAtOutputKey: 'plugWebhookCanaryActivatedAt',
  },
  KS_MX_2024: {
    profileKey: 'KS_MX_2024',
    tokenId: 187336,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    confirmValue: 'vdc-ks-mx-2024-plug-isolated-canary',
    displayName: 'SynqDrive VDC OBD PLUG Canary KS MX 2024 (TEMP)',
    description: 'Temporary isolated OBD PLUG canary for KS MX 2024 (Mercedes C63) — delete after GT',
    activatedAtOutputKey: 'ksMxPlugWebhookCanaryActivatedAt',
  },
};

/** Backward-compatible exports (WOB profile) */
export const CANARY_CONFIRM_VALUE = CANARY_PROFILES.WOB_L_7503.confirmValue;
export const TOKEN_WOB_7503 = CANARY_PROFILES.WOB_L_7503.tokenId;
export const VEHICLE_WOB_7503 = CANARY_PROFILES.WOB_L_7503.vehicleId;
export const TEMP_PLUG_DISPLAY_NAME = CANARY_PROFILES.WOB_L_7503.displayName;
export const TEMP_PLUG_DESCRIPTION = CANARY_PROFILES.WOB_L_7503.description;

export const TEMP_PLUG_SEMANTICS = {
  service: 'signals',
  metricName: TEMP_PLUG_METRIC,
  condition: TEMP_PLUG_CONDITION,
  coolDownPeriod: 0,
  displayName: TEMP_PLUG_DISPLAY_NAME,
  description: TEMP_PLUG_DESCRIPTION,
};

/**
 * @param {string|null|undefined} profileKey
 * @returns {{ ok: true, profile: typeof CANARY_PROFILES.WOB_L_7503 } | { ok: false, reason: string }}
 */
export function resolveCanaryProfile(profileKey) {
  if (!profileKey || typeof profileKey !== 'string') {
    return { ok: false, reason: 'missing_canary_profile' };
  }
  const key = profileKey.trim();
  const profile = CANARY_PROFILES[key];
  if (!profile) {
    return { ok: false, reason: 'unknown_canary_profile' };
  }
  return { ok: true, profile };
}

/**
 * @param {string} profileKey
 */
export function buildProfileSemantics(profile) {
  return {
    service: 'signals',
    metricName: TEMP_PLUG_METRIC,
    condition: TEMP_PLUG_CONDITION,
    coolDownPeriod: 0,
    displayName: profile.displayName,
    description: profile.description,
  };
}

/**
 * @param {Array<{ displayName?: string }>} webhooks
 * @param {typeof CANARY_PROFILES.WOB_L_7503} profile
 */
export function findTempDefinitionsForProfile(webhooks, profile) {
  return (webhooks ?? []).filter((w) => w.displayName === profile.displayName);
}

/**
 * All isolated canary temp definitions (any allowlisted profile display name).
 * @param {Array<{ displayName?: string }>} webhooks
 */
export function findAllIsolatedTempCanaries(webhooks) {
  const names = new Set(Object.values(CANARY_PROFILES).map((p) => p.displayName));
  return (webhooks ?? []).filter((w) => names.has(w.displayName));
}

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
 * @param {typeof TEMP_PLUG_SEMANTICS} [semantics]
 */
export function verifyTempDefinition(webhook, expectedTargetURL, semantics = TEMP_PLUG_SEMANTICS) {
  if (!webhook) {
    return { ok: false, reason: 'temp_webhook_missing' };
  }
  if (webhook.metricName !== semantics.metricName) {
    return { ok: false, reason: 'temp_metric_mismatch' };
  }
  if (webhook.condition !== semantics.condition) {
    return { ok: false, reason: 'temp_condition_mismatch' };
  }
  const url = webhook.targetURL ?? webhook.url;
  if (url !== expectedTargetURL) {
    return { ok: false, reason: 'temp_callback_mismatch' };
  }
  return { ok: true };
}

/**
 * Per-profile temp definition guard (max one definition per profile display name).
 * @param {Array<{ id?: string, status?: string }>} existingTempsForProfile
 */
export function validateExistingTempBeforeActivate(existingTempsForProfile) {
  if (!existingTempsForProfile || existingTempsForProfile.length > 1) {
    return { abort: true, reason: 'multiple_temp_canary_definitions_conflict' };
  }
  if (existingTempsForProfile.length === 0) {
    return { abort: false, existing: null };
  }
  const existing = existingTempsForProfile[0];
  if (String(existing.status).toLowerCase() === 'enabled') {
    return { abort: true, reason: 'preexisting_enabled_temp_abort' };
  }
  return { abort: false, existing };
}

/**
 * @param {number[]} subscriberTokenIds
 * @param {number} expectedTokenId
 */
export function analyzeTempSubscribers(subscriberTokenIds, expectedTokenId) {
  const sorted = [...subscriberTokenIds].sort((a, b) => a - b);
  const foreign = sorted.filter((t) => t !== expectedTokenId);
  return {
    TEMP_CANARY_SUBSCRIBER_COUNT: sorted.length,
    TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN:
      sorted.length === 1 && sorted[0] === expectedTokenId ? expectedTokenId : null,
    PROFILE_TOKEN_SUBSCRIBED: sorted.includes(expectedTokenId),
    TEMP_CANARY_SINGLE_TOKEN_ONLY: sorted.length === 1 && sorted[0] === expectedTokenId,
    foreignSubscriberTokenIds: foreign,
    /** @deprecated use TEMP_CANARY_SINGLE_TOKEN_ONLY */
    TEMP_CANARY_WOB_ONLY: sorted.length === 1 && sorted[0] === TOKEN_WOB_7503,
    WOB_TEMP_SUBSCRIBED: sorted.includes(TOKEN_WOB_7503),
  };
}

/**
 * @param {number[]} subscriberTokenIds
 * @param {number} expectedTokenId
 */
export function validatePreEnableSingleTokenOnly(subscriberTokenIds, expectedTokenId) {
  const analysis = analyzeTempSubscribers(subscriberTokenIds, expectedTokenId);
  if (analysis.foreignSubscriberTokenIds.length > 0) {
    return { abort: true, reason: 'foreign_subscriber_abort', analysis };
  }
  if (!analysis.TEMP_CANARY_SINGLE_TOKEN_ONLY) {
    return { abort: true, reason: 'pre_enable_single_token_verification_failed', analysis };
  }
  return { abort: false, analysis };
}

/** @deprecated */
export function validatePreEnableWobOnly(subscriberTokenIds, wobToken = TOKEN_WOB_7503) {
  return validatePreEnableSingleTokenOnly(subscriberTokenIds, wobToken);
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
    profile,
    semantics,
  } = params;

  const sem = semantics ?? buildProfileSemantics(profile);
  const def = verifyTempDefinition(tempWebhook, expectedTargetURL, sem);
  const subs = analyzeTempSubscribers(subscriberTokenIds, profile.tokenId);

  const legacySubsUnchanged =
    JSON.stringify(legacyPlugSubscriptionTokenIdsBefore ?? []) ===
    JSON.stringify(legacyPlugSubscriptionTokenIdsAfter ?? []);

  return {
    profileKey: profile.profileKey,
    TEMP_WEBHOOK_EXISTS: Boolean(tempWebhook?.id),
    TEMP_WEBHOOK_ENABLED: String(tempWebhook?.status).toLowerCase() === 'enabled',
    TEMP_WEBHOOK_METRIC: tempWebhook?.metricName ?? null,
    TEMP_WEBHOOK_CONDITION: tempWebhook?.condition ?? null,
    TEMP_CANARY_SUBSCRIBER_COUNT: subs.TEMP_CANARY_SUBSCRIBER_COUNT,
    TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN: subs.TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN,
    TEMP_CANARY_SINGLE_TOKEN_ONLY: subs.TEMP_CANARY_SINGLE_TOKEN_ONLY,
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
    verification.TEMP_WEBHOOK_METRIC === TEMP_PLUG_METRIC &&
    verification.TEMP_WEBHOOK_CONDITION === TEMP_PLUG_CONDITION &&
    verification.TEMP_CANARY_SUBSCRIBER_COUNT === 1 &&
    verification.TEMP_CANARY_SINGLE_TOKEN_ONLY &&
    !verification.LEGACY_GLOBAL_PLUG_ENABLED &&
    verification.LEGACY_GLOBAL_PLUG_SUBSCRIBERS_UNCHANGED &&
    verification.UNPLUG_WEBHOOK_ENABLED &&
    verification.tempDefinitionSemanticsOk
  );
}

/**
 * When activating one profile, sibling enabled canaries must remain valid (WOB+KS coexistence).
 * @param {Record<string, { tempWebhook: object|null, subscriberTokenIds: number[] }>} siblingSnapshots
 * @param {typeof CANARY_PROFILES.WOB_L_7503} activeProfile
 */
export function validateSiblingCanariesUntouched(siblingSnapshots, activeProfile) {
  const issues = [];
  for (const [profileKey, snap] of Object.entries(siblingSnapshots)) {
    if (profileKey === activeProfile.profileKey) continue;
    const profile = CANARY_PROFILES[profileKey];
    if (!profile) continue;
    if (!snap?.tempWebhook) continue;
    const status = String(snap.tempWebhook.status).toLowerCase();
    if (status === 'enabled') {
      const gate = validatePreEnableSingleTokenOnly(snap.subscriberTokenIds, profile.tokenId);
      if (gate.abort) {
        issues.push({ profileKey, reason: 'sibling_canary_invalid_after_activate', gate });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Reject mistaken CLI token overrides (arbitrary token input not allowed).
 * @param {string[]} argv
 */
export function rejectArbitraryTokenCliArgs(argv = []) {
  for (const arg of argv) {
    if (arg.startsWith('--token') || arg.startsWith('--tokenId') || arg.startsWith('--token-id')) {
      return { rejected: true, reason: 'arbitrary_token_cli_not_allowed' };
    }
  }
  return { rejected: false };
}

/**
 * @param {string[]} argv
 */
export function parseIsolatedCliArgs(argv = []) {
  let execute = false;
  let confirmCanary = null;
  let phase = 'inspect';
  let dryRunPlan = false;
  let canaryProfile = null;

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
    if (arg.startsWith('--canary=')) {
      canaryProfile = arg.slice('--canary='.length).trim();
      continue;
    }
    if (arg.startsWith('--phase=')) {
      const p = arg.slice('--phase='.length).trim();
      if (p === 'activate' || p === 'teardown' || p === 'inspect') phase = p;
      continue;
    }
  }

  if (!canaryProfile && (phase === 'inspect' || !execute)) {
    canaryProfile = 'WOB_L_7503';
  }

  return { execute, confirmCanary, phase, dryRunPlan, canaryProfile };
}

/**
 * @returns {{ mode: 'READ_ONLY' | 'AUTHORIZED_MUTATION', authorized: boolean, reason?: string, profile?: object }}
 */
export function resolveIsolatedExecutionMode(parsed) {
  const arbitrary = rejectArbitraryTokenCliArgs(process.argv.slice(2));
  if (arbitrary.rejected) {
    return { mode: 'READ_ONLY', authorized: false, reason: arbitrary.reason };
  }

  const resolved = resolveCanaryProfile(parsed.canaryProfile);
  if (!resolved.ok) {
    return { mode: 'READ_ONLY', authorized: false, reason: resolved.reason };
  }
  const profile = resolved.profile;

  if (!parsed.execute && !parsed.confirmCanary && !parsed.dryRunPlan) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'default_read_only', profile };
  }
  if (parsed.dryRunPlan && !parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'dry_run_plan_only', profile };
  }
  if (!parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_execute_flag', profile };
  }
  if (!parsed.confirmCanary) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_confirm_canary', profile };
  }
  if (parsed.confirmCanary !== profile.confirmValue) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_canary_mismatch', profile };
  }
  if (parsed.phase === 'inspect') {
    return { mode: 'READ_ONLY', authorized: false, reason: 'inspect_phase_no_mutation', profile };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true, profile };
}
