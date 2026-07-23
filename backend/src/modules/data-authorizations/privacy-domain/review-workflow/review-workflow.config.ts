import { DataAuthorizationRiskLevel, DataProcessingReviewStepType } from '@prisma/client';

/**
 * Server-side review gate configuration — not accepted from clients.
 * HIGH and CRITICAL always require privacy + security review.
 */
export const REVIEW_WORKFLOW_STEPS_BY_RISK: Readonly<
  Record<DataAuthorizationRiskLevel, readonly DataProcessingReviewStepType[]>
> = {
  LOW: [DataProcessingReviewStepType.FINAL_APPROVAL],
  MEDIUM: [
    DataProcessingReviewStepType.BUSINESS_OWNER,
    DataProcessingReviewStepType.FINAL_APPROVAL,
  ],
  HIGH: [
    DataProcessingReviewStepType.BUSINESS_OWNER,
    DataProcessingReviewStepType.PRIVACY_REVIEW,
    DataProcessingReviewStepType.SECURITY_REVIEW,
    DataProcessingReviewStepType.FINAL_APPROVAL,
  ],
  CRITICAL: [
    DataProcessingReviewStepType.BUSINESS_OWNER,
    DataProcessingReviewStepType.PRIVACY_REVIEW,
    DataProcessingReviewStepType.SECURITY_REVIEW,
    DataProcessingReviewStepType.FINAL_APPROVAL,
  ],
};

export function resolveRequiredReviewSteps(
  riskLevel: DataAuthorizationRiskLevel,
): DataProcessingReviewStepType[] {
  return [...REVIEW_WORKFLOW_STEPS_BY_RISK[riskLevel]];
}
