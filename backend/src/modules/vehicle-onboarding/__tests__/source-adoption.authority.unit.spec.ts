import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('VehicleOnboardingSourceAdoptionAuthority', () => {
  const authority = new VehicleOnboardingSourceAdoptionAuthority();

  it('allows org-scoped HM mirror for same org', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { id: 'hm-1', organizationId: 'org-a' },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).not.toThrow();
  });

  it('blocks cross-org HM adoption without disclosure', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { id: 'hm-1', organizationId: 'org-a' },
        'org-b',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });

  it('blocks global HM mirror for tenant onboarding', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { id: 'hm-g', organizationId: null },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });

  it('allows global HM with platform trusted adoption', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { id: 'hm-g', organizationId: null },
        'org-a',
        { mode: 'PLATFORM_TRUSTED_ADOPTION' },
      ),
    ).not.toThrow();
  });
});
