#!/usr/bin/env node
/**
 * VO-SIG-01 backfill dry-run (stdout JSON). Does not mutate data.
 * Run: cd backend && node scripts/ops/vo-sig-01-backfill-dry-run.mjs
 */
import { PrismaClient } from '@prisma/client';
import {
  classifyLinkProviderRepair,
  classifySoldVehicleRepair,
} from './vo-sig-01-backfill-dry-run.lib.cjs';

const p = new PrismaClient();

async function main() {
  const links = await p.vehicleDataSourceLink.findMany({
    where: { isActive: true },
    select: {
      id: true,
      vehicleId: true,
      provider: true,
      sourceType: true,
      sourceSubtype: true,
      isActive: true,
      vehicle: {
        select: {
          organizationId: true,
          registryLifecycle: true,
          hardwareType: true,
          dimoVehicle: { select: { externalId: true } },
        },
      },
    },
  });

  const repairs = links.map((link) => {
    const action = classifyLinkProviderRepair(link);
    const before = { provider: link.provider, sourceType: link.sourceType };
    const after =
      action === 'SAFE_AUTOMATIC' && link.provider === 'UNKNOWN'
        ? { provider: link.sourceType === 'HIGH_MOBILITY' ? 'HIGH_MOBILITY' : 'DIMO' }
        : before;
    return {
      sourceLinkId: link.id,
      vehicleId: link.vehicleId,
      organizationId: link.vehicle.organizationId,
      action,
      before,
      after,
      consumerImpact: action === 'SAFE_AUTOMATIC' ? 'VSI scope keys gain explicit provider' : 'none',
    };
  });

  const vehicles = await p.vehicle.findMany({
    where: { registryLifecycle: 'ACTIVE' },
    select: {
      id: true,
      organizationId: true,
      registryLifecycle: true,
      hardwareType: true,
      dimoVehicle: { select: { externalId: true } },
    },
  });

  const vehicleRepairs = vehicles.map((v) => ({
    vehicleId: v.id,
    organizationId: v.organizationId,
    action: classifySoldVehicleRepair({
      registryLifecycle: v.registryLifecycle,
      dimoExternalId: v.dimoVehicle?.externalId,
    }),
    note:
      classifySoldVehicleRepair({
        registryLifecycle: v.registryLifecycle,
        dimoExternalId: v.dimoVehicle?.externalId,
      }) === 'MANUAL_REVIEW_OFFBOARD'
        ? 'Use canonical Vehicle Onboarding offboard — do not reconnect'
        : null,
  }));

  console.log(
    JSON.stringify(
      {
        mode: 'DRY_RUN',
        productionMutations: false,
        linkRepairs: repairs,
        vehicleRepairs: vehicleRepairs.filter((r) => r.action !== 'NO_OP'),
        rollback: 'No writes performed; transactional backfill would run per-link UPDATE with audit row',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
