/**
 * VDC OBD PLUG — isolated WOB canary (topology A) CLI gate.
 * SAFE-BY-DEFAULT: READ_ONLY unless --execute + exact --confirm-canary token.
 */

export const CANARY_CONFIRM_VALUE = 'vdc-wob-7503-plug-isolated-canary';
export const TOKEN_WOB_7503 = 192922;
export const VEHICLE_WOB_7503 = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
export const LEGACY_GLOBAL_PLUG_ID = '7a0562d3-369a-45eb-b5ed-8d35258091dd';
export const UNPLUG_ID = '49438f51-3ca5-4808-81d5-3598336c53a3';

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
