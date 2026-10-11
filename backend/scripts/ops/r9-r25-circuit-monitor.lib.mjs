/** R2.5 — read-only R9 circuit-breaker evaluation (no provider mutation). */

export const R9_SPEED_ID = '7a5e81bc-8f48-4b62-877a-9df104c1f42e';
export const R9_IGNITION_ID = '3a2fcd34-1a74-45db-bee9-75e340f36b00';
export const EXPECTED_R9_COHORT = [186946, 187361, 187784, 192922];
export const EXCLUDED_TOKENS = [187336, 190497];

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
  const subs = [...subscriberTokenIds].sort((a, b) => a - b);
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

export function evaluateIngressProbe(httpStatus) {
  if (httpStatus === 200) return { ok: true, note: 'reachable_only_not_hmac_proof' };
  return { ok: false, alerts: [{ code: 'INGRESS_NON_200', severity: 'HIGH', httpStatus }] };
}
