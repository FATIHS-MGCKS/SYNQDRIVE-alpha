import type { Prisma } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { SourceClaimProvider } from './source-claim-lock';

export async function assertSourceNotCanonicallyRegistered(
  tx: Prisma.TransactionClient,
  provider: SourceClaimProvider,
  sourceMirrorId: string,
): Promise<void> {
  if (provider === 'DIMO') {
    const onVehicle = await tx.vehicle.findFirst({
      where: { dimoVehicleId: sourceMirrorId },
      select: { id: true },
    });
    if (onVehicle) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'Provider source is already associated with a canonical vehicle',
      );
    }
    const link = await tx.vehicleDataSourceLink.findFirst({
      where: { dimoVehicleId: sourceMirrorId },
      select: { id: true },
    });
    if (link) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'Provider source is already associated with a canonical vehicle',
      );
    }
  } else {
    const hm = await tx.highMobilityVehicle.findUnique({
      where: { id: sourceMirrorId },
      select: {
        synqdriveVehicleId: true,
        registrationState: true,
      },
    });
    if (hm?.synqdriveVehicleId) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'Provider source is already associated with a canonical vehicle',
      );
    }
    if (hm?.registrationState === 'REGISTERED') {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'Provider source is already associated with a canonical vehicle',
      );
    }
    const hmLink = await tx.vehicleDataSourceLink.findFirst({
      where: { sourceReferenceId: sourceMirrorId },
      select: { id: true },
    });
    if (hmLink) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'Provider source is already associated with a canonical vehicle',
      );
    }
  }

  const completedRef = await tx.vehicleOnboardingCaseSourceRef.findFirst({
    where: {
      provider,
      sourceMirrorId,
      onboardingCase: { status: 'COMPLETED' },
    },
    select: { id: true },
  });
  if (completedRef) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'Provider source was previously used in a completed onboarding case',
    );
  }
}
