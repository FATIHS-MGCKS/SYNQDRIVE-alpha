import type { PlausibilityCheck } from './document-plausibility.types';
import { getUnresolvedPlausibilityBlockers } from './document-plausibility.types';

export type PlausibilityGateablePlan = {
  planOutcome: string;
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

export function gateActionPlanOnPlausibility<T extends PlausibilityGateablePlan>(
  plan: T,
  checks: PlausibilityCheck[],
): T {
  const blockers = getUnresolvedPlausibilityBlockers(checks);
  if (blockers.length === 0) {
    return plan;
  }

  return {
    ...plan,
    planOutcome: 'BLOCKED',
    missingRequirements: [
      ...plan.missingRequirements,
      ...blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.explanation ?? blocker.message,
        fieldKeys: blocker.fieldPaths,
      })),
    ],
  };
}

export function canExecuteActionPlan(checks: PlausibilityCheck[]): boolean {
  return getUnresolvedPlausibilityBlockers(checks).length === 0;
}
