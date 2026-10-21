#!/usr/bin/env ts-node
/**
 * M3.3-HV-H1 — bounded read-only evidence readiness report (stdout JSON).
 */
import { PrismaClient } from '@prisma/client';
import { assertM3_3HvH1ReportDatabaseAllowed } from '../../src/modules/vehicle-intelligence/battery-health/hv-h1/m3-3-hv-h1-evidence-readiness-report.env';
import { runM3_3HvH1EvidenceReadinessReport } from '../../src/modules/vehicle-intelligence/battery-health/hv-h1/m3-3-hv-h1-evidence-readiness-report.service';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  try {
    assertM3_3HvH1ReportDatabaseAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  if (!organizationId || !vehicleId) {
    console.error(
      'Usage: battery-hv-h1-evidence-readiness-report.ts --organization-id=<uuid> --vehicle-id=<uuid> [--evaluation-at=<ISO>]',
    );
    console.error(
      'Note: --evaluation-at bounds session/observation cutoff only; capability rows are CURRENT_STATE_AT_QUERY (not historical snapshot).',
    );
    process.exit(1);
  }

  const evaluationAtRaw =
    parseArg('--evaluation-at') ?? parseArg('--as-of');
  const evaluationAt = evaluationAtRaw ? new Date(evaluationAtRaw) : new Date();
  if (Number.isNaN(evaluationAt.getTime())) {
    console.error(`Invalid --evaluation-at: ${evaluationAtRaw}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const report = await runM3_3HvH1EvidenceReadinessReport(prisma, {
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
