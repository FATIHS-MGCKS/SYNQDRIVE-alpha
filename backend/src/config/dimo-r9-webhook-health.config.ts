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

export default registerAs('dimoR9WebhookHealth', () => ({
  cacheTtlMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_CACHE_TTL_MS || '45000', 10),
  minProviderFetchIntervalMs: parseInt(
    process.env.DIMO_R9_WEBHOOK_HEALTH_MIN_FETCH_MS || '60000',
    10,
  ),
  staleAfterMs: parseInt(process.env.DIMO_R9_WEBHOOK_HEALTH_STALE_AFTER_MS || '300000', 10),
  authorizedCohortTokenIds:
    parseTokenIdList(process.env.DIMO_R9_AUTHORIZED_COHORT_TOKEN_IDS) ?? [
      186946,
      187361,
      187784,
      192922,
    ],
  excludedTokenIds:
    parseTokenIdList(process.env.DIMO_R9_EXCLUDED_TOKEN_IDS) ?? [187336, 190497],
  redisCacheKey: 'platform:dimo:r9-webhook-health:snapshot:v1',
  redisLockKey: 'platform:dimo:r9-webhook-health:fetch-lock:v1',
  redisLastFetchKey: 'platform:dimo:r9-webhook-health:last-fetch-ms:v1',
}));
