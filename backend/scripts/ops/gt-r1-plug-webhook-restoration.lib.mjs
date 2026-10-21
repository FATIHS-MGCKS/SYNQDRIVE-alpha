/**
 * GT-R1 / VDC OBD PLUG webhook restoration — CLI gate + shared constants.
 * SAFE-BY-DEFAULT: READ_ONLY = auth handshake + GET inspection only (no webhook mutation).
 * Mutation requires --execute AND --confirm-webhook=<exact-plug-uuid>.
 */

export const PLUG_ID = '7a0562d3-369a-45eb-b5ed-8d35258091dd';
export const PLUG_STABLE = 'b977124a025a';
export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';
export const UNPLUG_STABLE = 'a257daa23ee5';
export const R9_SPEED_STABLE = '9eeb7158afee';
export const R9_IGN_STABLE = '5d611d470eab';

/** Primary canary vehicle — WOB L 7503 */
export const TOKEN_WOB_7503 = 192922;
export const VEHICLE_WOB_7503 = '19fedd4b-c4e8-4de8-a125-dab293326e7e';

export const EXPECTED_PLUG_SEMANTICS = {
  service: 'signals',
  metricName: 'vss.obdIsPluggedIn',
  condition: 'valueNumber == 1',
  coolDownPeriod: 0,
  displayName: 'OBD Device Plugged in',
  description: 'Driver plugged OBD Device in',
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
  if (parsed.confirmWebhook !== PLUG_ID) {
    return { mode: 'READ_ONLY', authorized: false, reason: 'confirm_webhook_mismatch' };
  }
  return { mode: 'AUTHORIZED_MUTATION', authorized: true };
}
