/**
 * Seeds representative pre-VO-2 rows into a DB migrated only up to the migration before VO-2.
 * Writes fixture IDs to VO2_FIXTURE_IDS_PATH (JSON) for legacy-upgrade assertions.
 */
import { PrismaClient, FuelType, BusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';

const prisma = new PrismaClient();

async function main() {
  const outPath = process.env.VO2_FIXTURE_IDS_PATH;
  if (!outPath) {
    throw new Error('VO2_FIXTURE_IDS_PATH is required');
  }

  const orgId = randomUUID();
  const createdAt = new Date('2024-06-15T10:00:00.000Z');

  await prisma.organization.create({
    data: {
      id: orgId,
      companyName: 'VO2 Legacy Upgrade Org',
      businessType: BusinessType.RENTAL,
      createdAt,
      updatedAt: createdAt,
    },
  });

  const vehicleNormalId = randomUUID();
  const vehicleSyntheticId = randomUUID();
  const vehiclePlateId = randomUUID();
  const vehicleNoPlateId = randomUUID();
  const vehicleNullVin2Id = randomUUID();

  const baseVehicle = {
    organizationId: orgId,
    make: 'Volkswagen',
    model: 'Golf',
    year: 2022,
    fuelType: FuelType.GASOLINE,
    createdAt,
    updatedAt: createdAt,
  };

  await prisma.vehicle.createMany({
    data: [
      {
        ...baseVehicle,
        id: vehicleNormalId,
        vin: 'WVWZZZ1JZXW000001',
        licensePlate: 'B-VO2-100',
      },
      {
        ...baseVehicle,
        id: vehicleSyntheticId,
        vin: 'DIMO-legacy-synth-001',
        make: 'Tesla',
        model: 'Model 3',
        licensePlate: null,
      },
      {
        ...baseVehicle,
        id: vehiclePlateId,
        vin: 'WVWZZZ1JZXW000002',
        licensePlate: 'B-VO2-200',
      },
      {
        ...baseVehicle,
        id: vehicleNoPlateId,
        vin: 'WVWZZZ1JZXW000003',
        licensePlate: null,
      },
      {
        ...baseVehicle,
        id: vehicleNullVin2Id,
        vin: 'WVWZZZ1JZXW000004',
        licensePlate: null,
      },
    ],
  });

  const dimoId = randomUUID();
  await prisma.dimoVehicle.create({
    data: {
      id: dimoId,
      externalId: `ext-${dimoId}`,
      vin: 'WVWZZZ1JZXW000001',
      connectionStatus: 'CONNECTED',
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.vehicle.update({
    where: { id: vehicleNormalId },
    data: { dimoVehicleId: dimoId },
  });

  await prisma.vehicleDataSourceLink.create({
    data: {
      id: randomUUID(),
      vehicleId: vehicleNormalId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      sourceSubtype: null,
      dimoVehicleId: dimoId,
      isActive: true,
      activatedAt: createdAt,
    },
  });

  const hmId = randomUUID();
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId: orgId,
      synqdriveVehicleId: vehiclePlateId,
      vin: 'WVWZZZ1JZXW000002',
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: 'DIMO_PLUS_HM',
      clearanceStatus: 'APPROVED',
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.vehicleDataSourceLink.create({
    data: {
      id: randomUUID(),
      vehicleId: vehiclePlateId,
      provider: 'HIGH_MOBILITY',
      sourceType: 'HIGH_MOBILITY',
      sourceSubtype: 'HM_HEALTH',
      sourceReferenceId: hmId,
      isActive: true,
      activatedAt: createdAt,
    },
  });

  const fixture = {
    orgId,
    createdAt: createdAt.toISOString(),
    vehicleNormalId,
    vehicleSyntheticId,
    vehiclePlateId,
    vehicleNoPlateId,
    vehicleNullVin2Id,
    dimoId,
    hmId,
  };

  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(`[vo2-pre-vo2-fixture] wrote ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
