import { buildHmOnboardingSourceSnapshot, resolveHmExternalVehicleIdentity } from '../adapters/high-mobility-onboarding-source.adapter';
import { HM_MIRROR_SURROGATE_PREFIX } from '../adapters/connection-scope.constants';

describe('HM onboarding source adapter', () => {
  it('prefers hmVehicleReference as external identity', () => {
    expect(
      resolveHmExternalVehicleIdentity({ id: 'hm-1', hmVehicleReference: 'provider-ref-9' }),
    ).toBe('provider-ref-9');
  });

  it('uses typed mirror surrogate when reference missing', () => {
    const id = resolveHmExternalVehicleIdentity({ id: 'hm-2', hmVehicleReference: null });
    expect(id).toBe(`${HM_MIRROR_SURROGATE_PREFIX}hm-2`);
  });

  it('does not mark VIN verified without evidence', () => {
    const snap = buildHmOnboardingSourceSnapshot(
      {
        id: 'hm-3',
        vin: 'WBADT43452G123456',
        brand: 'BMW',
        hmVehicleReference: 'ref',
        clearanceStatus: 'APPROVED',
        sourceMode: 'HM_ONLY',
        packageType: 'HEALTH',
        appContainerType: 'HM_HEALTH_APP',
        updatedAt: new Date(),
      },
      'org-1',
    );
    expect(snap.vinVerificationState).toBe('UNVERIFIED');
  });
});
