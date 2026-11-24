import type { HighMobilityVehicle } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export type HmPreRegistrationObservationSnapshot = {
  hmVehicleId: string;
  registrationState: HighMobilityVehicle['registrationState'];
  synqdriveVehicleId: string | null;
  mirrorUpdatedAtMs: number;
  vin: string;
  hmRecord: HighMobilityVehicle;
};

export function freezeHmPreRegistrationSnapshot(
  hmRecord: HighMobilityVehicle,
): HmPreRegistrationObservationSnapshot {
  return {
    hmVehicleId: hmRecord.id,
    registrationState: hmRecord.registrationState,
    synqdriveVehicleId: hmRecord.synqdriveVehicleId,
    mirrorUpdatedAtMs: hmRecord.updatedAt.getTime(),
    vin: hmRecord.vin,
    hmRecord: { ...hmRecord },
  };
}

export async function assertHmPreRegistrationSnapshotUnchanged(
  prisma: PrismaService,
  snapshot: HmPreRegistrationObservationSnapshot,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; reasonCode: 'OBSERVATION_SNAPSHOT_RACE' }> {
  const current = await prisma.highMobilityVehicle.findUnique({
    where: { id: snapshot.hmVehicleId },
    select: {
      registrationState: true,
      synqdriveVehicleId: true,
      updatedAt: true,
    },
  });
  if (!current) {
    return { ok: false, reasonCode: 'OBSERVATION_SNAPSHOT_RACE' };
  }
  if (
    current.registrationState !== snapshot.registrationState ||
    current.synqdriveVehicleId !== snapshot.synqdriveVehicleId ||
    current.updatedAt.getTime() !== snapshot.mirrorUpdatedAtMs
  ) {
    return { ok: false, reasonCode: 'OBSERVATION_SNAPSHOT_RACE' };
  }

  const createdDuringObservation = await prisma.vehicle.findFirst({
    where: {
      organizationId,
      vin: snapshot.vin,
    },
    select: { id: true, createdAt: true },
  });
  if (createdDuringObservation && snapshot.registrationState === 'NOT_REGISTERED') {
    return { ok: false, reasonCode: 'OBSERVATION_SNAPSHOT_RACE' };
  }

  return { ok: true };
}