/**
 * PR #1290 smoke gate: Prisma client create against migrated disposable DB.
 * Uses unchecked create to avoid loading full Vehicle/DimoVehicle column sets
 * on the subset smoke schema.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM dimo_vehicles WHERE id = 'dimo-smoke-1' LIMIT 1
    `;
    if (!rows[0]?.id) {
      throw new Error('Fixture DimoVehicle not found');
    }

    const created = await prisma.vehicleDataSourceLink.create({
      data: {
        id: 'link-smoke-prisma-create',
        vehicleId: 'veh-smoke-legacy',
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: rows[0].id,
        isActive: false,
      },
    });

    if (created.dimoVehicleId !== rows[0].id) {
      throw new Error('dimoVehicleId mismatch after create');
    }
    if (created.sourceReferenceId !== null) {
      throw new Error('sourceReferenceId must remain null for DIMO canonical create');
    }

    console.log('PRISMA_DIMO_CREATE_PASS', created.id);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('PRISMA_DIMO_CREATE_FAIL', error);
  process.exit(1);
});
