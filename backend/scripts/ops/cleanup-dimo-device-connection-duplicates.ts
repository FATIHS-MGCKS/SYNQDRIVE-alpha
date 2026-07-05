/**
 * One-time / occasional cleanup for historical DIMO OBD plug/unplug webhook spam.
 *
 * Removes rows that are not canonical state transitions (leading baseline PLUGGED_IN
 * bursts and consecutive same-type duplicates).
 *
 * Usage (on VPS with DATABASE_URL from backend.env):
 *   npx ts-node scripts/ops/cleanup-dimo-device-connection-duplicates.ts --dry-run
 *   npx ts-node scripts/ops/cleanup-dimo-device-connection-duplicates.ts --execute
 *
 * Optional: --vehicle-id=<uuid> to scope a single vehicle.
 */
import { PrismaClient } from '@prisma/client';
import { filterCanonicalDeviceConnectionEvents } from '../../src/modules/dimo/device-connection-read-model';

const prisma = new PrismaClient();

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const execute = process.argv.includes('--execute');
  const vehicleArg = process.argv.find((a) => a.startsWith('--vehicle-id='));
  const vehicleId = vehicleArg?.split('=')[1]?.trim() || undefined;

  if (dryRun === execute) {
    console.error('Pass exactly one of --dry-run or --execute');
    process.exit(1);
  }

  return { dryRun, execute, vehicleId };
}

async function main() {
  const { dryRun, execute, vehicleId } = parseArgs();

  const events = await prisma.dimoDeviceConnectionEvent.findMany({
    where: {
      provider: 'DIMO',
      ...(vehicleId ? { vehicleId } : {}),
    },
    select: {
      id: true,
      vehicleId: true,
      eventType: true,
      observedAt: true,
    },
    orderBy: [{ vehicleId: 'asc' }, { observedAt: 'asc' }],
  });

  const byVehicle = new Map<string, typeof events>();
  for (const event of events) {
    const list = byVehicle.get(event.vehicleId) ?? [];
    list.push(event);
    byVehicle.set(event.vehicleId, list);
  }

  const deleteIds: string[] = [];
  const vehicleStats: Array<{
    vehicleId: string;
    total: number;
    keep: number;
    remove: number;
  }> = [];

  for (const [vid, vehicleEvents] of byVehicle) {
    const canonical = filterCanonicalDeviceConnectionEvents(vehicleEvents);
    const keepIds = new Set(canonical.map((e) => e.id));
    const remove = vehicleEvents.filter((e) => !keepIds.has(e.id));
    deleteIds.push(...remove.map((e) => e.id));
    vehicleStats.push({
      vehicleId: vid,
      total: vehicleEvents.length,
      keep: canonical.length,
      remove: remove.length,
    });
  }

  vehicleStats.sort((a, b) => b.remove - a.remove);

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'execute',
        scopedVehicleId: vehicleId ?? null,
        vehicles: byVehicle.size,
        totalRows: events.length,
        rowsToKeep: events.length - deleteIds.length,
        rowsToDelete: deleteIds.length,
        topVehiclesByRemovals: vehicleStats.filter((v) => v.remove > 0).slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (deleteIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (dryRun) {
    console.log('Dry run complete — no rows deleted.');
    return;
  }

  const BATCH = 500;
  let deleted = 0;
  for (let i = 0; i < deleteIds.length; i += BATCH) {
    const batch = deleteIds.slice(i, i + BATCH);
    const result = await prisma.dimoDeviceConnectionEvent.deleteMany({
      where: { id: { in: batch } },
    });
    deleted += result.count;
    console.log(`Deleted batch ${Math.floor(i / BATCH) + 1}: ${result.count} row(s)`);
  }

  const remaining = await prisma.dimoDeviceConnectionEvent.count({
    where: vehicleId ? { vehicleId } : undefined,
  });

  console.log(
    JSON.stringify(
      {
        deleted,
        remaining,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
