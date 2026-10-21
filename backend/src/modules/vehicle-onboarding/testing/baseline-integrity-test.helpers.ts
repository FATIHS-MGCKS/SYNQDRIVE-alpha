import type { PrismaClient } from '@prisma/client';

export async function countBaselineHealthAndMeasurementArtifacts(
  prisma: PrismaClient,
  vehicleId: string,
) {
  const [
    tireTread,
    tireHealth,
    brakeHealthCurrent,
    brakeHealthSnapshot,
    batteryMeasurement,
    batteryAssessment,
    batteryPublication,
    hvHealthSnapshot,
    hvHealthCurrent,
    serviceEvents,
  ] = await Promise.all([
    prisma.vehicleTireTreadMeasurement.count({ where: { vehicleId } }),
    prisma.tireHealthSnapshot.count({ where: { vehicleId } }),
    prisma.brakeHealthCurrent.count({ where: { vehicleId } }),
    prisma.brakeHealthSnapshot.count({ where: { vehicleId } }),
    prisma.batteryMeasurement.count({ where: { vehicleId } }),
    prisma.batteryAssessment.count({ where: { vehicleId } }),
    prisma.batteryPublication.count({ where: { vehicleId } }),
    prisma.hvBatteryHealthSnapshot.count({ where: { vehicleId } }),
    prisma.hvBatteryHealthCurrent.count({ where: { vehicleId } }),
    prisma.vehicleServiceEvent.count({ where: { vehicleId } }),
  ]);

  return {
    tireTread,
    tireHealth,
    brakeHealthCurrent,
    brakeHealthSnapshot,
    batteryMeasurement,
    batteryAssessment,
    batteryPublication,
    hvHealthSnapshot,
    hvHealthCurrent,
    serviceEvents,
  };
}

export async function assertZeroBaselineHealthAndMeasurementArtifacts(
  prisma: PrismaClient,
  vehicleId: string,
) {
  const counts = await countBaselineHealthAndMeasurementArtifacts(prisma, vehicleId);
  for (const [key, value] of Object.entries(counts)) {
    if (value !== 0) {
      throw new Error(`Expected zero ${key} for vehicle ${vehicleId}, got ${value}`);
    }
  }
}
