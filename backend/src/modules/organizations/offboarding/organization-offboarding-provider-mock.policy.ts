/**
 * Provider mock env vars may only influence disconnect evidence in explicit non-production test contexts.
 * Production must never treat mocked CONFIRMED as archival evidence (fail closed).
 */
export function isOrganizationOffboardingProviderMockAllowed(): boolean {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    return false;
  }
  if (nodeEnv === 'test') {
    return true;
  }
  return process.env.ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED === '1';
}

export function readProviderMockOutcome(
  provider: 'DIMO' | 'HIGH_MOBILITY',
): 'CONFIRMED' | 'NOT_AVAILABLE' | 'FAILED' | 'NO_DEPENDENCY' | null {
  if (!isOrganizationOffboardingProviderMockAllowed()) {
    return null;
  }
  const key =
    provider === 'DIMO'
      ? process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL
      : process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
  if (!key) return null;
  const normalized = key.trim().toUpperCase();
  if (
    normalized === 'CONFIRMED' ||
    normalized === 'NOT_AVAILABLE' ||
    normalized === 'FAILED' ||
    normalized === 'NO_DEPENDENCY'
  ) {
    return normalized;
  }
  return null;
}

export function providerEvidenceUsedMock(envHadMock: boolean): boolean {
  return envHadMock && isOrganizationOffboardingProviderMockAllowed();
}

/** Final archival commit must not rely on mock-sourced provider confirmation outside allowed test contexts. */
export function assertProviderEvidenceAdmissibleForProductionArchival(
  progress: { providerQuiesce?: { providerEvidence?: { dimo?: { evidenceSource?: string }; hm?: { evidenceSource?: string } } } },
): void {
  if (isOrganizationOffboardingProviderMockAllowed()) {
    return;
  }
  const dimoSource = progress.providerQuiesce?.providerEvidence?.dimo?.evidenceSource;
  const hmSource = progress.providerQuiesce?.providerEvidence?.hm?.evidenceSource;
  if (dimoSource === 'MOCK' || hmSource === 'MOCK') {
    throw new Error('Mock provider evidence is inadmissible for archival in this runtime');
  }
}