import { CANONICAL_TINY_VEHICLE_ID } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import { requireRolloutWaveFromEnv } from './di-v0-s4-gate6-open-rekill-production.lib';

/** Set only by the pinned root-owned Gate-6 wrapper — not sufficient alone for LIVE_OPEN. */
export const DI_S4_GATE6_WRAPPER_ATTESTATION_ENV = 'DI_S4_GATE6_WRAPPER_ATTESTATION';
export const DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE = 'SYNQDRIVE_GATE6_PINNED_WRAPPER_V1';

export const DI_S4_GATE6_WRAPPER_ACTION_ENV = 'DI_S4_GATE6_WRAPPER_ACTION';
export type Gate6WrapperAction = 'PREFLIGHT' | 'DRY_RUN' | 'LIVE_OPEN' | 'EMERGENCY_REKILL';

export const DI_S4_GATE6_DRY_RUN_AUTHORIZED_ENV = 'DI_S4_GATE6_DRY_RUN_AUTHORIZED';
export const DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV = 'DI_S4_GATE6_PILOT_VEHICLE_CONFIRM';
export const DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM_ENV = 'DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM';

/** Engineering tests only — never set on Production. */
export const DI_S4_GATE6_TEST_OS_ROOT_ENV = 'DI_S4_GATE6_TEST_OS_ROOT';

export type Gate6OsAuthorizationFailure =
  | 'WRAPPER_ATTESTATION_MISSING'
  | 'WRAPPER_ATTESTATION_INVALID'
  | 'WRAPPER_ACTION_MISSING'
  | 'WRAPPER_ACTION_MISMATCH'
  | 'DRY_RUN_AUTHORIZATION_MISSING'
  | 'LIVE_OPEN_REQUIRES_ROOT_EUID'
  | 'PILOT_VEHICLE_CONFIRM_MISSING'
  | 'PILOT_VEHICLE_CONFIRM_MISMATCH'
  | 'ROLLOUT_WAVE_MISSING'
  | 'ROLLOUT_WAVE_INVALID'
  | 'ROLLOUT_WAVE_CONFIRM_MISSING'
  | 'ROLLOUT_WAVE_CONFIRM_MISMATCH';

function isEffectiveRoot(env: NodeJS.ProcessEnv): boolean {
  if (env.DI_S4F7AS_TEST_MODE === '1' && env[DI_S4_GATE6_TEST_OS_ROOT_ENV] === '1') {
    return true;
  }
  try {
    return process.geteuid?.() === 0;
  } catch {
    return false;
  }
}

function wrapperAttestationOk(env: NodeJS.ProcessEnv): boolean {
  return (env[DI_S4_GATE6_WRAPPER_ATTESTATION_ENV] ?? '').trim() === DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE;
}

function wrapperAction(env: NodeJS.ProcessEnv): string {
  return (env[DI_S4_GATE6_WRAPPER_ACTION_ENV] ?? '').trim();
}

export function evaluateGate6WrapperAttestation(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failure: Gate6OsAuthorizationFailure } {
  if (!(env[DI_S4_GATE6_WRAPPER_ATTESTATION_ENV] ?? '').trim()) {
    return { ok: false, failure: 'WRAPPER_ATTESTATION_MISSING' };
  }
  if (!wrapperAttestationOk(env)) {
    return { ok: false, failure: 'WRAPPER_ATTESTATION_INVALID' };
  }
  return { ok: true };
}

export function evaluateGate6OsAuthorizationForAction(
  action: Gate6WrapperAction,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failures: Gate6OsAuthorizationFailure[] } {
  const failures: Gate6OsAuthorizationFailure[] = [];

  const attestation = evaluateGate6WrapperAttestation(env);
  if (!attestation.ok) failures.push(attestation.failure);

  const act = wrapperAction(env);
  if (!act) failures.push('WRAPPER_ACTION_MISSING');
  else if (act !== action) failures.push('WRAPPER_ACTION_MISMATCH');

  if (action === 'DRY_RUN') {
    if ((env[DI_S4_GATE6_DRY_RUN_AUTHORIZED_ENV] ?? '').trim() !== 'YES') {
      failures.push('DRY_RUN_AUTHORIZATION_MISSING');
    }
  }

  if (action === 'LIVE_OPEN') {
    if (!isEffectiveRoot(env)) failures.push('LIVE_OPEN_REQUIRES_ROOT_EUID');
    const waveReq = requireRolloutWaveFromEnv(env);
    if (!waveReq.ok) failures.push(waveReq.failure);
    const waveConfirm = (env[DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM_ENV] ?? '').trim();
    if (!waveConfirm) failures.push('ROLLOUT_WAVE_CONFIRM_MISSING');
    else if (waveReq.ok && waveConfirm !== String(waveReq.wave)) failures.push('ROLLOUT_WAVE_CONFIRM_MISMATCH');
    if (waveReq.ok && waveReq.wave === 1) {
      const confirm = (env[DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV] ?? '').trim();
      if (!confirm) failures.push('PILOT_VEHICLE_CONFIRM_MISSING');
      else if (confirm !== CANONICAL_TINY_VEHICLE_ID) failures.push('PILOT_VEHICLE_CONFIRM_MISMATCH');
    }
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}
