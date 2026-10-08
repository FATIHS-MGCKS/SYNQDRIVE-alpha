/**
 * Read-only forensics for APDS cohort vehicle DIMO token 187336.
 * Usage: DATABASE_URL=... npx ts-node --transpile-only scripts/ops/apds-vehicle-187336-readonly-forensics.ts
 */
import { PrismaClient } from '@prisma/client';

const VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const DIMO_TOKEN = '187336';

async function main() {
  const prisma = new PrismaClient();
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: VEHICLE_ID },
    select: {
      id: true,
      organizationId: true,
      vehicleName: true,
      fuelType: true,
      dimoTokenId: true,
      registryStatus: true,
    },
  });

  const lastSuccess = await prisma.dimoPollLog.findFirst({
    where: { vehicleId: VEHICLE_ID, status: 'SUCCESS', jobType: 'SNAPSHOT' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, jobType: true, status: true, errorMessage: true },
  });

  const lastAttempt = await prisma.dimoPollLog.findFirst({
    where: { vehicleId: VEHICLE_ID, jobType: 'SNAPSHOT' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, status: true, errorMessage: true },
  });

  const physical = await prisma.deviceConnectionPhysicalState.findFirst({
    where: { vehicleId: VEHICLE_ID },
    orderBy: { updatedAt: 'desc' },
    select: {
      effectiveState: true,
      updatedAt: true,
      organizationId: true,
    },
  });

  const lastLv = await prisma.batteryMeasurement.findFirst({
    where: { vehicleId: VEHICLE_ID },
    orderBy: { providerTimestamp: 'desc' },
    select: { providerTimestamp: true, observedAt: true, createdAt: true },
  });

  const shadowRows = await prisma.apdShadowReconciliationDecision.count({
    where: { vehicleId: VEHICLE_ID },
  });

  const out = {
    vehicleId: VEHICLE_ID,
    dimoToken: DIMO_TOKEN,
    vehicle,
    lastSuccessfulSnapshot: lastSuccess,
    lastSnapshotAttempt: lastAttempt,
    physicalState: physical,
    lastBatteryMeasurement: lastLv,
    shadowDecisionRowCount: shadowRows,
    capturedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
