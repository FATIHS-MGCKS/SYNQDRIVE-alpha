import { MembershipRole } from '@prisma/client';
import {
  EvaluationsAccessContext,
  EvaluationsPiiTier,
  redactDashboardInsightForTier,
  redactDashboardInsightsResponse,
  resolveEvaluationsPiiTier,
} from '@synq/evaluations-insights/evaluations-privacy';
import type { DashboardInsightsResponse } from '../insight.types';

export function buildEvaluationsAccessContext(input: {
  membershipRole?: MembershipRole | string | null;
  canReadInvoices: boolean;
  canReadCustomers: boolean;
}): EvaluationsAccessContext {
  return {
    membershipRole: input.membershipRole ?? MembershipRole.WORKER,
    canReadInvoices: input.canReadInvoices,
    canReadCustomers: input.canReadCustomers,
  };
}

export function resolveEvaluationsPiiTierForMembership(
  ctx: EvaluationsAccessContext,
): EvaluationsPiiTier {
  return resolveEvaluationsPiiTier(ctx);
}

export function redactDashboardInsightsForRole(
  response: DashboardInsightsResponse,
  tier: EvaluationsPiiTier,
): DashboardInsightsResponse {
  return redactDashboardInsightsResponse(response, tier);
}

export { redactDashboardInsightForTier };
