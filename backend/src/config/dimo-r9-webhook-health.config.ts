import { registerAs } from '@nestjs/config';

function parseTokenIdList(raw: string | undefined): number[] | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

const DEFAULT_AUTHORIZED_COHORT = [186946, 187361, 187784, 192922];
const DEFAULT_EXCLUDED = [187336, 190497];

function resolveCohortConfig() {
  const cohortConfigErrors: string[] = [];
  let authorizedCohortTokenIds = DEFAULT_AUTHORIZED_COHORT;
  let excludedTokenIds = DEFAULT_EXCLUDED;

  const authEnv = process.env.DIMO_R9_AUTHORIZED_COHORT_TOKEN_IDS;
  if (authEnv?.trim()) {
    const parsed = parseTokenIdList(authEnv);
    if (!parsed || parsed.length === 0) {
      cohortConfigErrors.push('INVALID_AUTHORIZED_COHORT_TOKEN_IDS');
    } else {
      authorizedCohortTokenIds = parsed;
    }
  }

  const exclEnv = process.env.DIMO_R9_EXCLUDED_TOKEN_IDS;
  if (exclEnv?.trim()) {
    const parsed = parseTokenIdList(exclEnv);
    if (!parsed || parsed.length === 0) {
      cohortConfigErrors.push('INVALID_EXCLUDED_TOKEN_IDS');
    } else {
      excludedTokenIds = parsed;
    }
  }

  if (authorizedCohortTokenIds.length === 0) {
    cohortConfigErrors.push('EMPTY_AUTHORIZED_COHORT');
  }
  const overlap = authorizedCohortTokenIds.filter((t) => excludedTokenIds.includes(t));
  if (overlap.length > 0) {
    cohortConfigErrors.push('COHORT_AUTHORIZED_EXCLUDED_OVERLAP');
  }

  return {
    authorizedCohortTokenIds,
    excludedTokenIds,
    cohortConfigValid: cohortConfigErrors.length === 0,
    cohortConfigErrors,
  };
}

export default registerAs('dimoR9WebhookHealth', () => {
  const cohort = resolveCohortConfig();
  return {
    cacheTtlMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_CACHE_TTL_MS || '45000', 10),
    minProviderFetchIntervalMs: parseInt(
      process.env.DIMO_R9_WEBHOOK_HEALTH_MIN_FETCH_MS || '60000',
      10,
    ),
    staleAfterMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_STALE_AFTER_MS || '300000', 10),
    ...cohort,
    redisCacheKey: 'platform:dimo:r9-webhook-health:snapshot:v1',
    redisLockKey: 'platform:dimo:r9-webhook-health:fetch-lock:v1',
    redisLastFetchKey: 'platform:dimo:r9-webhook-health:last-fetch-ms:v1',
    redisLockTtlMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_LOCK_TTL_MS || '25000', 10),
    lockContentionWaitMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_LOCK_WAIT_MS || '3000', 10),
  };
});
