import type { Logger } from '@nestjs/common';

export type DimoProviderLimiterLogEvent =
  | 'canary_selected'
  | 'enforce_admission_timeout'
  | 'provider_429'
  | 'provider_403_persistent'
  | 'cooldown_activation'
  | 'redis_fail_open'
  | 'limiter_disabled'
  | 'limiter_fallback';

const throttleState = new Map<string, number>();

export interface DimoProviderLimiterLogPayload {
  event: DimoProviderLimiterLogEvent;
  category?: string;
  priority?: string;
  mode?: string;
  rolloutState?: string;
  organizationId?: string;
  vehicleId?: string;
  canaryReason?: string;
  canaryHashBucket?: number;
  retryAfterSeconds?: number;
  waitedMs?: number;
  reason?: string;
  message?: string;
}

function throttleKey(payload: DimoProviderLimiterLogPayload): string {
  return [
    payload.event,
    payload.category ?? '',
    payload.organizationId ?? '',
    payload.vehicleId ?? '',
    payload.reason ?? '',
  ].join(':');
}

/**
 * Structured, throttled limiter logs — state-change oriented to avoid spam.
 */
export function logDimoProviderLimiterEvent(
  logger: Logger,
  payload: DimoProviderLimiterLogPayload,
  options: { level?: 'log' | 'warn' | 'debug'; throttleMs?: number } = {},
): void {
  const level = options.level ?? 'log';
  const throttleMs = options.throttleMs ?? 60_000;
  const key = throttleKey(payload);
  const now = Date.now();
  const last = throttleState.get(key) ?? 0;
  if (throttleMs > 0 && now - last < throttleMs) {
    return;
  }
  throttleState.set(key, now);

  const line = JSON.stringify({
    dimo_provider_limiter: payload.event,
    ts: new Date(now).toISOString(),
    ...payload,
  });

  switch (level) {
    case 'warn':
      logger.warn(line);
      break;
    case 'debug':
      logger.debug(line);
      break;
    default:
      logger.log(line);
  }
}

/** Test-only reset for throttle map. */
export function resetDimoProviderLimiterLogThrottle(): void {
  throttleState.clear();
}
