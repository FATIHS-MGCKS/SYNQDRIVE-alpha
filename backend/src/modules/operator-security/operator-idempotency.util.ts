import { createHash } from 'crypto';

export const OPERATOR_IDEMPOTENCY_HEADER = 'idempotency-key';

export function readOperatorIdempotencyKey(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const raw = headers?.[OPERATOR_IDEMPOTENCY_HEADER] ?? headers?.['Idempotency-Key'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 128);
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim().slice(0, 128);
  return null;
}

export function buildOperatorIdempotencyRedisKey(
  organizationId: string,
  scope: string,
  idempotencyKey: string,
): string {
  const digest = createHash('sha256')
    .update(`${organizationId}:${scope}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 40);
  return `synqdrive:operator:idempotency:${digest}`;
}

export function buildOperatorIdempotencyLockKey(redisKey: string): string {
  return `${redisKey}:lock`;
}
