/**
 * Aligned with backend/scripts/ops/r9-r25-circuit-monitor.lib.mjs (R9 monitor contracts).
 */

export const R9_SPEED_ID = '7a5e81bc-8f48-4b62-877a-9df104c1f42e';
export const R9_IGNITION_ID = '3a2fcd34-1a74-45db-bee9-75e340f36b00';

export const R9_DEFINITION_CONTRACTS = {
  speed: {
    service: 'signals',
    metricName: 'vss.speed',
    condition: 'valueNumber > 3',
    coolDownPeriod: 30,
    displayName: 'SynqDrive R9 Speed Wake',
  },
  ignition: {
    service: 'signals',
    metricName: 'vss.isIgnitionOn',
    condition: 'valueNumber == 1',
    coolDownPeriod: 30,
    displayName: 'SynqDrive R9 Ignition Wake',
  },
};

export interface R9WebhookAlert {
  code: string;
  severity: string;
  field?: string;
  status?: string;
  failureCount?: number;
  tokenId?: number;
  expected?: number[];
  actual?: number[];
  httpStatus?: number;
}

export function uniqueSortedTokenIds(tokenIds: number[]): number[] {
  return [...new Set(tokenIds)].sort((a, b) => a - b);
}

export function parseSubscriberList(raw: unknown): {
  ok: boolean;
  error?: string;
  tokenIds: number[];
  index?: number;
} {
  if (!Array.isArray(raw)) return { ok: false, error: 'SUBSCRIBERS_NOT_ARRAY', tokenIds: [] };
  const tokenIds: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (entry === null || entry === undefined || entry === '') {
      return { ok: false, error: 'SUBSCRIBER_ENTRY_EMPTY', tokenIds: [], index: i };
    }
    const did =
      typeof entry === 'string'
        ? entry
        : (entry as { assetDID?: string; assetDid?: string })?.assetDID ??
          (entry as { assetDid?: string })?.assetDid ??
          '';
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

function contractAlerts(
  definition: Record<string, unknown>,
  contract: Record<string, unknown> | null,
): R9WebhookAlert[] {
  const alerts: R9WebhookAlert[] = [];
  if (!contract) return alerts;
  for (const key of ['service', 'metricName', 'condition', 'displayName']) {
    if (definition[key] !== contract[key]) {
      alerts.push({
        code: 'DEFINITION_CONTRACT_DRIFT',
        severity: 'CRITICAL',
        field: key,
      });
    }
  }
  if (
    typeof contract.coolDownPeriod === 'number' &&
    definition.coolDownPeriod !== contract.coolDownPeriod
  ) {
    alerts.push({
      code: 'DEFINITION_CONTRACT_DRIFT',
      severity: 'HIGH',
      field: 'coolDownPeriod',
    });
  }
  return alerts;
}

export function evaluateR9DefinitionHealth(
  definition: Record<string, unknown> | null | undefined,
  subscriberTokenIds: number[],
  contract: Record<string, unknown> | null,
  options: { expectedCohort?: number[]; excludedTokens?: number[] } = {},
): { healthy: boolean; alerts: R9WebhookAlert[] } {
  const alerts: R9WebhookAlert[] = [];
  if (!definition) {
    alerts.push({ code: 'DEFINITION_MISSING', severity: 'CRITICAL' });
    return { healthy: false, alerts };
  }
  if (definition.status !== 'enabled') {
    alerts.push({
      code: 'STATUS_NOT_ENABLED',
      severity: 'CRITICAL',
      status: String(definition.status),
    });
  }
  const failureCount = definition.failureCount;
  if (typeof failureCount !== 'number' || Number.isNaN(failureCount)) {
    alerts.push({ code: 'FAILURE_COUNT_UNKNOWN', severity: 'CRITICAL' });
  } else if (failureCount > 0) {
    alerts.push({
      code: 'FAILURE_COUNT_NONZERO',
      severity: 'HIGH',
      failureCount,
    });
  }
  alerts.push(...contractAlerts(definition, contract));

  const subs = uniqueSortedTokenIds(subscriberTokenIds);
  const expected = [...(options.expectedCohort ?? [])].sort((a, b) => a - b);
  if (JSON.stringify(subs) !== JSON.stringify(expected)) {
    alerts.push({ code: 'COHORT_DRIFT', severity: 'CRITICAL', expected, actual: subs });
  }
  for (const t of options.excludedTokens ?? []) {
    if (subs.includes(t)) {
      alerts.push({ code: 'EXCLUDED_TOKEN_SUBSCRIBED', severity: 'CRITICAL', tokenId: t });
    }
  }
  return { healthy: alerts.length === 0, alerts };
}

export function classifyDimoApiError(err: {
  response?: { status?: number };
  message?: string;
  code?: string;
}): { state: string; message?: string; httpStatus?: number } {
  if (!err) return { state: 'UNKNOWN', message: 'empty_error' };
  const status = err.response?.status;
  if (status === 401 || status === 403) return { state: 'AUTH_ERROR', httpStatus: status };
  if (status === 429) return { state: 'RATE_LIMIT', httpStatus: status };
  if (status != null && status >= 500) return { state: 'PROVIDER_5XX', httpStatus: status };
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return { state: 'TIMEOUT' };
  const msg = String(err.message || 'error');
  const redacted = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  return { state: 'ERROR', message: redacted.slice(0, 200) };
}
