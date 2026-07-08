import { timingSafeEqual } from 'node:crypto';
import type { MetricsConfigShape } from '@config/metrics.config';

export type MetricsAccessDecision =
  | { allowed: true }
  | { allowed: false; statusCode: 404 | 403; reason: string };

export interface MetricsRequestAuthContext {
  clientIp: string | null;
  authorizationHeader?: string | null;
  metricsTokenHeader?: string | null;
}

const FORBIDDEN_PROMETHEUS_LABELS = [
  'vehicle_id',
  'vin',
  'booking_id',
  'customer_id',
  'trip_id',
  'org_id',
] as const;

export { FORBIDDEN_PROMETHEUS_LABELS };

export function resolveMetricsClientIp(input: {
  xForwardedFor?: string | string[] | null;
  remoteAddress?: string | null;
}): string | null {
  const forwarded = input.xForwardedFor;
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim() || null;
  }
  return input.remoteAddress?.trim() || null;
}

export function extractMetricsBearerToken(
  authorizationHeader?: string | null,
): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || null;
}

function tokensEqual(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

function isIpAllowed(clientIp: string | null, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) return true;
  if (!clientIp) return false;
  return allowedIps.includes(clientIp);
}

/**
 * Pure access evaluator for GET /metrics — unit-tested without HTTP/Nest wiring.
 */
export function evaluateMetricsAccess(
  config: MetricsConfigShape,
  request: MetricsRequestAuthContext,
): MetricsAccessDecision {
  if (!config.enabled) {
    return {
      allowed: false,
      statusCode: 404,
      reason: 'metrics_disabled',
    };
  }

  if (!isIpAllowed(request.clientIp, config.allowedIps)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'ip_not_allowed',
    };
  }

  if (!config.requireToken) {
    return { allowed: true };
  }

  if (!config.token) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'token_required_but_not_configured',
    };
  }

  const provided =
    extractMetricsBearerToken(request.authorizationHeader) ??
    request.metricsTokenHeader?.trim() ??
    null;

  if (!provided || !tokensEqual(config.token, provided)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'invalid_or_missing_token',
    };
  }

  return { allowed: true };
}
