/** R2.7 — read-only R9 circuit-breaker evaluation (no provider mutation, no webhook POST). */

import { EXPECTED_IGNITION, EXPECTED_SPEED } from './r9-r24-webhook-recovery.lib.mjs';

export const R9_SPEED_ID = '7a5e81bc-8f48-4b62-877a-9df104c1f42e';
export const R9_IGNITION_ID = '3a2fcd34-1a74-45db-bee9-75e340f36b00';
export const EXPECTED_R9_COHORT = [186946, 187361, 187784, 192922];
export const EXCLUDED_TOKENS = [187336, 190497];

export const R9_DEFINITION_CONTRACTS = {
  speed: EXPECTED_SPEED,
  ignition: EXPECTED_IGNITION,
};

export function uniqueSortedTokenIds(tokenIds) {
  return [...new Set(tokenIds)].sort((a, b) => a - b);
}

export function parseSubscriberList(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'SUBSCRIBERS_NOT_ARRAY', tokenIds: [] };
  const tokenIds = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (entry === null || entry === undefined || entry === '') {
      return { ok: false, error: 'SUBSCRIBER_ENTRY_EMPTY', tokenIds: [], index: i };
    }
    const did = typeof entry === 'string' ? entry : entry?.assetDID ?? entry?.assetDid ?? '';
    if (!did) {
      return { ok: false, error: 'SUBSCRIBER_DID_MISSING', tokenIds: [], index: i };
    }
    const m = String(did).match(/:(\d+)$/);
    if (!m) {
      return { ok: false, error: 'SUBSCRIBER_DID_UNPARSEABLE', tokenIds: [], index: i };
    }
    tokenIds.push(parseInt(m[1], 10));
  }
  return { ok: true, tokenIds: uniqueSortedTokenIds(tokenIds) };
}

function contractAlerts(definition, contract) {
  const alerts = [];
  if (!contract) return alerts;
  for (const key of ['service', 'metricName', 'condition', 'displayName']) {
    if (definition[key] !== contract[key]) {
      alerts.push({
        code: 'DEFINITION_CONTRACT_DRIFT',
        severity: 'CRITICAL',
        field: key,
        expected: contract[key],
        actual: definition[key],
      });
    }
  }
  if (typeof contract.coolDownPeriod === 'number' && definition.coolDownPeriod !== contract.coolDownPeriod) {
    alerts.push({
      code: 'DEFINITION_CONTRACT_DRIFT',
      severity: 'HIGH',
      field: 'coolDownPeriod',
      expected: contract.coolDownPeriod,
      actual: definition.coolDownPeriod,
    });
  }
  return alerts;
}

export function evaluateR9DefinitionHealth(definition, subscriberTokenIds, contract = null) {
  const alerts = [];
  if (!definition) {
    alerts.push({ code: 'DEFINITION_MISSING', severity: 'CRITICAL' });
    return { healthy: false, alerts };
  }
  if (definition.status !== 'enabled') {
    alerts.push({ code: 'STATUS_NOT_ENABLED', severity: 'CRITICAL', status: definition.status });
  }
  if (typeof definition.failureCount !== 'number' || Number.isNaN(definition.failureCount)) {
    alerts.push({ code: 'FAILURE_COUNT_UNKNOWN', severity: 'CRITICAL' });
  } else if (definition.failureCount > 0) {
    alerts.push({
      code: 'FAILURE_COUNT_NONZERO',
      severity: 'HIGH',
      failureCount: definition.failureCount,
    });
  }
  alerts.push(...contractAlerts(definition, contract));

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
  const msg = String(err.message || 'error');
  const redacted = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  return { state: 'ERROR', message: redacted.slice(0, 200) };
}
