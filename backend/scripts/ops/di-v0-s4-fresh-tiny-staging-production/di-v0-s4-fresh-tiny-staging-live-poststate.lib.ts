/**
 * EXP-021 S4F-7Y.1 — independent final env poststate verification (ops-only).
 */
import { createHash } from 'crypto';
import {
  assertTargetKeyCardinality,
  computeSemanticEnvDiff,
  countEnvKeyOccurrences,
  TINY_STAGING_TARGET_KEYS,
} from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { SUPPORTED_ENV_MUTATION_KEY_COUNT } from './di-v0-s4-fresh-tiny-staging-production.lib';

export interface LiveStagingPostStateInput {
  backupContent: string;
  currentContent: string;
  authorizedPreEnvSha256: string;
  authorizedStagingValues: Readonly<Record<string, string>>;
}

export function sha256Utf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function verifyLiveStagingPostState(input: LiveStagingPostStateInput): {
  ok: boolean;
  backupShaMatches: boolean;
  authorizedValuesExact: boolean;
  targetCardinalityOk: boolean;
  envChangedKeyCount: number;
  unexpectedChangedKeyCount: number;
} {
  const backupSha = sha256Utf8(input.backupContent);
  const backupShaMatches = backupSha === input.authorizedPreEnvSha256.trim();

  const cardinality = assertTargetKeyCardinality(input.currentContent);
  const targetCardinalityOk = cardinality.ok;

  const diff = computeSemanticEnvDiff(input.backupContent, input.currentContent);
  const envChangedKeyCount = diff.envChangedKeyCount;
  const unexpectedChangedKeyCount = diff.unexpectedChangedKeyCount;

  const envMap = envMapFromFileContent(input.currentContent);
  let authorizedValuesExact = true;
  for (const key of TINY_STAGING_TARGET_KEYS) {
    const expected = input.authorizedStagingValues[key];
    const actual = envMap[key];
    if (countEnvKeyOccurrences(input.currentContent, key) !== 1) {
      authorizedValuesExact = false;
      break;
    }
    if ((actual ?? '') !== expected) {
      authorizedValuesExact = false;
      break;
    }
  }

  const ok =
    backupShaMatches &&
    targetCardinalityOk &&
    authorizedValuesExact &&
    diff.ok &&
    envChangedKeyCount === SUPPORTED_ENV_MUTATION_KEY_COUNT &&
    unexpectedChangedKeyCount === 0;

  return {
    ok,
    backupShaMatches,
    authorizedValuesExact,
    targetCardinalityOk,
    envChangedKeyCount,
    unexpectedChangedKeyCount,
  };
}
