import * as fs from 'fs';
import * as path from 'path';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV,
  DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE_ENV,
} from './di-v0-s4-gate6-human-approval.lib';
import {
  DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV,
  GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR,
  GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH,
  GATE6_PRODUCTION_TRUST_SHARED_ROOT,
} from './di-v0-s4-gate6-production-paths.lib';
import { isCanonicalProductionBackendEnv } from './di-v0-s4-gate6-live-authority.lib';
import {
  enforceExactProductionBackendEnvForLiveOpen,
  resolveCanonicalBackendEnvPathFromFilesystem,
} from './di-v0-s4-gate6-trusted-authority.lib';

export type ProductionTrustAnchorFailure =
  | 'PRODUCTION_BACKEND_ENV_TRUST_MISMATCH'
  | 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED'
  | 'HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN'
  | 'HUMAN_APPROVAL_ROOT_KEY_ENV_OVERRIDE_FORBIDDEN'
  | 'APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN'
  | 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_MISSING'
  | 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID'
  | 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_MISSING'
  | 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID';

function isFixtureIssuance(env: NodeJS.ProcessEnv): boolean {
  return env.DI_S4F7AS_FIXTURE_MODE === '1' || env.DI_S4F7J_FIXTURE_MODE === '1';
}

/**
 * True when OPEN dispatch issuance must use pinned Production trust anchors (backend.env + public key + register).
 */
export function isProductionGate6IssuanceContext(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isFixtureIssuance(env)) return false;
  if (isCanonicalProductionBackendEnv(env)) return true;
  const resolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const enforced = enforceExactProductionBackendEnvForLiveOpen(env, resolved);
  return enforced.ok;
}

function assertPinnedPathNotSymlink(pinnedPath: string, requireProductionSharedRoot: boolean): boolean {
  const resolved = fs.realpathSync(pinnedPath);
  if (resolved !== pinnedPath) return false;
  if (requireProductionSharedRoot && !pinnedPath.startsWith(`${GATE6_PRODUCTION_TRUST_SHARED_ROOT}/`)) {
    return false;
  }
  return true;
}

function verifyPinnedRegularFileTrustAnchor(
  pinnedPath: string,
  requireProductionSharedRoot: boolean,
): { ok: true } | { ok: false; failure: ProductionTrustAnchorFailure } {
  if (!fs.existsSync(pinnedPath)) {
    return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_MISSING' };
  }
  try {
    const lst = fs.lstatSync(pinnedPath);
    if (!lst.isFile()) {
      return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID' };
    }
    if (lst.isSymbolicLink()) {
      return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID' };
    }
    const mode = lst.mode & 0o777;
    if (mode & 0o002) {
      return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID' };
    }
    if (!assertPinnedPathNotSymlink(pinnedPath, requireProductionSharedRoot)) {
      return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID' };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID' };
  }
}

function verifyPinnedDirectoryTrustAnchor(
  pinnedPath: string,
  requireProductionSharedRoot: boolean,
): { ok: true } | { ok: false; failure: ProductionTrustAnchorFailure } {
  if (!fs.existsSync(pinnedPath)) {
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_MISSING' };
  }
  try {
    const lst = fs.lstatSync(pinnedPath);
    if (!lst.isDirectory()) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID' };
    }
    if (lst.isSymbolicLink()) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID' };
    }
    const mode = lst.mode & 0o777;
    if (mode & 0o002) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID' };
    }
    if (!assertPinnedPathNotSymlink(pinnedPath, requireProductionSharedRoot)) {
      return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID' };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID' };
  }
}

