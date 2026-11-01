/**
 * DTC obdDTCList — isolated single-vehicle canary (Topology A).
 * Schema: DIMO Vehicle Triggers API + vehicle-triggers-api README (CEL string change).
 */

export const CREATE_TEMP_INITIAL_STATUS = 'disabled';

export const LEGACY_GLOBAL_PLUG_ID = '7a0562d3-369a-45eb-b5ed-8d35258091dd';
export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';

/** @see GET /v1/webhooks/signals → name obdDTCList, valueType string */
export const DTC_OBD_SIGNAL_NAME = 'obdDTCList';

/** Signals service uses VSS-prefixed metricName (DIMO docs + SynqDrive PLUG/R9 pattern). */
export const DTC_OBD_METRIC_NAME = 'vss.obdDTCList';

/** CEL: string change detection (vehicle-triggers-api README — Signal Conditions). */
export const DTC_OBD_CONDITION = 'valueString != previousValueString';

export const CANARY_PROFILES = {
  KS_MS_661_DTC: {
    profileKey: 'KS_MS_661_DTC',
    tokenId: 187361,
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    confirmValue: 'dtc-ks-ms-661-obddtclist-isolated-canary',
    displayName: 'SynqDrive DTC obdDTCList Canary KS MS 661 (TEMP)',
    description:
      'Temporary isolated obdDTCList canary for KS MS 661 (token 187361) — delete after DTC-02 pilot',
    activatedAtOutputKey: 'dtcObdDtcListCanaryActivatedAt',
  },
};

export function buildProfileSemantics(profile) {
  return {
    service: 'signals',
    metricName: DTC_OBD_METRIC_NAME,
    condition: DTC_OBD_CONDITION,
    coolDownPeriod: 30,
    displayName: profile.displayName,
    description: profile.description,
  };
}

export function resolveCanaryProfile(profileKey) {
  if (!profileKey || typeof profileKey !== 'string') {
    return { ok: false, reason: 'missing_canary_profile' };
  }
  const profile = CANARY_PROFILES[profileKey.trim()];
  if (!profile) return { ok: false, reason: 'unknown_canary_profile' };
  return { ok: true, profile };
}

export function buildTempWebhookPayload(semantics, targetURL, verificationToken, status) {
  return {
    ...semantics,
    targetURL,
    status,
    verificationToken,
  };
}

export function tokenFromAssetDid(assetDid) {
  const m = String(assetDid).match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function subscriptionsToTokenIds(assetDids) {
  return assetDids
    .map((d) => tokenFromAssetDid(d))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function findTempDefinitionsForProfile(webhooks, profile) {
  return (webhooks ?? []).filter((w) => w.displayName === profile.displayName);
}

export function verifyTempDefinition(webhook, expectedTargetURL, semantics) {
  if (!webhook) return { ok: false, reason: 'temp_webhook_missing' };
  if (webhook.metricName !== semantics.metricName) {
    return { ok: false, reason: 'temp_metric_mismatch' };
  }
  if (webhook.condition !== semantics.condition) {
    return { ok: false, reason: 'temp_condition_mismatch' };
  }
  const url = webhook.targetURL ?? webhook.url;
  if (url !== expectedTargetURL) return { ok: false, reason: 'temp_callback_mismatch' };
  return { ok: true };
}

export function parseCliArgs(argv = []) {
  let execute = false;
  let confirmCanary = null;
  let phase = 'inspect';
  let dryRunPlan = false;
  let canaryProfile = 'KS_MS_661_DTC';
  let validateSchemaOnly = false;

  for (const arg of argv) {
    if (arg === '--execute') execute = true;
    else if (arg === '--dry-run-plan') dryRunPlan = true;
    else if (arg === '--validate-schema-only') validateSchemaOnly = true;
    else if (arg.startsWith('--confirm-canary=')) confirmCanary = arg.slice('--confirm-canary='.length).trim();
    else if (arg.startsWith('--canary=')) canaryProfile = arg.slice('--canary='.length).trim();
    else if (arg.startsWith('--phase=')) {
      const p = arg.slice('--phase='.length).trim();
      if (p === 'activate' || p === 'teardown' || p === 'inspect') phase = p;
    }
  }
  return { execute, confirmCanary, phase, dryRunPlan, canaryProfile, validateSchemaOnly };
}

export function resolveExecutionMode(parsed) {
  const resolved = resolveCanaryProfile(parsed.canaryProfile);
  if (!resolved.ok) {
    return { mode: 'READ_ONLY', authorized: false, reason: resolved.reason };
  }
  const profile = resolved.profile;

  if (parsed.validateSchemaOnly) {
    return { mode: 'SCHEMA_VALIDATE', authorized: true, profile };
  }

  if (parsed.dryRunPlan && !parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'dry_run_plan_only', profile };
  }
  if (!parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'default_read_only', profile };
  }
  if (!parsed.confirmCanary || parsed.confirmCanary !== profile.confirmValue) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_canary_mismatch', profile };
  }
  if (parsed.phase === 'inspect') {
    return { mode: 'READ_ONLY', authorized: false, reason: 'inspect_phase_no_mutation', profile };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true, profile };
}
