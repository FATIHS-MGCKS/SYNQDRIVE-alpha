import type { Prisma, VehicleStationPositionSource } from '@prisma/client';
import {
  evaluateClearExpectedStationPolicy,
  ExpectedStationClearReason,
  ExpectedStationRequestChannel,
} from '../../shared/stations/expected-station.policy';

export function isPickupCurrentPositionAlreadyApplied(vehicle: {
  currentStationId: string | null;
  currentStationSource: VehicleStationPositionSource | null;
}): boolean {
  return vehicle.currentStationId === null && vehicle.currentStationSource === null;
}

export function isReturnCurrentPositionAlreadyApplied(
  vehicle: {
    currentStationId: string | null;
    currentStationSource: VehicleStationPositionSource | null;
  },
  actualStationId: string,
): boolean {
  return (
    vehicle.currentStationId === actualStationId && vehicle.currentStationSource === 'RETURN'
  );
}

export function shouldClearExpectedStationOnReturn(input: {
  expectedStationId: string | null;
  actualReturnStationId: string | null;
  clearedAt?: Date | string;
}): boolean {
  const evaluation = evaluateClearExpectedStationPolicy({
    clearReason: ExpectedStationClearReason.DESTINATION_REACHED,
    clearedAt: input.clearedAt ?? new Date(),
    expectedStationId: input.expectedStationId,
    actualArrivalStationId: input.actualReturnStationId,
    requestChannel: ExpectedStationRequestChannel.COMMAND,
  });

  return evaluation.allowed && !evaluation.idempotent;
}

export function buildHandoverPickupPositionWriteData(): Prisma.VehicleUncheckedUpdateInput {
  return {
    currentStationId: null,
    currentStationSource: null,
    currentStationConfirmedAt: null,
    currentStationConfirmedByUserId: null,
    stationPositionVersion: { increment: 1 },
  };
}

export function buildHandoverReturnPositionWriteData(input: {
  actualStationId: string;
  performedByUserId?: string | null;
  confirmedAt?: Date;
  clearExpected: boolean;
}): Prisma.VehicleUncheckedUpdateInput {
  const confirmedAt = input.confirmedAt ?? new Date();

  return {
    currentStationId: input.actualStationId,
    currentStationSource: 'RETURN',
    currentStationConfirmedAt: confirmedAt,
    currentStationConfirmedByUserId: input.performedByUserId ?? null,
    stationPositionVersion: { increment: 1 },
    ...(input.clearExpected
      ? {
          expectedStationId: null,
          expectedStationSource: null,
          expectedStationSetAt: null,
        }
      : {}),
  };
}