export function evaluateProductionGate6IssuanceTrustAnchors(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failures: ProductionTrustAnchorFailure[] } {
  if (!isProductionGate6IssuanceContext(env)) {
    return { ok: true };
  }

  const failures: ProductionTrustAnchorFailure[] = [];

  if ((env[DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV] ?? '').trim()) {
    failures.push('HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN');
  }
  if ((env[DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE_ENV] ?? '').trim()) {
    failures.push('HUMAN_APPROVAL_ROOT_KEY_ENV_OVERRIDE_FORBIDDEN');
  }
  if ((env[DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV] ?? '').trim()) {
    failures.push('APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN');
  }

  const resolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const enforced = enforceExactProductionBackendEnvForLiveOpen(env, resolved);
  if (!enforced.ok) {
    for (const f of enforced.failures) {
      if (f === 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED') {
        failures.push('PRODUCTION_BACKEND_ENV_REALPATH_FAILED');
      } else {
        failures.push('PRODUCTION_BACKEND_ENV_TRUST_MISMATCH');
      }
    }
  }

  const publicKey = verifyPinnedRegularFileTrustAnchor(GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH, true);
  if (!publicKey.ok) failures.push(publicKey.failure);

  const register = verifyPinnedDirectoryTrustAnchor(GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR, true);
  if (!register.ok) failures.push(register.failure);

  if (
    !failures.includes('PRODUCTION_BACKEND_ENV_TRUST_MISMATCH') &&
    !failures.includes('PRODUCTION_BACKEND_ENV_REALPATH_FAILED') &&
    enforced.ok
  ) {
    try {
      const approved = fs.realpathSync(PRODUCTION_SHARED_BACKEND_ENV_PATH);
      if (approved !== enforced.trustedEnvPath) {
        failures.push('PRODUCTION_BACKEND_ENV_TRUST_MISMATCH');
      }
    } catch {
      failures.push('PRODUCTION_BACKEND_ENV_REALPATH_FAILED');
    }
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}

export function resolveProductionPinnedPublicKeyPath(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; path: string } | { ok: false; failure: ProductionTrustAnchorFailure } {
  if (!isProductionGate6IssuanceContext(env)) {
    return { ok: false, failure: 'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_MISSING' };
  }
  const anchor = evaluateProductionGate6IssuanceTrustAnchors(env);
  if (!anchor.ok) {
    const failure =
      anchor.failures.find((f) => f.startsWith('HUMAN_APPROVAL_PUBLIC_KEY')) ??
      anchor.failures[0] ??
      'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID';
    return { ok: false, failure };
  }
  return { ok: true, path: GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH };
}

export function resolveProductionPinnedConsumptionRegisterDir(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; dir: string } | { ok: false; failure: ProductionTrustAnchorFailure } {
  if (!isProductionGate6IssuanceContext(env)) {
    return { ok: false, failure: 'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_MISSING' };
  }
  const anchor = evaluateProductionGate6IssuanceTrustAnchors(env);
  if (!anchor.ok) {
    const failure =
      anchor.failures.find((f) => f.startsWith('APPROVAL_CONSUMPTION_REGISTER')) ??
      anchor.failures[0] ??
      'APPROVAL_CONSUMPTION_REGISTER_TRUST_ANCHOR_INVALID';
    return { ok: false, failure };
  }
  return { ok: true, dir: GATE6_PRODUCTION_APPROVAL_CONSUMPTION_REGISTER_DIR };
}

/** Engineering tests may simulate pinned Production paths under a temp shared root. */
export function evaluateProductionGate6IssuanceTrustAnchorsWithPinnedPaths(
  env: NodeJS.ProcessEnv,
  pinned: { publicKeyPath: string; registerDir: string; backendEnvPath: string },
): { ok: true } | { ok: false; failures: ProductionTrustAnchorFailure[] } {
  const failures: ProductionTrustAnchorFailure[] = [];
  if ((env[DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV] ?? '').trim()) {
    failures.push('HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN');
  }
  if ((env[DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR_ENV] ?? '').trim()) {
    failures.push('APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN');
  }
  try {
    const approved = fs.realpathSync(pinned.backendEnvPath);
    const candidate = fs.realpathSync((env.SYNQDRIVE_BACKEND_ENV ?? env.BACKEND_ENV ?? pinned.backendEnvPath).trim());
    if (approved !== candidate) failures.push('PRODUCTION_BACKEND_ENV_TRUST_MISMATCH');
  } catch {
    failures.push('PRODUCTION_BACKEND_ENV_REALPATH_FAILED');
  }
  const publicKey = verifyPinnedRegularFileTrustAnchor(pinned.publicKeyPath, false);
  if (!publicKey.ok) failures.push(publicKey.failure);
  const register = verifyPinnedDirectoryTrustAnchor(pinned.registerDir, false);
  if (!register.ok) failures.push(register.failure);
  return failures.length ? { ok: false, failures } : { ok: true };
}

export function productionTrustAnchorFixturePaths(
  fixtureRoot: string,
): { publicKeyPath: string; registerDir: string; backendEnvPath: string } {
  const shared = path.join(fixtureRoot, 'shared');
  return {
    backendEnvPath: path.join(shared, 'backend.env'),
    publicKeyPath: path.join(shared, 'gate6-live-open-approval-public.pem'),
    registerDir: path.join(shared, 'gate6-live-open-approval-consumption'),
  };
}
