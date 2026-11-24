import type { HighMobilityVehicle } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { HmObservationReadDb } from './hm-only-canonical-observation-readonly-tx';

export type HmPreRegistrationObservationSnapshot = {
  hmVehicleId: string;
  registrationState: HighMobilityVehicle['registrationState'];
  synqdriveVehicleId: string | null;
  mirrorUpdatedAtMs: number;
  vin: string;
  hmRecord: HighMobilityVehicle;
  /** Vehicle row ids for this org+VIN known at observation start (stable duplicate detection). */
  preExistingVehicleIdsForVin: string[];
  observationStartedAtMs: number;
};

export function freezeHmPreRegistrationSnapshot(
  hmRecord: HighMobilityVehicle,
  opts?: {
    preExistingVehicleIdsForVin?: string[];
    observationStartedAtMs?: number;
  },
): HmPreRegistrationObservationSnapshot {
  return {
    hmVehicleId: hmRecord.id,
    registrationState: hmRecord.registrationState,
    synqdriveVehicleId: hmRecord.synqdriveVehicleId,
    mirrorUpdatedAtMs: hmRecord.updatedAt.getTime(),
    vin: hmRecord.vin,
    hmRecord: { ...hmRecord },
    preExistingVehicleIdsForVin: opts?.preExistingVehicleIdsForVin ?? [],
    observationStartedAtMs: opts?.observationStartedAtMs ?? Date.now(),
  };
}

export async function buildHmObservationEvaluationSnapshot(
  db: HmObservationReadDb,
  hmRecord: HighMobilityVehicle,
  organizationId: string,
): Promise<HmPreRegistrationObservationSnapshot> {
  const preExisting = await db.vehicle.findMany({
    where: { organizationId, vin: hmRecord.vin },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return freezeHmPreRegistrationSnapshot(hmRecord, {
    preExistingVehicleIdsForVin: preExisting.map((v) => v.id),
    observationStartedAtMs: Date.now(),
  });
}

export async function assertHmPreRegistrationSnapshotUnchanged(
  db: HmObservationReadDb,
  snapshot: HmPreRegistrationObservationSnapshot,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; reasonCode: 'OBSERVATION_SNAPSHOT_RACE' }> {
  const current = await db.highMobilityVehicle.findUnique({
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

  const vehiclesNow = await db.vehicle.findMany({
    where: { organizationId, vin: snapshot.vin },
    select: { id: true, createdAt: true },
    orderBy: { id: 'asc' },
  });

  const preExisting = new Set(snapshot.preExistingVehicleIdsForVin);
  const createdDuringObservation = vehiclesNow.filter(
    (v) => !preExisting.has(v.id) && v.createdAt.getTime() >= snapshot.observationStartedAtMs,
  );

  if (createdDuringObservation.length > 0 && snapshot.registrationState === 'NOT_REGISTERED') {
    return { ok: false, reasonCode: 'OBSERVATION_SNAPSHOT_RACE' };
  }

  return { ok: true };
}