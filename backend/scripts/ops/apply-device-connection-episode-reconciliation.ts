/**
 * Controlled device connection episode reconciliation apply (dry-run by default).
 *
 * NEVER run against production without explicit runbook + backup confirmation.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/apply-device-connection-episode-reconciliation.ts \
 *     --organization-id=<uuid> \
 *     --audit-report-hash=<sha256> \
 *     --expected-git-commit=<sha> \
 *     --operator="name" \
 *     --reason="staging replay" \
 *     --batch-size=10
 *
 * Apply (staging only):
 *   ... --apply --backup-confirmed --allow-remote-db
 *
 * Environment:
 *   CONNECTIVITY_RECONCILIATION_ALLOW_REMOTE=1
 *   CONNECTIVITY_RECONCILIATION_ALLOW_PROD=1   (strongly discouraged)
 *   CONNECTIVITY_RECONCILIATION_STAGING_CONFIRMED=1
 *   CONNECTIVITY_RECONCILIATION_GIT_COMMIT=<sha>
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DeviceConnectionEpisodeReconciliationApplyService } from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation-apply.service';
import { DeviceConnectionEpisodeReconciliationService } from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import {
  assertApplyGuards,
  assertSafeEpisodeReconciliationTarget,
  hashAuditReport,
} from '../../src/modules/dimo/device-connection-episode-reconciliation/device-connection-episode-reconciliation.safety.util';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function resolveGitCommit(): string | null {
  if (process.env.CONNECTIVITY_RECONCILIATION_GIT_COMMIT?.trim()) {
    return process.env.CONNECTIVITY_RECONCILIATION_GIT_COMMIT.trim();
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const backupConfirmed = process.argv.includes('--backup-confirmed');
  const allowRemote = process.argv.includes('--allow-remote-db');
  const allowProduction = process.env.CONNECTIVITY_RECONCILIATION_ALLOW_PROD === '1';
  const organizationId = parseArg('--organization-id') ?? process.env.ORG_ID?.trim();
  const vehicleId = parseArg('--vehicle-id');
  const operator = parseArg('--operator');
  const reason = parseArg('--reason');
  const expectedGitCommit = parseArg('--expected-git-commit');
  const expectedAuditHash = parseArg('--audit-report-hash');
  const batchSizeRaw = parseArg('--batch-size');
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : 10;
  const outputPath = parseArg('--output');
  const gitCommit = resolveGitCommit();

  assertSafeEpisodeReconciliationTarget({
    allowRemote,
    allowProduction,
    requireStaging: apply,
  });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const auditService = app.get(DeviceConnectionEpisodeReconciliationService);
    const readOnlyReport = await auditService.runReadOnlyAudit({
      organizationId,
      vehicleId,
    });
    const auditJson = JSON.stringify(readOnlyReport);
    const auditReportHash = hashAuditReport(auditJson);

    assertApplyGuards({
      apply,
      organizationId,
      backupConfirmed,
      auditReportHash,
      expectedAuditReportHash: expectedAuditHash,
      expectedGitCommit,
      operator,
      reason,
      batchSize,
    });

    if (!organizationId) {
      throw new Error('--organization-id is required');
    }

    const applyService = app.get(DeviceConnectionEpisodeReconciliationApplyService);
    const report = await applyService.runApply({
      organizationId,
      vehicleId,
      apply,
      batchSize,
      operator: operator ?? 'unknown',
      reason: reason ?? 'unspecified',
      gitCommit,
      auditReportHash,
    });

    const json = JSON.stringify({ readOnlySummary: readOnlyReport.summary, apply: report }, null, 2);
    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, json, 'utf8');
      console.log(`Wrote report to ${abs}`);
    }
    console.log(json);

    if (!apply) {
      console.error('\nDry-run only — pass --apply --backup-confirmed with operator/reason to execute.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
