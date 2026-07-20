export const SERVICE_CASE_QUERY_INVALIDATE_EVENT = 'service-case-query-invalidate' as const;

export interface ServiceCaseQueryInvalidationDetail {
  orgId: string;
  serviceCaseId?: string;
  lists?: boolean;
  summary?: boolean;
  detail?: boolean;
}

export interface ServiceCaseQueryInvalidationEvent
  extends CustomEvent<ServiceCaseQueryInvalidationDetail> {}

export function invalidateServiceCaseQueries(detail: ServiceCaseQueryInvalidationDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ServiceCaseQueryInvalidationDetail>(SERVICE_CASE_QUERY_INVALIDATE_EVENT, {
      detail,
    }),
  );
}

export function subscribeServiceCaseQueryInvalidation(
  listener: (detail: ServiceCaseQueryInvalidationDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const custom = event as ServiceCaseQueryInvalidationEvent;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(SERVICE_CASE_QUERY_INVALIDATE_EVENT, handler);
  return () => window.removeEventListener(SERVICE_CASE_QUERY_INVALIDATE_EVENT, handler);
}

export function matchesServiceCaseListInvalidation(
  detail: ServiceCaseQueryInvalidationDetail,
  orgId: string | null | undefined,
): boolean {
  if (!orgId || detail.orgId !== orgId) return false;
  return detail.lists !== false;
}

export function matchesServiceCaseDetailInvalidation(
  detail: ServiceCaseQueryInvalidationDetail,
  orgId: string | null | undefined,
  serviceCaseId: string | null | undefined,
): boolean {
  if (!orgId || !serviceCaseId || detail.orgId !== orgId) return false;
  if (detail.detail === false) return false;
  return !detail.serviceCaseId || detail.serviceCaseId === serviceCaseId;
}

export function matchesServiceCaseSummaryInvalidation(
  detail: ServiceCaseQueryInvalidationDetail,
  orgId: string | null | undefined,
): boolean {
  if (!orgId || detail.orgId !== orgId) return false;
  return detail.summary !== false;
}
