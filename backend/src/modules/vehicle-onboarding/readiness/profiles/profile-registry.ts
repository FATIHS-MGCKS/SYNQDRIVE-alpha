import type { BusinessType } from '@prisma/client';
import type { VehicleOnboardingReadinessProfileV1 } from './vehicle-onboarding-readiness-profile.v1';
import { RENTAL_ONBOARDING_PROFILE_V1 } from './rental-onboarding.profile';
import { FLEET_ONBOARDING_PROFILE_V1 } from './fleet-onboarding.profile';

const GENERIC_OPERATIONS = FLEET_ONBOARDING_PROFILE_V1;

export function resolveReadinessProfileForBusinessType(
  businessType: BusinessType,
): VehicleOnboardingReadinessProfileV1 {
  if (businessType === 'RENTAL') {
    return RENTAL_ONBOARDING_PROFILE_V1;
  }
  if (businessType === 'FLEET') {
    return FLEET_ONBOARDING_PROFILE_V1;
  }
  return {
    ...GENERIC_OPERATIONS,
    profileId: 'generic-operations-onboarding-v1',
    product: 'GENERIC_OPERATIONS',
  };
}

export function listGovernedReadinessProfiles(): VehicleOnboardingReadinessProfileV1[] {
  return [RENTAL_ONBOARDING_PROFILE_V1, FLEET_ONBOARDING_PROFILE_V1];
}
