import type { OperatorApiRoute } from './operator-prometheus.metrics';

const OPERATOR_ROUTE_PATTERNS: Array<{ test: RegExp; route: OperatorApiRoute }> = [
  { test: /\/handover\/pickup\b/i, route: 'handover_pickup' },
  { test: /\/handover\/return\b/i, route: 'handover_return' },
  { test: /\/handover\b/i, route: 'handover_list' },
  { test: /\/bookings\/today\//i, route: 'bookings_list' },
  { test: /\/bookings\/[^/]+\/detail\b/i, route: 'bookings_detail' },
  { test: /\/bookings\/[^/]+\b/i, route: 'bookings_scan' },
  { test: /\/bookings\b/i, route: 'bookings_list' },
  { test: /\/tasks\/[^/]+\/complete\b/i, route: 'tasks_complete' },
  { test: /\/tasks\/[^/]+\b/i, route: 'tasks_detail' },
  { test: /\/tasks\b/i, route: 'tasks_list' },
  { test: /\/customers\/[^/]+\/documents\b/i, route: 'customers_documents' },
  { test: /\/customers\/[^/]+\b/i, route: 'customers_detail' },
  { test: /\/document-extractions\b/i, route: 'document_upload' },
  { test: /\/documents\/[^/]+\/download\b/i, route: 'document_download' },
  { test: /\/customer-verification\/manual-pickup-check\b/i, route: 'verification_pickup_check' },
  { test: /\/damages\b/i, route: 'damages' },
  { test: /\/tire-measurements\b|\/tires\/health\b/i, route: 'tire_measure' },
];

export function isOperatorApiPath(path: string): boolean {
  return resolveOperatorApiRoute(path) !== null;
}

export function resolveOperatorApiRoute(path: string): OperatorApiRoute | null {
  const normalized = path.split('?')[0] ?? '';
  for (const pattern of OPERATOR_ROUTE_PATTERNS) {
    if (pattern.test.test(normalized)) return pattern.route;
  }
  return null;
}

export function orgRef(organizationId: string | null | undefined): string | null {
  if (!organizationId) return null;
  return organizationId.slice(0, 8);
}

export function resolveCorrelationId(headers?: Record<string, string | string[] | undefined>): string {
  const raw =
    headers?.['x-correlation-id'] ??
    headers?.['x-request-id'] ??
    headers?.['X-Request-Id'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 128);
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim().slice(0, 128);
  return `op-${Date.now().toString(36)}`;
}
