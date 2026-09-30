/** Shared case-level lock for readiness evaluation and readiness-relevant mutations. */
export const READINESS_MUTATION_LOCK_PREFIX = 'vehicle-onboarding-readiness';

export function readinessMutationLockKey(caseId: string): string {
  return `${READINESS_MUTATION_LOCK_PREFIX}:${caseId}`;
}
