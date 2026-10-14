#!/usr/bin/env ts-node
/**
 * EXP-021 P2.1 — read-only trip speed quality preview (single work item).
 * Does NOT persist projections, mutate S4/S2, or call external providers.
 *
 * Required: DATABASE_URL (read-only credentials recommended).
 *
 * Usage:
 *   npx ts-node scripts/ops/di-v0-trip-speed-quality-preview.ts \
 *     --organizationId <uuid> --tripId <uuid> --workItemId <uuid>
 */
import { PrismaClient } from '@prisma/client';
import { previewDiV0TripSpeedQualityForWorkItem } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-preview';

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main(): Promise<void> {
  const organizationId =
    readArg('organizationId') ?? process.env.DI_V0_P21_ORGANIZATION_ID ?? process.env.ORGANIZATION_ID;
  const tripId = readArg('tripId') ?? process.env.DI_V0_P21_TRIP_ID;
  const workItemId = readArg('workItemId') ?? process.env.DI_V0_P21_WORK_ITEM_ID;

  if (!organizationId || !tripId || !workItemId) {
    console.error(
      'Missing required scope: --organizationId, --tripId, --workItemId (or DI_V0_P21_* env vars)',
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const report = await previewDiV0TripSpeedQualityForWorkItem(prisma, {
      organizationId,
      tripId,
      workItemId,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.outcome === 'NOT_ASSESSABLE' ? 3 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
