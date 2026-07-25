export const OPERATOR_AUTH_EXPIRED_EVENT = 'operator:auth-expired';
export const OPERATOR_API_FAILURE_EVENT = 'operator:api-failure';
export const OPERATOR_API_SUCCESS_EVENT = 'operator:api-success';

export const HANDOVER_DRAFT_CONNECTIVITY_EVENT = 'operator:handover-draft-connectivity';

export type HandoverDraftConnectivityDetail =
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error' }
  | { status: 'cleared' };

export function dispatchOperatorAuthExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPERATOR_AUTH_EXPIRED_EVENT));
}

export function dispatchOperatorApiFailure(path?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPERATOR_API_FAILURE_EVENT, { detail: { path } }));
}

export function dispatchOperatorApiSuccess(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPERATOR_API_SUCCESS_EVENT));
}

export function dispatchHandoverDraftConnectivity(detail: HandoverDraftConnectivityDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HANDOVER_DRAFT_CONNECTIVITY_EVENT, { detail }));
}
