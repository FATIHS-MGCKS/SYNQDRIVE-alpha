/**
 * Prune script: Removes all organizations, users (except MASTER_ADMIN),
 * vehicles, prospects.
 *
 * Run: npx ts-node prisma/prune-master-data.ts  (also: `npm run prisma:prune`)
 *
 * ⚠️  DRIFT WARNING — this script is the CLI twin of
 *     `platform-admin.service.ts#pruneMasterData`. Both delete the exact same
 *     set of tables in the exact same order. If you add a new entity that
 *     needs to be pruned, UPDATE BOTH IMPLEMENTATIONS. A shared list is the
 *     next sensible refactor once the destructive paths are covered by tests.
 *
 * Kept as a raw `PrismaClient` script (not bootstrapping NestJS) so it can
 * run during local dev / CI without spinning up the whole app module graph.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Pruning master admin data...\n');

  // Order matters: respect foreign keys
  await prisma.booking.deleteMany({});
  console.log('  Bookings deleted');

  await prisma.customer.deleteMany({});
  console.log('  Customers deleted');

  await prisma.prospect.updateMany({ data: { convertedOrgId: null } });
  await prisma.prospect.deleteMany({});
  console.log('  Prospects deleted');

  await prisma.vehicleLatestState.deleteMany({});
  await prisma.vehiclePositionUpdate.deleteMany({});
  await prisma.analyticsCache.deleteMany({});
  await prisma.dimoPollLog.deleteMany({});
  await prisma.vehicleEnrichmentJob.deleteMany({});
  await prisma.vehicleServiceEvent.deleteMany({});
  await prisma.vehicleTireTreadMeasurement.deleteMany({});
  await prisma.vehicleTireSetup.deleteMany({});
  await prisma.vehicleBrakeReferenceSpec.deleteMany({});
  await prisma.vehicleBatterySpec.deleteMany({});
  await prisma.vehicle.deleteMany({});
  console.log('  Vehicles + related data deleted');

  await prisma.station.deleteMany({});
  console.log('  Stations deleted');

  await prisma.organizationIntegration.deleteMany({});
  await prisma.organizationProduct.deleteMany({});
  await prisma.billingInvoice.deleteMany({});
  await prisma.billingSubscription.deleteMany({});
  await prisma.organizationMembership.deleteMany({});
  console.log('  Organization integrations/products/memberships deleted');

  await prisma.activityLog.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  console.log('  Activity logs + support tickets deleted');

  await prisma.organization.deleteMany({});
  console.log('  Organizations deleted');

  await prisma.user.deleteMany({
    where: { platformRole: { not: 'MASTER_ADMIN' } },
  });
  console.log('  Non-admin users deleted');

  await prisma.dimoVehicle.deleteMany({});
  console.log('  DIMO vehicles deleted');

  console.log('\n  Prune complete. Master admin is empty.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
