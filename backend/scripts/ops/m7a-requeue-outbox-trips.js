#!/usr/bin/env node
/**
 * Targeted M7A recovery: re-queue completed outbox rows for specific trip IDs so the
 * scheduler can re-process after a config fix. Does not delete historical FAILED runs.
 *
 * Usage (production, from backend dir with shared env):
 *   node scripts/ops/m7a-requeue-outbox-trips.js <tripId> [tripId...]
 */
const fs = require('fs');

function loadSharedEnv(path) {
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    process.env[t.slice(0, eq)] = t.slice(eq + 1);
  }
}

const envPath = process.env.SYNQDRIVE_SHARED_ENV_PATH || '/opt/synqdrive/shared/backend.env';
if (fs.existsSync(envPath)) loadSharedEnv(envPath);

const TRIPS = process.argv.slice(2);
if (TRIPS.length === 0) {
  console.error('usage: node scripts/ops/m7a-requeue-outbox-trips.js <tripId> [tripId...]');
  process.exit(2);
}

const { PrismaClient } = require('@prisma/client');

(async () => {
  const db = new PrismaClient();
  const updated = await db.$executeRawUnsafe(
    `UPDATE di_v0_m7a_road_assignment_shadow_outbox_v1
     SET status = $1, next_attempt_at = now(), claim_token = NULL, claim_expires_at = NULL,
         last_error_code = $2, updated_at = now()
     WHERE trip_id::text = ANY($3::text[]) AND status = $4`,
    'PENDING',
    'OPS_REQUEUE_BBOX_CONFIG_FIX',
    TRIPS,
    'SUCCEEDED',
  );
  const rows = await db.$queryRawUnsafe(
    `SELECT trip_id::text, status, last_error_code FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE trip_id::text = ANY($1::text[])`,
    TRIPS,
  );
  console.log(JSON.stringify({ updatedRows: updated, outbox: rows }, null, 2));
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
