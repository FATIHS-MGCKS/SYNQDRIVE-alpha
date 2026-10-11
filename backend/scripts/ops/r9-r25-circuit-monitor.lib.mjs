/** R2.6 — read-only R9 circuit-breaker evaluation (no provider mutation, no webhook POST). */

export const R9_SPEED_ID = '7a5e81bc-8f48-4b62-877a-9df104c1f42e';
export const R9_IGNITION_ID = '3a2fcd34-1a74-45db-bee9-75e340f36b00';
export const EXPECTED_R9_COHORT = [186946, 187361, 187784, 192922];
export const EXCLUDED_TOKENS = [187336, 190497];

export function uniqueSortedTokenIds(tokenIds) {
  return [...new Set(tokenIds)].sort((a, b) => a - b);
}

export function parseSubscriberList(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'SUBSCRIBERS_NOT_ARRAY', tokenIds: [] };
  const tokenIds = [];
  for (const entry of raw) {
    const did = typeof entry === 'string' ? entry : entry?.assetDID ?? entry?.assetDid ?? '';
    const m = String(did).match(/:(\d+)$/);
    if (m) tokenIds.push(parseInt(m[1], 10));
  }
  return { ok: true, tokenIds: uniqueSortedTokenIds(tokenIds) };
}

export function evaluateR9DefinitionHealth(definition, subscriberTokenIds) {
  const alerts = [];
  if (!definition) {
    alerts.push({ code: 'DEFINITION_MISSING', severity: 'CRITICAL' });
    return { healthy: false, alerts };
  }
  if (definition.status !== 'enabled') {
    alerts.push({ code: 'STATUS_NOT_ENABLED', severity: 'CRITICAL', status: definition.status });
  }
  if (typeof definition.failureCount === 'number' && definition.failureCount > 0) {
    alerts.push({
      code: 'FAILURE_COUNT_NONZERO',
      severity: 'HIGH',
      failureCount: definition.failureCount,
    });
  }
  const subs = uniqueSortedTokenIds(subscriberTokenIds);
  const expected = [...EXPECTED_R9_COHORT].sort((a, b) => a - b);
  if (JSON.stringify(subs) !== JSON.stringify(expected)) {
    alerts.push({ code: 'COHORT_DRIFT', severity: 'CRITICAL', expected, actual: subs });
  }
  for (const t of EXCLUDED_TOKENS) {
    if (subs.includes(t)) {
      alerts.push({ code: 'EXCLUDED_TOKEN_SUBSCRIBED', severity: 'CRITICAL', tokenId: t });
    }
  }
  return { healthy: alerts.length === 0, alerts };
}

export function evaluatePublicHealthGet(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) {
    return { ok: true, kind: 'PUBLIC_HEALTH_GET' };
  }
  return {
    ok: false,
    kind: 'PUBLIC_HEALTH_GET',
    alerts: [{ code: 'PUBLIC_HEALTH_NON_2XX', severity: 'HIGH', httpStatus }],
  };
}

export function classifyDimoApiError(err) {
  if (!err) return { state: 'UNKNOWN', message: 'empty_error' };
  const status = err.response?.status;
  if (status === 401 || status === 403) return { state: 'AUTH_ERROR', httpStatus: status };
  if (status === 429) return { state: 'RATE_LIMIT', httpStatus: status };
  if (status >= 500) return { state: 'PROVIDER_5XX', httpStatus: status };
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return { state: 'TIMEOUT' };
  return { state: 'ERROR', message: String(err.message || err) };
}
