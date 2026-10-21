#!/usr/bin/env ts-node
/**
 * M3.3-HV-H3 — bounded read-only longitudinal trend report (stdout JSON).
 */
import { PrismaClient } from '@prisma/client';
import { assertM3_3HvH3ReportDatabaseAllowed } from '../../src/modules/vehicle-intelligence/battery-health/hv-h3/m3-3-hv-h3-report.env';
import { runM3_3HvH3LongitudinalTrendReport } from '../../src/modules/vehicle-intelligence/battery-health/hv-h3/m3-3-hv-h3-trend-report.service';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  try {
    assertM3_3HvH3ReportDatabaseAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  if (!organizationId || !vehicleId) {
    console.error(
      'Usage: battery-hv-h3-trend-report.ts --organization-id=<uuid> --vehicle-id=<uuid> [--evaluation-at=<ISO>]',
    );
    process.exit(1);
  }

  const evaluationAtRaw = parseArg('--evaluation-at');
  const evaluationAt = evaluationAtRaw ? new Date(evaluationAtRaw) : new Date();
  if (Number.isNaN(evaluationAt.getTime())) {
    console.error(`Invalid --evaluation-at: ${evaluationAtRaw}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const report = await runM3_3HvH3LongitudinalTrendReport(prisma, {
      organizationId,
      vehicleId,
      evaluationAt,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
