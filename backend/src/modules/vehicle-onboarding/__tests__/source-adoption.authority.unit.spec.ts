import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const approvedHm = {
  id: 'hm-1',
  organizationId: 'org-a',
  isActive: true,
  clearanceStatus: 'APPROVED' as const,
  synqdriveVehicleId: null,
  registrationState: 'NOT_REGISTERED' as const,
};

describe('VehicleOnboardingSourceAdoptionAuthority', () => {
  const authority = new VehicleOnboardingSourceAdoptionAuthority();

  it('blocks DIMO without platform trusted adoption', () => {
    expect(() =>
      authority.assertDimoPlatformMirrorAdoptable(
        { id: 'dimo-1' },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });

  it('allows DIMO with platform trusted adoption', () => {
    expect(() =>
      authority.assertDimoPlatformMirrorAdoptable(
        { id: 'dimo-1' },
        'org-a',
        { mode: 'PLATFORM_TRUSTED_ADOPTION' },
      ),
    ).not.toThrow();
  });

  it('allows org-scoped HM mirror for same org', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(approvedHm, 'org-a', { mode: 'TENANT_ONBOARDING' }),
    ).not.toThrow();
  });

  it('blocks cross-org HM adoption without disclosure', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(approvedHm, 'org-b', { mode: 'TENANT_ONBOARDING' }),
    ).toThrow(VehicleOnboardingError);
  });

  it('blocks global HM mirror for tenant onboarding', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { ...approvedHm, id: 'hm-g', organizationId: null },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });

  it('allows global HM with platform trusted adoption', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { ...approvedHm, id: 'hm-g', organizationId: null },
        'org-a',
        { mode: 'PLATFORM_TRUSTED_ADOPTION' },
      ),
    ).not.toThrow();
  });

  it('blocks inactive HM', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { ...approvedHm, isActive: false },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });

  it('blocks non-approved HM clearance', () => {
    expect(() =>
      authority.assertHighMobilityMirrorAdoptable(
        { ...approvedHm, clearanceStatus: 'DRAFT' },
        'org-a',
        { mode: 'TENANT_ONBOARDING' },
      ),
    ).toThrow(VehicleOnboardingError);
  });
});
