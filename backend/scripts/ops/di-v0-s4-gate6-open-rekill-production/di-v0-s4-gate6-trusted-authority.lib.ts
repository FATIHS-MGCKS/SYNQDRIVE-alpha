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

export function resolveCanonicalBackendEnvPathFromFilesystem(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; canonicalPath: string } | { ok: false; reason: string } {
  const candidate = (env.SYNQDRIVE_BACKEND_ENV ?? env.BACKEND_ENV ?? PRODUCTION_SHARED_BACKEND_ENV_PATH).trim();
  if (!candidate) return { ok: false, reason: 'BACKEND_ENV_CANDIDATE_MISSING' };
  try {
    const canonicalPath = fs.realpathSync(candidate);
    return { ok: true, canonicalPath };
  } catch {
    return { ok: false, reason: 'BACKEND_ENV_REALPATH_FAILED' };
  }
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
  if (!pathResolved.ok) {
    failures.push(pathResolved.reason);
  } else if (pathResolved.canonicalPath === PRODUCTION_SHARED_BACKEND_ENV_PATH) {
    const fixture = firstProductionFixtureControlPresent(env);
    if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);
  }

  if (token.gate6Ack !== 'YES' || token.gate6Authorized !== 'YES') {
    failures.push('DISPATCH_GATE6_ACK_MISMATCH');
  }
  if (env.DI_S4_GATE6_OPEN_ACK !== 'YES' || env.DI_S4_GATE6_OPEN_AUTHORIZED !== 'YES') {
    failures.push('DISPATCH_GATE6_ACK_MISMATCH');
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
  if (pathResolved.ok) {
    trustedEnvPath = pathResolved.canonicalPath;
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
