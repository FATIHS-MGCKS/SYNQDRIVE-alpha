/** Controlled offboarding execution phases (P6D3). No workflow engine. */

export const ORGANIZATION_OFFBOARDING_EXECUTION_PHASES = [
  'REVALIDATE',
  'SUSPEND',
  'REVOKE_ORG_SESSIONS',
  'VEHICLE_OFFBOARD_BATCH',
  'PROVIDER_QUIESCE',
  'READY_FOR_ARCHIVE',
] as const;

export type OrganizationOffboardingExecutionPhase =
  (typeof ORGANIZATION_OFFBOARDING_EXECUTION_PHASES)[number];

export function nextExecutionPhase(
  current: string | null | undefined,
): OrganizationOffboardingExecutionPhase | null {
  const idx = ORGANIZATION_OFFBOARDING_EXECUTION_PHASES.indexOf(
    current as OrganizationOffboardingExecutionPhase,
  );
  if (idx < 0) {
    return ORGANIZATION_OFFBOARDING_EXECUTION_PHASES[0];
  }
  if (idx >= ORGANIZATION_OFFBOARDING_EXECUTION_PHASES.length - 1) {
    return null;
  }
  return ORGANIZATION_OFFBOARDING_EXECUTION_PHASES[idx + 1]!;
}

export function isPhaseComplete(
  progress: { phasesCompleted?: string[] },
  phase: OrganizationOffboardingExecutionPhase,
): boolean {
  return (progress.phasesCompleted ?? []).includes(phase);
}