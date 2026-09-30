import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/** VO-3 supported activation source set: ≤1 DIMO vehicle, ≤1 HM vehicle, MANUAL evidence optional. */
export function assertSupportedActivationSourceSet(sourceRefs: VehicleOnboardingCaseSourceRef[]): {
  dimoRefs: VehicleOnboardingCaseSourceRef[];
  hmRefs: VehicleOnboardingCaseSourceRef[];
} {
  const dimoRefs = sourceRefs.filter((r) => r.provider === 'DIMO' && r.sourceMirrorId);
  const hmRefs = sourceRefs.filter((r) => r.provider === 'HIGH_MOBILITY' && r.sourceMirrorId);

  if (dimoRefs.length > 1 || hmRefs.length > 1) {
    throw new VehicleOnboardingError(
      'SOURCE_SET_REQUIRES_REVIEW',
      'More than one vehicle source ref per provider is not supported in VO-3',
      {
        dimoCount: dimoRefs.length,
        hmCount: hmRefs.length,
      },
    );
  }

  return { dimoRefs, hmRefs };
}
