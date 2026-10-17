/**
 * G5C-N14 read-only LV operational condition evaluation harness.
 * NEVER mutates production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/lv-operational-condition-evaluation-readonly.ts \
 *     --organization-id=<uuid> --vehicle-id=<uuid> [--vehicle-id=<uuid> ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { LvMeasuredIntelligenceReadService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence-read.service';
import type { LongitudinalProfileRevisionInspectionService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-revision-inspection.service';
import { buildLvOperationalConditionInputV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-input.builder';
import { evaluateLvOperationalConditionV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.evaluator';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ??
    path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
  // Read-only harness: satisfy app.config JWT gate without enabling HTTP auth.
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'lv-operational-condition-readonly-harness';
  }
  if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = 'development';
  }
}

function parseArgs(prefix: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`${prefix}=`))
    .map((a) => a.split('=').slice(1).join('=').trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const organizationId =
    parseArgs('--organization-id')[0] ?? process.env.ORG_ID?.trim();
  const vehicleIds = parseArgs('--vehicle-id');

  if (!organizationId || vehicleIds.length === 0) {
    console.error(
      'Usage: lv-operational-condition-evaluation-readonly.ts --organization-id=<uuid> --vehicle-id=<uuid>+',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const d4InspectionStub = {
    inspectRevision: async () => ({ status: 'NOT_FOUND' as const }),
  } satisfies Pick<LongitudinalProfileRevisionInspectionService, 'inspectRevision'>;
  const readModel = new LvMeasuredIntelligenceReadService(
    prisma as unknown as PrismaService,
    d4InspectionStub as LongitudinalProfileRevisionInspectionService,
  );

  try {
    await prisma.$connect();

    const report: Record<string, unknown> = {
      evaluatedAt: new Date().toISOString(),
      organizationId,
      vehicles: [],
    };

    for (const vehicleId of vehicleIds) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true, licensePlate: true },
      });
      if (!vehicle) {
        console.error(`Vehicle not found in org: ${vehicleId}`);
        continue;
      }

      const to = new Date();
      const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

      const conditionInput = await buildLvOperationalConditionInputV1(
        { prisma, readModel },
        {
          organizationId,
          vehicleId,
          measuredFrom: from,
          measuredTo: to,
          observationLimit: 500,
        },
      );

      const assessment = evaluateLvOperationalConditionV1(conditionInput);

      (report.vehicles as unknown[]).push({
        vehicleId,
        licensePlate: vehicle.licensePlate,
        chemistry: conditionInput.chemistry,
        openProviderGaps: conditionInput.openProviderObservabilityGapCount,
        inputCoverageIncomplete: conditionInput.inputCoverageIncomplete,
        eligibleRestCount: conditionInput.eligibleRestObservations.length,
        wakeObservationCount: conditionInput.wakeVoltageObservations.length,
        assessment,
      });
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
