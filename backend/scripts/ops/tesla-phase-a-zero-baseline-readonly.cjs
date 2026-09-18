#!/usr/bin/env node
/**
 * Phase-A zero baseline at authoritative T0 (read-only).
 */
const fs = require('fs');
const { PrismaClient, DimoPollJobType } = require('@prisma/client');

const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const T0_ISO = process.env.TESLA_PHASE_A_T0;

function loadEnv() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  if (!T0_ISO) {
    console.error('TESLA_PHASE_A_T0 env required');
    process.exit(1);
  }
  const t0 = new Date(T0_ISO);
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const vls = await prisma.vehicleLatestState.findFirst({
      where: { vehicleId: VEHICLE_ID },
      select: {
        sourceTimestamp: true,
        providerFetchedAt: true,
        lastSeenAt: true,
        updatedAt: true,
        online: true,
      },
    });
    const pollsAtT0 = await prisma.dimoPollLog.count({
      where: {
        vehicleId: VEHICLE_ID,
        jobType: DimoPollJobType.SNAPSHOT,
        startedAt: { gte: t0 },
        status: 'SUCCESS',
      },
    });
    const failedAtT0 = await prisma.dimoPollLog.count({
      where: {
        vehicleId: VEHICLE_ID,
        jobType: DimoPollJobType.SNAPSHOT,
        startedAt: { gte: t0 },
        status: { not: 'SUCCESS' },
      },
    });
    const ageSec = vls?.sourceTimestamp
      ? Math.round((t0.getTime() - vls.sourceTimestamp.getTime()) / 1000)
      : null;
    console.log(
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          teslaPhaseAT0: t0.toISOString(),
          teslaSourceTimestampAtT0: vls?.sourceTimestamp?.toISOString() ?? null,
          teslaVlsUpdatedAtAtT0: vls?.updatedAt?.toISOString() ?? null,
          teslaTelemetryAgeAtT0Sec: ageSec,
          teslaActivityStateAtT0:
            vls?.online === false && ageSec !== null && ageSec > 3600
              ? 'ASLEEP_OR_OFFLINE_STALE'
              : 'UNKNOWN',
          phaseAPollCountAtT0: pollsAtT0 + failedAtT0,
          phaseASuccessPollCountAtT0: pollsAtT0,
          phaseAUniqueSourceAdvancesAtT0: 0,
          phaseAStaleResponseCountAtT0: pollsAtT0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
