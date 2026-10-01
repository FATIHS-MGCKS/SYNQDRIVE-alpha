import type { Prisma, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertSourceNotCanonicallyRegistered } from './canonical-source-suppression.authority';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from './platform-trusted-adoption.context';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption.context';
import { VehicleOnboardingSourceAdoptionAuthority } from './vehicle-onboarding-source-adoption.authority';

const adoptionAuthority = new VehicleOnboardingSourceAdoptionAuthority();

export async function assertCurrentProviderSourcesValidForActivation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): Promise<void> {
  const dimoRefs = sourceRefs.filter((r) => r.provider === 'DIMO' && r.sourceMirrorId);
  const hmRefs = sourceRefs.filter((r) => r.provider === 'HIGH_MOBILITY' && r.sourceMirrorId);

  for (const ref of dimoRefs) {
    const mirrorId = ref.sourceMirrorId!;
    const dimo = await tx.dimoVehicle.findUnique({
      where: { id: mirrorId },
      select: { id: true },
    });
    if (!dimo) {
      throw new VehicleOnboardingError(
        'ACTIVATION_PRECONDITION_FAILED',
        'DIMO source no longer available for activation',
      );
    }
    try {
      adoptionAuthority.assertDimoPlatformMirrorAdoptable(
        dimo,
        organizationId,
        PLATFORM_TRUSTED_SOURCE_ADOPTION,
      );
      await assertSourceNotCanonicallyRegistered(tx, 'DIMO', mirrorId);
    } catch (error) {
      if (error instanceof VehicleOnboardingError) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'DIMO source is not valid for activation',
        );
      }
      throw error;
    }
  }

  for (const ref of hmRefs) {
    const mirrorId = ref.sourceMirrorId!;
    const hm = await tx.highMobilityVehicle.findUnique({ where: { id: mirrorId } });
    if (!hm) {
      throw new VehicleOnboardingError(
        'ACTIVATION_PRECONDITION_FAILED',
        'High Mobility source no longer available for activation',
      );
    }
    const adoptionContext =
      hm.organizationId == null ? PLATFORM_TRUSTED_SOURCE_ADOPTION : DEFAULT_TENANT_SOURCE_ADOPTION;
    try {
      adoptionAuthority.assertHighMobilityMirrorAdoptable(hm, organizationId, adoptionContext);
      await assertSourceNotCanonicallyRegistered(tx, 'HIGH_MOBILITY', mirrorId);
    } catch (error) {
      if (error instanceof VehicleOnboardingError) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'High Mobility source is not valid for activation',
        );
      }
      throw error;
    }
  }
}
