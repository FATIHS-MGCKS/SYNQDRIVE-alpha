import type { OperatorMetricsService } from './operator-metrics.service';

export type OperatorApiRoute =
  | 'bookings_list'
  | 'bookings_detail'
  | 'bookings_scan'
  | 'bookings_mutate'
  | 'handover_list'
  | 'handover_pickup'
  | 'handover_return'
  | 'tasks_list'
  | 'tasks_detail'
  | 'tasks_complete'
  | 'customers_detail'
  | 'customers_documents'
  | 'document_upload'
  | 'document_download'
  | 'verification_pickup_check'
  | 'damages'
  | 'tire_measure'
  | 'other';

export type OperatorResult = 'success' | 'error';
export type OperatorHandoverKind = 'pickup' | 'return';
export type OperatorHandoverEvent = 'start' | 'completion_success' | 'completion_failure';
export type OperatorAuthDenialReason = 'unauthorized' | 'forbidden' | 'tenant_scope';
export type OperatorOutboxType =
  | 'task_automation'
  | 'business_audit'
  | 'notification_delivery';

export function statusClassFromCode(statusCode: number): string {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  return '2xx';
}

export function normalizeOperatorErrorCode(code: unknown): string {
  if (typeof code === 'string' && code.trim()) {
    return code.trim().slice(0, 64).replace(/[^a-zA-Z0-9_:-]/g, '_');
  }
  return 'unknown';
}

export function recordOperatorApiRequest(
  metrics: OperatorMetricsService,
  labels: {
    route: OperatorApiRoute;
    method: string;
    statusCode: number;
    result: OperatorResult;
  },
  durationSeconds: number,
): void {
  const statusClass = statusClassFromCode(labels.statusCode);
  metrics.apiRequestDuration.observe(
    { route: labels.route, method: labels.method, result: labels.result },
    durationSeconds,
  );
  metrics.apiRequestsTotal.inc({
    route: labels.route,
    method: labels.method,
    status_class: statusClass,
    result: labels.result,
  });
}

export function recordOperatorHandover(
  metrics: OperatorMetricsService,
  kind: OperatorHandoverKind,
  event: OperatorHandoverEvent,
  errorCode?: string,
): void {
  metrics.handoverTotal.inc({
    kind,
    event,
    error_code: errorCode ? normalizeOperatorErrorCode(errorCode) : 'none',
  });
}
