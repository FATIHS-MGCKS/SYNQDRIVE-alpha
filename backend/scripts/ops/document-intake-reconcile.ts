/**
 * Read-only document intake inventory reconciliation (default dry-run).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/document-intake-reconcile.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/document-intake-reconcile.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/document-intake-reconcile.ts --output=./tmp/document-intake-reconcile.json
 *
 * This tool never mutates production data. --execute is ignored.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DocumentIntakeReconciliationService } from '../../src/modules/document-extraction/diagnostic/document-intake-reconciliation.service';

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

async function main() {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const limitRaw = parseArg('--limit');
  const sampleLimit = limitRaw ? Number(limitRaw) : undefined;
  if (sampleLimit != null && (!Number.isFinite(sampleLimit) || sampleLimit < 1)) {
    throw new Error('--limit must be a positive number');
  }
  const outputPath = parseArg('--output');
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--no-dry-run');

  if (!dryRun) {
    console.error('document-intake-reconcile is read-only; --no-dry-run is ignored.');
  }
  if (process.argv.includes('--execute')) {
    console.error('--execute is not supported. Use the action recovery scheduler for controlled apply recovery.');
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const reconcile = app.get(DocumentIntakeReconciliationService);
    const report = await reconcile.runReconciliation({ organizationId, sampleLimit });
    const json = JSON.stringify(report, null, 2);

    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, json, 'utf8');
      console.log(`Wrote report to ${abs}`);
    }

    console.log(json);
    const errorCount = report.findings.filter((row) => row.severity === 'ERROR').length;
    if (errorCount > 0) {
      console.error(`Findings with severity ERROR: ${errorCount}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
