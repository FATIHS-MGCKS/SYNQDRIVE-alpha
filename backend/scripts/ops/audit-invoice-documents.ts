/**
 * Read-only invoice ↔ generated document integrity audit.
 *
 * SAFETY: This script never writes to the database. Default mode is dry-run/read-only.
 * Do not point DATABASE_URL at production unless explicitly intended.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts --invoice-id=<uuid> --out=/tmp/audit.json
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-documents.ts --fail-on-critical
 *
 * Flags:
 *   --organization-id=<uuid>   Scope to one tenant
 *   --invoice-id=<uuid>        Scope to one invoice (within org if set)
 *   --limit=<n>                Max findings per organization (default 250)
 *   --batch-size=<n>           Max rows loaded per entity type per org (default 500)
 *   --out=<path>               Write JSON report to file (stdout otherwise)
 *   --fail-on-critical         Exit 2 when critical findings exist (also exits 2 on errors)
 *   --exit-zero                Always exit 0 regardless of findings
 *   --quiet                    Suppress human-readable stderr summary
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { InvoiceDocumentAuditCliModule } from '../../src/modules/invoices/invoice-document-audit-cli.module';
import { InvoiceDocumentIntegrityAuditService } from '../../src/modules/invoices/invoice-document-integrity-audit.service';
import type { InvoiceDocumentIntegrityAuditReport } from '../../src/modules/invoices/invoice-document-integrity-audit.types';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function argValue(flag: string): string | undefined {
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (prefixed) return prefixed.split('=').slice(1).join('=').trim() || undefined;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1]?.trim();
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseIntArg(flag: string): number | undefined {
  const raw = argValue(flag);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function printHumanSummary(report: InvoiceDocumentIntegrityAuditReport): void {
  const { summary, organizationsScanned, entitiesScanned } = report;
  console.error('Invoice Document Integrity Audit (read-only)');
  console.error(
    `Organizations: ${organizationsScanned} | Invoices: ${entitiesScanned.invoices} | Documents: ${entitiesScanned.documents} | Bundles: ${entitiesScanned.bundles}`,
  );
  console.error(
    `Findings: ${summary.totalFindings} (critical: ${summary.critical}, errors: ${summary.errors}, warnings: ${summary.warnings}, info: ${summary.infos})`,
  );

  for (const org of report.organizations) {
    console.error(`\nOrg ${shortId(org.organizationId)}${org.truncated ? ' [truncated]' : ''}`);
    const checks = Object.entries(org.countsByCheck);
    if (checks.length === 0) {
      console.error('  (no findings)');
      continue;
    }
    for (const [checkId, count] of checks.sort(([a], [b]) => a.localeCompare(b))) {
      const repair = org.findings.find((f) => f.checkId === checkId)?.repairClass ?? 'MANUAL_REVIEW';
      console.error(`  ${checkId}: ${count} (${repair})`);
    }
  }
  console.error('\nFull entity IDs are available in the JSON output only.');
}

async function main() {
  const organizationId = argValue('--organization-id');
  const invoiceId = argValue('--invoice-id');
  const outPath = argValue('--out');
  const limit = parseIntArg('--limit');
  const batchSize = parseIntArg('--batch-size');
  const quiet = hasFlag('--quiet');
  const exitZero = hasFlag('--exit-zero');
  const failOnCritical = hasFlag('--fail-on-critical') || !exitZero;

  const app = await NestFactory.createApplicationContext(InvoiceDocumentAuditCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    const audit = app.get(InvoiceDocumentIntegrityAuditService);
    const report = await audit.runAudit({
      organizationId,
      invoiceId,
      limit,
      batchSize,
    });

    const json = JSON.stringify(report, null, 2);
    if (outPath) {
      fs.writeFileSync(outPath, json, 'utf8');
      if (!quiet) console.error(`[audit] JSON written to ${outPath}`);
    } else {
      console.log(json);
    }

    if (!quiet) printHumanSummary(report);

    if (!exitZero) {
      if (failOnCritical && report.summary.critical > 0) {
        process.exitCode = 2;
      } else if (report.summary.errors > 0) {
        process.exitCode = 2;
      } else if (report.summary.warnings > 0) {
        process.exitCode = 1;
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
