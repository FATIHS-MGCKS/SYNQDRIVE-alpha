/**
 * Controlled invoice ↔ document link backfill (dry-run by default).
 *
 * SAFETY: Default is dry-run (no writes). Apply requires --apply --confirm.
 * Do not run against production without audit review and backup.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
 *     --organization-id=<uuid>
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
 *     --organization-id=<uuid> --apply --confirm
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-documents.ts \
 *     --organization-id=<uuid> --checkpoint=/tmp/inv-doc-checkpoint.json --out=/tmp/backfill.json
 *
 * Flags:
 *   --organization-id=<uuid>   Required — one tenant per run
 *   --invoice-id=<uuid>        Optional single-invoice scope
 *   --dry-run                  Default; plan only (no writes)
 *   --apply --confirm          Execute writes (both flags required)
 *   --batch-size=<n>           Invoice batch size (default 200)
 *   --transaction-size=<n>     Actions per DB transaction (default 25)
 *   --checkpoint=<path>        Resume from / save checkpoint JSON
 *   --out=<path>               Write JSON result to file
 *   --quiet                    Suppress stderr summary
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { InvoiceDocumentAuditCliModule } from '../../src/modules/invoices/invoice-document-audit-cli.module';
import { InvoiceDocumentBackfillService } from '../../src/modules/invoices/invoice-document-backfill.service';
import type {
  InvoiceDocumentBackfillCheckpoint,
  InvoiceDocumentBackfillResult,
} from '../../src/modules/invoices/invoice-document-backfill.types';

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

function loadCheckpoint(filePath: string): InvoiceDocumentBackfillCheckpoint | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as InvoiceDocumentBackfillCheckpoint;
}

function printSummary(result: InvoiceDocumentBackfillResult): void {
  const { stats, readOnly, durationMs } = result;
  console.error(`Invoice Document Backfill (${readOnly ? 'dry-run' : 'APPLY'})`);
  console.error(
    `Checked: ${stats.checked} | Changed: ${stats.changed} | Already correct: ${stats.alreadyCorrect} | Skipped: ${stats.skipped} | Manual: ${stats.manualReview} | Errors: ${stats.errors} | ${durationMs}ms`,
  );
  if (readOnly && stats.changed > 0) {
    console.error('[dry-run] Re-run with --apply --confirm to persist changes.');
  }
}

async function main() {
  const organizationId = argValue('--organization-id');
  if (!organizationId) {
    console.error('--organization-id=<uuid> is required');
    process.exit(1);
  }

  const apply = hasFlag('--apply');
  const dryRun = hasFlag('--dry-run') || !apply;
  const confirm = hasFlag('--confirm');

  if (apply && dryRun) {
    console.error('Use either --dry-run (default) or --apply --confirm, not both');
    process.exit(1);
  }

  const checkpointPath = argValue('--checkpoint');
  const outPath = argValue('--out');
  const checkpoint = checkpointPath ? loadCheckpoint(checkpointPath) : null;

  const app = await NestFactory.createApplicationContext(InvoiceDocumentAuditCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    const backfill = app.get(InvoiceDocumentBackfillService);
    const result = await backfill.run({
      organizationId,
      invoiceId: argValue('--invoice-id'),
      mode: apply ? 'apply' : 'dry-run',
      confirmed: confirm,
      batchSize: parseIntArg('--batch-size'),
      transactionSize: parseIntArg('--transaction-size'),
      checkpoint,
    });

    const json = JSON.stringify(result, null, 2);
    if (outPath) fs.writeFileSync(outPath, json, 'utf8');
    else console.log(json);

    if (checkpointPath) {
      fs.writeFileSync(checkpointPath, JSON.stringify(result.checkpoint, null, 2), 'utf8');
    }

    if (!hasFlag('--quiet')) printSummary(result);

    if (result.stats.errors > 0) process.exitCode = 2;
    else if (apply && !confirm) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
