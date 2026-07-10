/**
 * Backfill vehicle driving-assessment device-quality state from recent trips.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-driving-assessment-device-quality.ts --plate 7503
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DrivingAssessmentDeviceQualityService } from '../src/modules/vehicle-intelligence/trips/driving-assessment-device-quality.service';
import { PrismaService } from '../src/shared/database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const plate = process.argv.includes('--plate')
    ? process.argv[process.argv.indexOf('--plate') + 1]
    : '7503';

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const quality = app.get(DrivingAssessmentDeviceQualityService);

    const vehicle = await prisma.vehicle.findFirst({
      where: { licensePlate: { contains: plate, mode: 'insensitive' } },
      select: { id: true, licensePlate: true, hardwareType: true },
    });

    if (!vehicle) {
      console.error(`[backfill-device-quality] No vehicle for plate fragment "${plate}"`);
      process.exit(1);
    }

    console.log(`[backfill-device-quality] Reconciling ${vehicle.licensePlate} (${vehicle.id})`);
    await quality.reconcileVehicle(vehicle.id);
    const status = await quality.getVehicleStatus(vehicle.id);
    console.log(JSON.stringify(status, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[backfill-device-quality] Failed:', err);
  process.exit(1);
});
