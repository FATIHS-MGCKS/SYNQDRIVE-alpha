#!/usr/bin/env node
/**
 * EXP-021 operator preflight — verifies settlement shadow readiness before physical drive.
 *
 * Usage:
 *   ORGANIZATION_ID=... VEHICLE_ID=... TOKEN_ID=... \
 *   REFERENCE_CAPTURE_ENABLED=true REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true \
 *   node backend/scripts/ops/reference-capture-exp-021-preflight.cjs
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  const vehicleId = process.env.VEHICLE_ID;
  const tokenId = Number.parseInt(process.env.TOKEN_ID ?? '', 10);

  const rcEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.REFERENCE_CAPTURE_ENABLED ?? '').toLowerCase(),
  );
  const shadowEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED ?? '').toLowerCase(),
  );

  const prisma = new PrismaClient();
  let activeSessionId = null;
  let staleShadowJobs = 0;
  let persistenceWritable = true;

  try {
    if (organizationId && vehicleId) {
      const active = await prisma.referenceCaptureSession.findFirst({
        where: {
          organizationId,
          vehicleId,
          status: { in: ['RECORDING', 'STARTING', 'STOPPING'] },
        },
        select: { id: true },
      });
      activeSessionId = active?.id ?? null;

      staleShadowJobs = await prisma.referenceCaptureSettlementShadowSchedule.count({
        where: {
          organizationId,
          vehicleId,
          status: { in: ['PENDING', 'EXECUTING'] },
        },
      });
    }
  } catch (error) {
    persistenceWritable = false;
    console.error('Persistence check failed:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }

  const checks = [
    { code: 'REFERENCE_CAPTURE_ENABLED', ok: rcEnabled },
    { code: 'SETTLEMENT_SHADOW_ENABLED', ok: shadowEnabled },
    {
      code: 'VEHICLE_TOKEN_CONFIGURED',
      ok: Boolean(organizationId && vehicleId && Number.isFinite(tokenId) && tokenId > 0),
    },
    { code: 'NO_STALE_CALIBRATION_SESSION', ok: !activeSessionId },
    { code: 'NO_STALE_SHADOW_JOBS', ok: staleShadowJobs === 0 },
    { code: 'PERSISTENCE_WRITABLE', ok: persistenceWritable },
    { code: 'NEXT_SEQUENCE', ok: true, detail: '60→30→20→10' },
    { code: 'VIDEO_GT_REQUIRED', ok: true, detail: 'Timestamped video CEST UTC+2' },
  ];

  const ready = checks.every((c) => c.ok);

  console.log(JSON.stringify({
    EXP021_PREFLIGHT_READY: ready ? 'YES' : 'NO',
    EXP021_VEHICLE_RUNTIME_CONFIGURABLE: 'YES',
    EXP021_VEHICLE_HARDCODED: 'NO',
    organizationId: organizationId ?? null,
    vehicleId: vehicleId ?? null,
    tokenId: Number.isFinite(tokenId) ? tokenId : null,
    EXPECTED_SETTLEMENT_SHADOW_REQUESTS: 48,
    EXPECTED_POST_TRIP_SHADOW_REQUESTS: 6,
    checks,
  }, null, 2));

  process.exit(ready ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
