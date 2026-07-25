import { registerAs } from '@nestjs/config';

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

/**
 * Operator WebApp endpoint hardening — rate limits, idempotency TTL, feature flags.
 * Upload abuse is handled separately by DocumentUploadRateLimitService.
 */
export default registerAs('operatorSecurity', () => ({
  rateLimitEnabled: parseBooleanEnv(process.env.OPERATOR_RATE_LIMIT_ENABLED, true),
  /** Fixed window for scan/search booking lookups (per user). */
  scanMaxPerUserPerWindow: parsePositiveIntEnv(process.env.OPERATOR_SCAN_RATE_LIMIT_PER_USER, 90),
  /** Fixed window for completion mutations (handover, task complete, no-show). */
  completionMaxPerUserPerWindow: parsePositiveIntEnv(
    process.env.OPERATOR_COMPLETION_RATE_LIMIT_PER_USER,
    45,
  ),
  /** Fixed window for manual pickup verification checks. */
  verificationMaxPerUserPerWindow: parsePositiveIntEnv(
    process.env.OPERATOR_VERIFICATION_RATE_LIMIT_PER_USER,
    30,
  ),
  rateLimitWindowMs: parsePositiveIntEnv(process.env.OPERATOR_RATE_LIMIT_WINDOW_MS, 60_000),
  idempotencyEnabled: parseBooleanEnv(process.env.OPERATOR_IDEMPOTENCY_ENABLED, true),
  idempotencyTtlSeconds: parsePositiveIntEnv(process.env.OPERATOR_IDEMPOTENCY_TTL_SECONDS, 86_400),
  idempotencyLockTtlSeconds: parsePositiveIntEnv(
    process.env.OPERATOR_IDEMPOTENCY_LOCK_TTL_SECONDS,
    120,
  ),
}));
