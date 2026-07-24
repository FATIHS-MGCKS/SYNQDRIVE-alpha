import type { ProcessingActivityDeletionStepTarget } from '@prisma/client';

export interface DeletionStoreContext {
  organizationId: string;
  processingActivityId: string;
  dataCategory?: string | null;
  dryRun: boolean;
  deletionMethod: string;
  anonymizationAllowed: boolean;
}

export interface DeletionStoreResult {
  target: ProcessingActivityDeletionStepTarget;
  status: 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'NOT_APPLICABLE';
  rowsAffected?: number;
  errorCode?: string;
  errorMessage?: string;
  evidence?: Array<{ type: string; value: string }>;
  metadata?: Record<string, unknown>;
}

export interface DeletionStoreAdapter {
  readonly target: ProcessingActivityDeletionStepTarget;
  execute(ctx: DeletionStoreContext): Promise<DeletionStoreResult>;
}
