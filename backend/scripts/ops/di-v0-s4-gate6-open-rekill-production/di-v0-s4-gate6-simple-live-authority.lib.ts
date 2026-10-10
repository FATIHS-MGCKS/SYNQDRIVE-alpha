import * as fs from 'fs';
import type { PrismaClient } from '@prisma/client';
import {
  DI_S4_GATE6_OPEN_ACK_ENV,
  DI_S4_GATE6_OPEN_AUTHORIZED_ENV,
  DI_S4_GATE6_ACCEPTED_ACK,
  evaluateGate6OpenGuards,
  resolveGate6OpenIntent,
  type Gate6OpenGuardInput,
  type Gate6OpenIntent,
} from './di-v0-s4-gate6-open-rekill-production.lib';
import { readGlobalKillState } from './di-v0-s4-gate6-open-orchestration.lib';
import {
  evaluateGate6ProductionPathIsolation,
  firstProductionFixtureControlPresent,
} from './di-v0-s4-gate6-live-authority.lib';
import {
  enforceExactProductionBackendEnvForLiveOpen,
  resolveCanonicalBackendEnvPathFromFilesystem,
  sha256FileHex,
} from './di-v0-s4-gate6-trusted-authority.lib';

export type SimpleLiveOpenAuthorityFailure =
  | 'BACKEND_ENV_PATH_UNTRUSTED'
  | 'BACKEND_ENV_HASH_PIN_MISMATCH'
  | 'GLOBAL_PRESTATE_NOT_KILLED'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'GATE6_ACK_INVALID'
  | 'GATE6_AUTHORIZATION_INVALID'
  | string;

export async function evaluateSimpleLiveOpenAuthority(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  guardInput: Gate6OpenGuardInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; failures: SimpleLiveOpenAuthorityFailure[]; trustedEnvPath?: string }> {
  const failures: SimpleLiveOpenAuthorityFailure[] = [];

  const isolation = evaluateGate6ProductionPathIsolation(env);
  if (!isolation.ok) failures.push(...isolation.failures);

  const pathResolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const exactProd = enforceExactProductionBackendEnvForLiveOpen(env, pathResolved);
  if (!exactProd.ok) failures.push(...exactProd.failures);
  else {
    const fixture = firstProductionFixtureControlPresent(env);
    if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);
  }

  if (env[DI_S4_GATE6_OPEN_ACK_ENV] !== DI_S4_GATE6_ACCEPTED_ACK) {
    failures.push('GATE6_ACK_INVALID');
  }
  if (env[DI_S4_GATE6_OPEN_AUTHORIZED_ENV] !== DI_S4_GATE6_ACCEPTED_ACK) {
    failures.push('GATE6_AUTHORIZATION_INVALID');
  }

  let trustedEnvPath: string | undefined;
  const requiredEnvSha = guardInput.requiredEnvSha256 ?? '';
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

  const openIntent: Gate6OpenIntent = resolveGate6OpenIntent(guardInput);

  const global = await readGlobalKillState(prisma);
  if (!global.ok) failures.push('GLOBAL_PRESTATE_READ_FAILED');
  else if (openIntent === 'INITIAL_OPEN' && global.killState !== 'KILLED') {
    failures.push('GLOBAL_PRESTATE_NOT_KILLED');
  } else if (openIntent === 'WAVE_PROMOTION' && global.killState !== 'NOT_KILLED') {
    failures.push('GLOBAL_PRESTATE_MUST_BE_NOT_KILLED_FOR_WAVE_PROMOTION');
  }

  const guards = evaluateGate6OpenGuards(guardInput);
  if (!guards.ok) failures.push(...guards.failures);

  return { ok: failures.length === 0, failures, trustedEnvPath };
}
