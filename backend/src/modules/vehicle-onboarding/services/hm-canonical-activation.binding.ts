import type { Prisma } from '@prisma/client';
import type { HighMobilityVehicle } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function appendHmCanonicalRegistrationHistoryIfNeeded(
  tx: Tx,
  hm: Pick<HighMobilityVehicle, 'id' | 'registrationState'>,
  synqdriveVehicleId: string,
  organizationId: string,
  activatedAt: Date,
): Promise<void> {
  if (hm.registrationState === 'REGISTERED') {
    return;
  }

  await tx.highMobilityStatusHistory.create({
    data: {
      highMobilityVehicleId: hm.id,
      eventType: 'CANONICAL_ONBOARDING_REGISTERED',
      oldStatus: hm.registrationState,
      newStatus: 'REGISTERED',
      payloadJson: {
        synqdriveVehicleId,
        organizationId,
        registeredAt: activatedAt.toISOString(),
        source: 'VEHICLE_ONBOARDING',
      },
    },
  });
}
