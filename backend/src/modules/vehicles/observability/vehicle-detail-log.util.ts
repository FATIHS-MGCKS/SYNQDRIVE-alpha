/**
 * PII-safe structured logging for Vehicle Detail telemetry paths.
 * Never log exact coordinates, tokens, secrets, or raw provider payloads.
 */
export type VehicleDetailLogContext = Record<string, string | number | boolean | null | undefined>;

const COORD_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'coordinates',
  'targetPosition',
  'lastConfirmedPosition',
]);

const SECRET_KEYS = new Set([
  'token',
  'accessToken',
  'access_token',
  'authorization',
  'jwt',
  'apiKey',
  'api_key',
  'secret',
  'password',
]);

export function redactVehicleDetailLogContext(
  context: VehicleDetailLogContext,
): VehicleDetailLogContext {
  const safe: VehicleDetailLogContext = {};
  for (const [key, value] of Object.entries(context)) {
    const lower = key.toLowerCase();
    if (COORD_KEYS.has(lower) || SECRET_KEYS.has(lower)) continue;
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password')) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function classifyVehicleDetailProviderError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const anyErr = err as {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
    response?: { status?: number };
  };
  const status = anyErr.status ?? anyErr.response?.status;
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 408 || anyErr.code === 'ECONNABORTED' || anyErr.code === 'ETIMEDOUT') {
    return 'timeout';
  }
  const message = `${anyErr.name ?? ''} ${anyErr.message ?? ''}`.toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('429') || message.includes('rate limit')) return 'rate_limited';
  if (message.includes('token') || message.includes('unauthorized')) return 'auth';
  if (message.includes('forbidden')) return 'forbidden';
  return 'provider_error';
}
