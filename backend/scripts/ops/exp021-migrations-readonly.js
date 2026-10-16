const { PrismaClient } = require('/opt/synqdrive/current/backend/node_modules/@prisma/client');
(async () => {
  const p = new PrismaClient();
  const rows = await p.$queryRaw`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    WHERE migration_name LIKE '%20261015%'
       OR migration_name LIKE '%trip_speed%'
       OR migration_name LIKE '%vsi_p2%'
    ORDER BY finished_at DESC`;
  console.log(JSON.stringify(rows));
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e.message || e).slice(0, 300));
  process.exit(1);
});
