#!/usr/bin/env ts-node
/**
 * Read-only M3.3G ground-truth inspection (stdout JSON).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { BatteryGroundTruthInspectionService } from '../../src/modules/vehicle-intelligence/battery-health/ground-truth/ground-truth-inspection.service';
import { BatteryGroundTruthRepository } from '../../src/modules/vehicle-intelligence/battery-health/ground-truth/ground-truth.repository';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  const vehicleId = parseArg('--vehicle-id');
  const organizationId = parseArg('--organization-id');
  if (!vehicleId || !organizationId) {
    console.error(
      'Usage: battery-ground-truth-inspect.ts --organization-id=<uuid> --vehicle-id=<uuid>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const repo = new BatteryGroundTruthRepository(prisma as unknown as PrismaService);
  const inspector = new BatteryGroundTruthInspectionService(repo);
  try {
    const result = await inspector.inspectVehicle(organizationId, vehicleId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
