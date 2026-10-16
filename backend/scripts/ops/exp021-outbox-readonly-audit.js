const { PrismaClient } = require('/opt/synqdrive/current/backend/node_modules/@prisma/client');
const WORK_ITEMS = [
  'f9a2801f-a623-48ee-9337-33fe5e6cc155',
  '74896a4d-75fa-4b5e-a892-87babb28aeae',
];
(async () => {
  const p = new PrismaClient();
  for (const id of WORK_ITEMS) {
    const ob = await p.$queryRaw`
      SELECT status, last_error_code, attempt_count, next_attempt_at, last_error_at, updated_at
      FROM di_v0_trip_speed_quality_auto_projection_outbox_v1 WHERE work_item_id = ${id}`;
    const cur = await p.$queryRaw`
      SELECT id, work_item_id, lifecycle_status, qc_policy_version, created_at
      FROM di_v0_trip_speed_quality_projections_v1
      WHERE work_item_id = ${id} AND qc_policy_version = 'DI_V0_SPEED_QC_POLICY_V2' AND lifecycle_status = 'CURRENT'`;
    console.log(JSON.stringify({ workItemId: id, outbox: ob[0] ?? null, currentV2: cur }));
  }
  const [{ n }] = await p.$queryRaw`
    SELECT count(*)::int AS n FROM di_v0_trip_speed_quality_projections_v1
    WHERE qc_policy_version = 'DI_V0_SPEED_QC_POLICY_V2' AND lifecycle_status = 'CURRENT'`;
  console.log(JSON.stringify({ globalCurrentV2: n }));
  await p.$disconnect();
})().catch((e) => {
  console.error('ERR', String(e.message || e).slice(0, 300));
  process.exit(1);
});
