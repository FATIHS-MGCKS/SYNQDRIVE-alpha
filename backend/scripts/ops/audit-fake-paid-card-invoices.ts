/**
 * Read-only audit: identify booking invoices possibly marked PAID from checkout
 * card intent alone (pre-fix bug) without real payment proof.
 *
 * This script NEVER mutates data. Dry-run is the only behavior.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --from=2026-01-01 --to=2026-12-31
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --human
 *
 * Environment:
 *   ORG_ID=<uuid>          (alias for --organization-id)
 *   DATE_FROM=ISO          (alias for --from)
 *   DATE_TO=ISO            (alias for --to)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { FakePaidCardAuditService } from '../../src/modules/invoices/fake-paid-card-audit.service';

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

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d;
}

async function main() {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const dateFrom = parseDate(parseArg('--from') ?? process.env.DATE_FROM);
  const dateTo = parseDate(parseArg('--to') ?? process.env.DATE_TO);
  const humanOnly = process.argv.includes('--human');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const audit = app.get(FakePaidCardAuditService);
    const report = await audit.runAudit({ organizationId, dateFrom, dateTo });

    if (humanOnly) {
      console.log(report.humanSummary);
      if (report.candidates.length > 0) {
        console.log('');
        for (const c of report.candidates) {
          console.log(
            `[${c.confidence}] invoice=${c.invoiceNumber ?? c.invoiceId} booking=${c.bookingId} payment=${c.paymentId} ${c.amountCents / 100} ${c.currency}`,
          );
          for (const reason of c.reasons) {
            console.log(`  - ${reason}`);
          }
        }
      }
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    if (report.summary.high > 0) {
      process.exitCode = 2;
    } else if (report.summary.medium > 0 || report.summary.low > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
