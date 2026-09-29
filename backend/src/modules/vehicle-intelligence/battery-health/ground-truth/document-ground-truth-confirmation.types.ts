/**
 * Authoritative human confirmation context for document apply → ground-truth emission.
 * Must be supplied during CONFIRMED action-plan execution; not inferable from measurement time.
 */
export type DocumentApplyConfirmationAuthorityV1 = {
  mode: 'CONFIRMED_ACTION_EXECUTION' | 'APPLIED_RETRY_CONVERGENCE';
  confirmedAt: Date;
  confirmedByUserId: string | null;
  actionPlanFingerprint: string;
  documentActionIdempotencyKey: string;
};
