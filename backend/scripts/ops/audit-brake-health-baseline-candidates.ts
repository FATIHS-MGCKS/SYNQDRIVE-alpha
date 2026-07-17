/**
 * Read-only audit + controlled apply plan for brake component baseline backfill (Prompts 5 + 12).
 *
 * Default: read-only audit report (DRY RUN).
 * With --organization-id or --vehicle-id: outputs apply plan (DRY RUN unless --apply).
 *
 * Usage (fixture report — no DB):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --fixtures-only
 *
 * Usage (dry-run apply plan):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
 *     --organization-id=<uuid> \
 *     --confirm-git-ref=$(git rev-parse HEAD) \
 *     --confirm-schema-version=20260717140000_brake_component_installation_lifecycle \
 *     --operator=ops@example --reason=staging-validation --max-batch-size=25 \
 *     --expected-audit-version=brake-baseline-backfill-audit-2026-07-v1
 *
 * Usage (controlled apply — never run against production without explicit override):
 *   ...same flags... --confirm-backup --apply --expected-report-hash=<from-plan>
 *
 * Environment:
 *   BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1
 *   BRAKE_HEALTH_AUDIT_ALLOW_PROD=1
 *   BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_REMOTE=1
 *   BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_PROD=1
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  auditBrakeBaselineCandidates,
  BRAKE_BASELINE_AUDIT_ID,
  BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION,
  BRAKE_BASELINE_CANDIDATE_VERSION,
  buildSyntheticBrakeBaselineFixtures,
  renderBrakeBaselineAuditMarkdown,
} from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit';
import {
  DEFAULT_MAX_BRAKE_BASELINE_BATCH_SIZE,
  type BrakeBaselineBackfillApplyRequest,
} from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-backfill-apply';
import { BrakeBaselineBackfillService } from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-backfill.service';
import { BrakeBaselineCandidateAuditService } from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit.service';
import { assertSafeBrakeBaselineAuditTarget } from '../../src/modules/vehicle-intelligence/brakes/brake-baseline-candidate-audit.safety';

async function createAppContext() {
  const appModule = await AppModule.forRootAsync();
  return NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function currentGitRef(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function parseComponents(): Array<'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS'> | undefined {
  const raw = process.argv
    .filter((a) => a.startsWith('--component='))
    .map((a) => a.split('=').slice(1).join('=').trim().toUpperCase())
    .filter(Boolean);
  if (raw.length === 0) return undefined;
  return raw as Array<'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS'>;
}

function hasApplyScope(): boolean {
  return Boolean(parseArg('--organization-id') || parseArg('--vehicle-id'));
}

function buildApplyRequest(): BrakeBaselineBackfillApplyRequest {
  const maxBatchRaw = parseArg('--max-batch-size');
  const maxBatchSize = maxBatchRaw ? Number(maxBatchRaw) : DEFAULT_MAX_BRAKE_BASELINE_BATCH_SIZE;
  const recalcMaxRaw = parseArg('--recalculate-max-vehicles');

  return {
    apply: hasFlag('--apply'),
    organizationId: parseArg('--organization-id'),
    vehicleId: parseArg('--vehicle-id'),
    components: parseComponents(),
    expectedAuditVersion: parseArg('--expected-audit-version') ?? BRAKE_BASELINE_CANDIDATE_VERSION,
    expectedReportHash: parseArg('--expected-report-hash'),
    confirmGitRef: parseArg('--confirm-git-ref') ?? '',
    confirmSchemaVersion: parseArg('--confirm-schema-version') ?? BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION,
    confirmBackup: hasFlag('--confirm-backup'),
    operator: parseArg('--operator') ?? '',
    reason: parseArg('--reason') ?? '',
    maxBatchSize,
    recalculate: hasFlag('--recalculate'),
    recalculateMaxVehicles: recalcMaxRaw ? Number(recalcMaxRaw) : undefined,
  };
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

async function loadAuditInputsForReport(options?: {
  organizationId?: string;
  vehicleId?: string;
  limit?: number;
}): Promise<void> {
  assertSafeBrakeBaselineAuditTarget({
    allowRemote: hasFlag('--allow-remote-db'),
    allowProd: process.env.BRAKE_HEALTH_AUDIT_ALLOW_PROD === '1',
  });

  const app = await createAppContext();

  try {
    const auditService = app.get(BrakeBaselineCandidateAuditService);
    const report = await auditService.runAudit({
      organizationId: options?.organizationId,
      vehicleId: options?.vehicleId,
      limit: options?.limit,
      mode: 'database',
    });
    writeAuditOutputs(report);
  } finally {
    await app.close();
  }
}

async function runBackfillWorkflow(
  auditInputs: ReturnType<typeof buildSyntheticBrakeBaselineFixtures>,
): Promise<void> {
  const request = buildApplyRequest();
  const app = await createAppContext();

  try {
    const service = app.get(BrakeBaselineBackfillService);
    const { plan, result } = await service.run({
      request,
      auditInputs,
      auditSalt: BRAKE_BASELINE_AUDIT_ID,
      actualGitRef: currentGitRef(),
      allowRemote: hasFlag('--allow-remote-db'),
      allowProd: process.env.BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_PROD === '1',
    });

    console.log(
      JSON.stringify(
        {
          mode: request.apply ? 'apply' : 'dry-run',
          auditVersion: plan.auditVersion,
          reportHash: plan.reportHash,
          plan: {
            autoApplicable: plan.autoApplicable.length,
            manualReview: plan.manualReview.length,
            skipped: plan.skipped.length,
          },
          result,
          manualReviewItems: plan.manualReview.map(
            (i) => `${i.vehicleId}:${i.component}:${i.candidateClass}`,
          ),
        },
        null,
        2,
      ),
    );
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

  if (hasApplyScope()) {
    const fixturesOnly = hasFlag('--fixtures-only') || !process.env.DATABASE_URL;
    let auditInputs;
    if (fixturesOnly) {
      auditInputs = buildSyntheticBrakeBaselineFixtures();
    } else {
      assertSafeBrakeBaselineAuditTarget({
        allowRemote: hasFlag('--allow-remote-db'),
        allowProd: process.env.BRAKE_HEALTH_AUDIT_ALLOW_PROD === '1',
      });
      const app = await createAppContext();
      try {
        const auditService = app.get(BrakeBaselineCandidateAuditService);
        auditInputs = await auditService.loadCandidates({
          organizationId: parseArg('--organization-id'),
          vehicleId: parseArg('--vehicle-id'),
          limit,
        });
      } finally {
        await app.close();
      }
    }
    await runBackfillWorkflow(auditInputs);
    return;
  }

  if (hasFlag('--fixtures-only') || !process.env.DATABASE_URL) {
    runFixturesAudit();
    return;
  }

  await loadAuditInputsForReport({ limit });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
