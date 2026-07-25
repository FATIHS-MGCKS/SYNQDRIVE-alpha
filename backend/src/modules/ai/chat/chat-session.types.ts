/**
 * Verified identity for org-scoped fleet chat — populated from JWT + membership load.
 */
export interface ChatSessionIdentity {
  readonly userId: string;
  readonly platformRole?: string | null;
  readonly locale?: string;
  readonly timezone?: string;
  readonly requestId?: string;
}
