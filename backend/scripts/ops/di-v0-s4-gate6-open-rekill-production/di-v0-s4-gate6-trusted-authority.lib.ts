import { createHash } from 'crypto';
import * as fs from 'fs';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';

export function resolveCanonicalBackendEnvPathFromFilesystem(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; canonicalPath: string } | { ok: false; reason: string } {
  const candidate = (env.SYNQDRIVE_BACKEND_ENV ?? env.BACKEND_ENV ?? '').trim();
  if (!candidate) return { ok: false, reason: 'BACKEND_ENV_CANDIDATE_MISSING' };
  try {
    const canonicalPath = fs.realpathSync(candidate);
    return { ok: true, canonicalPath };
  } catch {
    return { ok: false, reason: 'BACKEND_ENV_REALPATH_FAILED' };
  }
}

export function resolveApprovedProductionBackendEnvPath(): { ok: true; canonicalPath: string } | { ok: false; reason: string } {
  try {
    const canonicalPath = fs.realpathSync(PRODUCTION_SHARED_BACKEND_ENV_PATH);
    return { ok: true, canonicalPath };
  } catch {
    return { ok: false, reason: 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED' };
  }
}

/**
 * Live OPEN must use the approved Production backend.env — not env claims or symlink hops to other targets.
 */
export function enforceExactProductionBackendEnvForLiveOpen(
  env: NodeJS.ProcessEnv,
  resolvedCandidate: { ok: true; canonicalPath: string } | { ok: false; reason: string },
  options?: { permitFixtureAlternateBackendEnv?: boolean },
): { ok: true; trustedEnvPath: string } | { ok: false; failures: string[] } {
  if (
    options?.permitFixtureAlternateBackendEnv &&
    (env.DI_S4F7AS_FIXTURE_MODE === '1' || env.DI_S4F7J_FIXTURE_MODE === '1')
  ) {
    if (!resolvedCandidate.ok) return { ok: false, failures: [resolvedCandidate.reason] };
    return { ok: true, trustedEnvPath: resolvedCandidate.canonicalPath };
  }
  const approved = resolveApprovedProductionBackendEnvPath();
  if (!approved.ok) return { ok: false, failures: [approved.reason] };
  if (!resolvedCandidate.ok) return { ok: false, failures: [resolvedCandidate.reason] };
  if (resolvedCandidate.canonicalPath !== approved.canonicalPath) {
    return { ok: false, failures: ['EXACT_PRODUCTION_BACKEND_ENV_MISMATCH'] };
  }
  const claimed = (env.SYNQDRIVE_BACKEND_ENV_CANONICAL ?? '').trim();
  if (claimed && claimed !== approved.canonicalPath) {
    return { ok: false, failures: ['BACKEND_ENV_CANONICAL_CLAIM_MISMATCH'] };
  }
  return { ok: true, trustedEnvPath: approved.canonicalPath };
}

export function sha256FileHex(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
