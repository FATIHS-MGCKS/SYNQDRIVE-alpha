import type { OrganizationOffboardingExecutionResult } from './organization-offboarding-execution.service';
import type { OffboardingJobLeaseRow } from './organization-offboarding-execution.lease-persist';
import { parseExecutionProgress } from './organization-offboarding-execution.progress';
import type { OrganizationOffboardingJobView } from './organization-offboarding.types';

export function mapOffboardingJobToExecutionResult(
  row: OffboardingJobLeaseRow,
  executionReplay: boolean,
): OrganizationOffboardingExecutionResult {
  const executionProgress = parseExecutionProgress(row.progressJson);
  const view: OrganizationOffboardingJobView & {
    executionIdempotentReplay: boolean;
    executionProgress: typeof executionProgress;
  } = {
    jobId: row.id,
    organizationId: row.organizationId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    phase: row.phase,
    correlationId: row.correlationId,
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    preflight: row.preflightSnapshot as OrganizationOffboardingJobView['preflight'],
    idempotentReplay: false,
    executionIdempotentReplay: executionReplay,
    executionProgress,
  };
  return view;
}