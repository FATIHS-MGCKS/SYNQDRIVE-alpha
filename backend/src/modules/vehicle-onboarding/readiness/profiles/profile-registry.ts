import { $Enums, type ProductSlug } from '@prisma/client';
import type { VehicleOnboardingReadinessProfileV1 } from './vehicle-onboarding-readiness-profile.v1';
import { RENTAL_ONBOARDING_PROFILE_V1 } from './rental-onboarding.profile';
import { FLEET_ONBOARDING_PROFILE_V1 } from './fleet-onboarding.profile';
import { VehicleOnboardingError } from '../../errors/vehicle-onboarding.errors';

const ProductSlugEnum = $Enums.ProductSlug;

const PROFILE_BY_PRODUCT: Record<
  typeof ProductSlugEnum.RENTAL | typeof ProductSlugEnum.FLEET,
  VehicleOnboardingReadinessProfileV1
> = {
  [ProductSlugEnum.RENTAL]: RENTAL_ONBOARDING_PROFILE_V1,
  [ProductSlugEnum.FLEET]: FLEET_ONBOARDING_PROFILE_V1,
};

export function resolveReadinessProfileForSelectedProduct(
  selectedProduct: ProductSlug,
): VehicleOnboardingReadinessProfileV1 {
  if (selectedProduct === ProductSlugEnum.TAXI) {
    throw new VehicleOnboardingError(
      'READINESS_PROFILE_UNSUPPORTED',
      'Taxi onboarding readiness profile is not defined',
      { selectedProduct },
    );
  }
  const profile =
    PROFILE_BY_PRODUCT[selectedProduct as typeof ProductSlugEnum.RENTAL | typeof ProductSlugEnum.FLEET];
  if (!profile) {
    throw new VehicleOnboardingError(
      'READINESS_PROFILE_UNSUPPORTED',
      'No governed readiness profile for selected product',
      { selectedProduct },
    );
  }
  return profile;
}

export function listGovernedReadinessProfiles(): VehicleOnboardingReadinessProfileV1[] {
  return [RENTAL_ONBOARDING_PROFILE_V1, FLEET_ONBOARDING_PROFILE_V1];
}
