import { createHash } from 'crypto';
import * as fs from 'fs';
import type { PrismaClient } from '@prisma/client';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import type { LiveOpenDispatchTokenRecord } from './di-v0-s4-gate6-dispatch-token.lib';
import { evaluateGate6OpenGuards, type Gate6OpenGuardInput } from './di-v0-s4-gate6-open-rekill-production.lib';
import { readGlobalKillState } from './di-v0-s4-gate6-open-orchestration.lib';
import {
  evaluateGate6ProductionPathIsolation,
  firstProductionFixtureControlPresent,
} from './di-v0-s4-gate6-live-authority.lib';
import { DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID_ENV } from './di-v0-s4-gate6-human-approval.lib';

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

export type TrustedLiveOpenAuthorityFailure =
  | 'BACKEND_ENV_PATH_UNTRUSTED'
  | 'BACKEND_ENV_HASH_PIN_MISMATCH'
  | 'GLOBAL_PRESTATE_NOT_KILLED'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'DISPATCH_TOKEN_PINS_MISMATCH'
  | 'DISPATCH_GATE6_ACK_MISMATCH'
  | 'DISPATCH_APPROVAL_ID_MISMATCH'
  | 'EXACT_PRODUCTION_BACKEND_ENV_MISMATCH'
  | 'BACKEND_ENV_CANONICAL_CLAIM_MISMATCH'
  | string;

export async function evaluateTrustedLiveOpenAuthority(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  guardInput: Gate6OpenGuardInput,
  token: LiveOpenDispatchTokenRecord,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; failures: TrustedLiveOpenAuthorityFailure[]; trustedEnvPath?: string }> {
  const failures: TrustedLiveOpenAuthorityFailure[] = [];

  const isolation = evaluateGate6ProductionPathIsolation(env);
  if (!isolation.ok) failures.push(...isolation.failures);

  const pathResolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const exactProd = enforceExactProductionBackendEnvForLiveOpen(env, pathResolved);
  if (!exactProd.ok) failures.push(...exactProd.failures);
  else {
    const approved = resolveApprovedProductionBackendEnvPath();
    if (approved.ok && exactProd.trustedEnvPath === approved.canonicalPath) {
      const fixture = firstProductionFixtureControlPresent(env);
      if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);
    }
  }

  if (env.DI_S4_GATE6_OPEN_ACK !== 'YES' || env.DI_S4_GATE6_OPEN_AUTHORIZED !== 'YES') {
    failures.push('DISPATCH_GATE6_ACK_MISMATCH');
  }
  const approvalIdEnv = (env[DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID_ENV] ?? '').trim();
  if (!approvalIdEnv || approvalIdEnv !== token.approvalId) {
    failures.push('DISPATCH_APPROVAL_ID_MISMATCH');
  }

  const requiredSha = guardInput.requiredSha ?? '';
  const requiredRelease = guardInput.requiredReleaseId ?? '';
  const requiredEnvSha = guardInput.requiredEnvSha256 ?? '';
  if (
    token.requiredSha !== requiredSha ||
    token.requiredReleaseId !== requiredRelease ||
    token.requiredEnvSha256 !== requiredEnvSha
  ) {
    failures.push('DISPATCH_TOKEN_PINS_MISMATCH');
  }

  let trustedEnvPath: string | undefined;
  if (exactProd.ok) {
    trustedEnvPath = exactProd.trustedEnvPath;
    try {
      const diskSha = sha256FileHex(trustedEnvPath);
      if (diskSha !== requiredEnvSha) failures.push('BACKEND_ENV_HASH_PIN_MISMATCH');
      guardInput = {
        ...guardInput,
        actualEnvSha256: diskSha,
        envContent: fs.readFileSync(trustedEnvPath, 'utf8'),
      };
    } catch {
      failures.push('BACKEND_ENV_PATH_UNTRUSTED');
    }
  }

  const global = await readGlobalKillState(prisma);
  if (!global.ok) failures.push('GLOBAL_PRESTATE_READ_FAILED');
  else if (global.killState !== 'KILLED') failures.push('GLOBAL_PRESTATE_NOT_KILLED');

  const guards = evaluateGate6OpenGuards(guardInput);
  if (!guards.ok) failures.push(...guards.failures);

  if (token.reason !== (env.DI_S4_GATE6_OPERATOR_REASON ?? '').trim() || token.actor !== (env.DI_S4_GATE6_OPERATOR_ACTOR ?? '').trim()) {
    failures.push('DISPATCH_TOKEN_PINS_MISMATCH');
  }

  return { ok: failures.length === 0, failures, trustedEnvPath };
}
