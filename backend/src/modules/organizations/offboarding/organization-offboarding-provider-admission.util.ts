import type { OrganizationOffboardingExecutionProgress } from './organization-offboarding-execution.progress';

/** External disconnect evidence is required for archive admission (P6D4 — local revoke is insufficient). */
export function providerAllowsArchiveAdmission(
  progress: OrganizationOffboardingExecutionProgress,
): boolean {
  const state = progress.providerQuiesce?.finalizationState;
  return (
    state === 'NO_EXTERNAL_PROVIDER_DEPENDENCY' || state === 'EXTERNAL_DISCONNECT_CONFIRMED'
  );
}