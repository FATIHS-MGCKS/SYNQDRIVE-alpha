import { ProductSlug } from '@prisma/client';
import {
  listGovernedReadinessProfiles,
  resolveReadinessProfileForSelectedProduct,
} from '../readiness/profiles/profile-registry';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('readiness profile registry (VO-4.1)', () => {
  it('lists only explicit governed profiles', () => {
    const profiles = listGovernedReadinessProfiles();
    expect(profiles.map((p) => p.profileId).sort()).toEqual([
      'fleet-onboarding-v1',
      'rental-onboarding-v1',
    ]);
  });

  it('resolves RENTAL and FLEET by ProductSlug', () => {
    expect(resolveReadinessProfileForSelectedProduct(ProductSlug.RENTAL).profileId).toBe(
      'rental-onboarding-v1',
    );
    expect(resolveReadinessProfileForSelectedProduct(ProductSlug.FLEET).profileId).toBe(
      'fleet-onboarding-v1',
    );
  });

  it('fails closed for TAXI without fleet fallback', () => {
    expect(() => resolveReadinessProfileForSelectedProduct(ProductSlug.TAXI)).toThrow(
      VehicleOnboardingError,
    );
    try {
      resolveReadinessProfileForSelectedProduct(ProductSlug.TAXI);
    } catch (e) {
      expect((e as VehicleOnboardingError).code).toBe('READINESS_PROFILE_UNSUPPORTED');
    }
  });
});
