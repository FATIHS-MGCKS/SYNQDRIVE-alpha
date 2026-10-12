/** R2.4 authorized R9 recovery — CLI gates and cohort allowlist. */

export const R9_SPEED_ID = '7a5e81bc-8f48-4b62-877a-9df104c1f42e';
export const R9_IGNITION_ID = '3a2fcd34-1a74-45db-bee9-75e340f36b00';

export const ALLOWED_WEBHOOK_IDS = new Set([R9_SPEED_ID, R9_IGNITION_ID]);

export const EXPECTED_R9_COHORT = new Set([186946, 187361, 187784, 192922]);
export const EXCLUDED_TOKENS = new Set([187336, 190497]);

export const EXPECTED_SPEED = {
  service: 'signals',
  metricName: 'vss.speed',
  condition: 'valueNumber > 3',
  coolDownPeriod: 30,
  displayName: 'SynqDrive R9 Speed Wake',
};

export const EXPECTED_IGNITION = {
  service: 'signals',
  metricName: 'vss.isIgnitionOn',
  condition: 'valueNumber == 1',
  coolDownPeriod: 30,
  displayName: 'SynqDrive R9 Ignition Wake',
};

export function parseCliArgs(argv = []) {
  let execute = false;
  let confirmWebhook = null;
  for (const arg of argv) {
    if (arg === '--execute') execute = true;
    else if (arg.startsWith('--confirm-webhook=')) confirmWebhook = arg.slice('--confirm-webhook='.length).trim();
  }
  return { execute, confirmWebhook };
}

export function resolveExecutionMode(parsed) {
  if (!parsed.execute && !parsed.confirmWebhook) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'default_read_only' };
  }
  if (!parsed.execute) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_execute_flag' };
  }
  if (!parsed.confirmWebhook) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'missing_confirm_webhook' };
  }
  if (!ALLOWED_WEBHOOK_IDS.has(parsed.confirmWebhook)) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_webhook_not_in_allowlist' };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true, webhookId: parsed.confirmWebhook };
}

export function tokenIdsFromSubs(subs) {
  return subs
    .map((entry) => {
      const did = typeof entry === 'string' ? entry : entry?.assetDID ?? entry?.assetDid ?? '';
      const m = String(did).match(/:(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n != null)
    .sort((a, b) => a - b);
}

export function cohortMatches(tokenIds) {
  const set = new Set(tokenIds);
  if (set.size !== EXPECTED_R9_COHORT.size) return false;
  for (const t of EXPECTED_R9_COHORT) if (!set.has(t)) return false;
  for (const t of EXCLUDED_TOKENS) if (set.has(t)) return false;
  return true;
}

export function semanticsForWebhookId(webhookId) {
  if (webhookId === R9_SPEED_ID) return EXPECTED_SPEED;
  if (webhookId === R9_IGNITION_ID) return EXPECTED_IGNITION;
  return null;
}

export function semanticsMatch(webhook, expected) {
  if (!webhook || !expected) return false;
  for (const [k, v] of Object.entries(expected)) {
    if (webhook[k] !== v) return false;
  }
  return true;
}
