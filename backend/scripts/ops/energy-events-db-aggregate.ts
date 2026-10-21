import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const total = await prisma.vehicleEnergyEvent.count();
  const createdToday = await prisma.vehicleEnergyEvent.count({
    where: { createdAt: { gte: new Date('2026-08-28T00:00:00.000Z') } },
  });
  const updatedToday = await prisma.vehicleEnergyEvent.count({
    where: { updatedAt: { gte: new Date('2026-08-28T00:00:00.000Z') } },
  });
  const julRecharge = await prisma.vehicleEnergyEvent.count({
    where: {
      kind: 'RECHARGE',
      startTime: {
        gte: new Date('2026-07-16T00:00:00.000Z'),
        lt: new Date('2026-07-18T00:00:00.000Z'),
      },
    },
  });
  const augRefuel = await prisma.vehicleEnergyEvent.count({
    where: {
      kind: 'REFUEL',
      startTime: {
        gte: new Date('2026-08-23T00:00:00.000Z'),
        lt: new Date('2026-08-24T00:00:00.000Z'),
      },
    },
  });
  const byKind = await prisma.$queryRaw<Array<{ kind: string; c: number }>>`
    SELECT kind, count(*)::int AS c FROM vehicle_energy_events GROUP BY kind ORDER BY kind
  `;
  console.log(
    JSON.stringify(
      {
        total,
        createdToday,
        updatedToday,
        julRechargeWindowCount: julRecharge,
        augRefuelWindowCount: augRefuel,
        byKind,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
