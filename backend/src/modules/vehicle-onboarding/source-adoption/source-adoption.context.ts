/**
 * Trusted context for adopting provider mirrors into a tenant onboarding case.
 * Not caller-supplied booleans — set by internal orchestration entrypoints or platform wiring.
 */
export type SourceAdoptionMode = 'TENANT_ONBOARDING' | 'PLATFORM_TRUSTED_ADOPTION';

export interface SourceAdoptionContext {
  mode: SourceAdoptionMode;
}

export const DEFAULT_TENANT_SOURCE_ADOPTION: SourceAdoptionContext = {
  mode: 'TENANT_ONBOARDING',
};
