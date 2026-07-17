/**
 * Read-only audit for existing vehicles without BrakeHealthCurrent or reliable baseline.
 *
 * Does NOT mutate production data, enqueue jobs, or execute backfill.
 *
 * Usage (fixture report — no DB):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --fixtures-only
 *
 * Usage (database audit):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --vehicle-id=<uuid> --limit=50
 *
 * Environment:
 *   BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1   read-only audit on remote DB
 *   BRAKE_HEALTH_AUDIT_ALLOW_PROD=1     read-only audit on prod-like DB (supervised)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  auditBrakeBaselineCandidates,
  BRAKE_BASELINE_AUDIT_ID,
  buildSyntheticBrakeBaselineFixtures,
  renderBrakeBaselineAuditMarkdown,
} from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit';
import { BrakeBaselineCandidateAuditService } from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit.service';
import { assertSafeBrakeBaselineAuditTarget } from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit.safety';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function writeAuditOutputs(
  report: ReturnType<typeof auditBrakeBaselineCandidates>,
): void {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const outputDir = parseArg('--output-dir') ?? path.join(repoRoot, 'docs', 'audits', 'data');
  const reportPath =
    parseArg('--report') ??
    path.join(repoRoot, 'docs', 'audits', 'brake-health-baseline-backfill-candidates-2026-07.md');

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'brake-health-baseline-backfill-candidates-2026-07.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(reportPath, renderBrakeBaselineAuditMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        auditId: report.auditId,
        mode: report.mode,
        jsonPath,
        reportPath,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

function runFixturesAudit(): void {
  writeAuditOutputs(
    auditBrakeBaselineCandidates(buildSyntheticBrakeBaselineFixtures(), {
      auditId: BRAKE_BASELINE_AUDIT_ID,
      mode: 'fixtures',
    }),
  );
}

async function runDatabaseAudit(limit?: number): Promise<void> {
  assertSafeBrakeBaselineAuditTarget({
    allowRemote: process.argv.includes('--allow-remote-db'),
    allowProd: process.env.BRAKE_HEALTH_AUDIT_ALLOW_PROD === '1',
  });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const auditService = app.get(BrakeBaselineCandidateAuditService);
    const report = await auditService.runAudit({
      organizationId: parseArg('--organization-id'),
      vehicleId: parseArg('--vehicle-id'),
      limit,
      mode: 'database',
    });
    writeAuditOutputs(report);
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnv();

  const limitRaw = parseArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive number');
  }

  if (process.argv.includes('--fixtures-only') || !process.env.DATABASE_URL) {
    runFixturesAudit();
    return;
  }

  await runDatabaseAudit(limit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
