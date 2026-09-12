/**
 * GT-R1 UNPLUG webhook recovery — CLI gate + shared constants.
 * SAFE-BY-DEFAULT: READ_ONLY = auth handshake + GET inspection only (no webhook mutation).
 * Mutation requires --execute AND --confirm-webhook=<exact-uuid>.
 */

export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';
export const EXPECTED_STABLE = 'a257daa23ee5';
export const PLUG_STABLE = 'b977124a025a';
export const R9_SPEED_STABLE = '9eeb7158afee';
export const R9_IGN_STABLE = '5d611d470eab';
export const TOKEN_187336 = 187336;

export const EXPECTED_SEMANTICS = {
  service: 'signals',
  metricName: 'vss.obdIsPluggedIn',
  condition: 'valueNumber == 0',
  coolDownPeriod: 0,
  displayName: 'OBD Device unplugged',
  description: 'Driver unplugged OBD Device',
  targetURL: 'https://app.synqdrive.eu/api/v1/webhooks/dimo',
};

/**
 * @param {string[]} argv process.argv slice (e.g. process.argv.slice(2))
 */
export function parseCliArgs(argv = []) {
  let execute = false;
  let confirmWebhook = null;

  for (const arg of argv) {
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg.startsWith('--confirm-webhook=')) {
      confirmWebhook = arg.slice('--confirm-webhook='.length).trim();
      continue;
    }
  }

  return { execute, confirmWebhook };
}

/**
 * @returns {{ mode: 'READ_ONLY' | 'AUTHORIZED_MUTATION', authorized: boolean, reason?: string }}
 */
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
  if (parsed.confirmWebhook !== UNPLUG_ID) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_webhook_mismatch' };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true };
}
