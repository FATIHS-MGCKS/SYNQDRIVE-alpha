import * as fs from 'fs';
import * as path from 'path';
import { isProductionBackendEnvSurface } from './di-v0-s4-gate6-live-authority.lib';
import { resolveProductionPinnedConsumptionRegisterDir } from './di-v0-s4-gate6-production-trust-anchor.lib';
import {
  DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV,
  GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR,
} from './di-v0-s4-gate6-production-paths.lib';

export { DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV, GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR };

export type ApprovalConsumptionFailure =
  | 'APPROVAL_CONSUMPTION_REGISTER_MISSING'
  | 'APPROVAL_CONSUMPTION_REGISTER_UNREADABLE'
  | 'APPROVAL_ID_ALREADY_CONSUMED'
  | 'APPROVAL_CONSUMPTION_STATE_UNKNOWN'
  | 'APPROVAL_ID_INVALID'
  | 'APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN'
  | 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_MISSING'
  | 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID';

export function consumedMarkerPath(registerDir: string, approvalId: string): string {
  return path.join(registerDir, `gate6-approval-id.${approvalId}.consumed`);
}

/**
 * Production register dirs must be root-owned without group/other write so operators cannot unlink markers.
 */
export function consumptionRegisterBlocksOperatorUnlink(registerDir: string): boolean {
  try {
    const lst = fs.lstatSync(registerDir);
    if (!lst.isDirectory() || lst.isSymbolicLink()) return false;
    const mode = lst.mode & 0o777;
    if (mode & 0o022) return false;
    if (lst.uid !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

function isSafeApprovalId(approvalId: string): boolean {
  return /^[A-Za-z0-9._-]{8,128}$/.test(approvalId);
}

export function resolveApprovalConsumptionRegisterDir(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; dir: string } | { ok: false; failure: ApprovalConsumptionFailure } {
  if (isProductionBackendEnvSurface(env)) {
    if ((env[DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV] ?? '').trim()) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN' };
    }
    const pinned = resolveProductionPinnedConsumptionRegisterDir(env);
    if (!pinned.ok) {
      const failure = pinned.failure as ApprovalConsumptionFailure;
      return { ok: false, failure };
    }
    return { ok: true, dir: pinned.dir };
  }

  const explicit = (env[DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV] ?? '').trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_MISSING' };
    }
    return { ok: true, dir: explicit };
  }
  if (fs.existsSync(GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR)) {
    return { ok: true, dir: GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR };
  }
  return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_MISSING' };
}

/**
 * Atomically consumes an approvalId for a single live OPEN dispatch issuance (O_EXCL on final marker).
 */
export function reserveApprovalIdForDispatch(
  registerDir: string,
  approvalId: string,
): { ok: true } | { ok: false; failure: ApprovalConsumptionFailure } {
  if (!registerDir.trim()) {
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_MISSING' };
  }
  if (!isSafeApprovalId(approvalId)) {
    return { ok: false, failure: 'APPROVAL_ID_INVALID' };
  }
  if (!fs.existsSync(registerDir)) {
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_MISSING' };
  }

  const consumed = consumedMarkerPath(registerDir, approvalId);
  try {
    const fd = fs.openSync(consumed, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o400);
    try {
      fs.writeSync(fd, `${process.pid}\n${Date.now()}\n`, undefined, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true };
  } catch {
    try {
      if (fs.existsSync(consumed)) {
        return { ok: false, failure: 'APPROVAL_ID_ALREADY_CONSUMED' };
      }
    } catch {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_STATE_UNKNOWN' };
    }
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_STATE_UNKNOWN' };
  }
}

/** Engineering helper: detect replay without mutating register (read-only). */
export function isApprovalIdConsumed(registerDir: string, approvalId: string): boolean {
  if (!registerDir.trim() || !isSafeApprovalId(approvalId)) return false;
  return fs.existsSync(consumedMarkerPath(registerDir, approvalId));
}
