#!/usr/bin/env ts-node
/**
 * Read-only fuel-station resolver probe.
 * Usage: npm run fuel-station:resolve -- --lat 51.3127 --lon 9.4797
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FuelStationCandidateRepository } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-candidate.repository';
import { FuelStationLocationResolverService } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-location-resolver.service';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--lat') args.lat = argv[++i];
    if (token === '--lon') args.lon = argv[++i];
    if (token === '--explain') args.explain = '1';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const latitude = Number(args.lat);
  const longitude = Number(args.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error('Usage: npm run fuel-station:resolve -- --lat <lat> --lon <lon> [--explain]');
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const repository = new FuelStationCandidateRepository(prisma as unknown as PrismaService);
  const resolver = new FuelStationLocationResolverService(repository);

  try {
    const result = await resolver.resolve({ latitude, longitude });
    console.log(JSON.stringify(result, null, 2));

    if (args.explain === '1') {
      const plan = await resolver.explainLookupPlan(latitude, longitude);
      console.error('\n--- EXPLAIN ---\n');
      console.error(plan);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
