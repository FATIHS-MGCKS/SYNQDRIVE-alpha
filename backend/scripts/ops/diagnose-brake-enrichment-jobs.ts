/**
 * Read-only diagnostics for legacy `vehicle_enrichment_jobs` rows with jobType=BRAKE.
 *
 * Does NOT enqueue, mutate, replay, or auto-execute jobs.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/diagnose-brake-enrichment-jobs.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/diagnose-brake-enrichment-jobs.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/diagnose-brake-enrichment-jobs.ts --vehicle-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/diagnose-brake-enrichment-jobs.ts --status=PENDING
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { EnrichmentJobStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { BrakeEnrichmentJobDiagnosticsService } from '../../src/modules/vehicle-intelligence/brakes/brake-enrichment-job-diagnostics.service';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArgs() {
  const orgArg = process.argv.find((a) => a.startsWith('--organization-id='));
  const vehicleArg = process.argv.find((a) => a.startsWith('--vehicle-id='));
  const statusArg = process.argv.find((a) => a.startsWith('--status='));
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));

  const statusRaw = statusArg?.split('=')[1]?.trim().toUpperCase();
  const status =
    statusRaw && statusRaw in EnrichmentJobStatus
      ? (statusRaw as EnrichmentJobStatus)
      : undefined;

  return {
    organizationId: orgArg?.split('=')[1]?.trim() || undefined,
    vehicleId: vehicleArg?.split('=')[1]?.trim() || undefined,
    status,
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const diagnostics = app.get(BrakeEnrichmentJobDiagnosticsService);
    const report = await diagnostics.diagnoseLegacyBrakeJobs(args);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
