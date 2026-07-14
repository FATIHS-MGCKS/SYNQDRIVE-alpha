/**
 * Read-only Connect payment integrity audit.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-connect-payment-integrity.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-connect-payment-integrity.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-connect-payment-integrity.ts --human
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { ConnectPaymentAuditService } from '../../src/modules/payments/audit/connect-payment-audit.service';

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
  const humanOnly = process.argv.includes('--human');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const audit = app.get(ConnectPaymentAuditService);
    const report = await audit.runAudit(organizationId ? { organizationId } : undefined);

    if (humanOnly) {
      console.log(`Connect payment audit — ${report.summary.total} finding(s)`);
      for (const f of report.findings) {
        console.log(`[${f.severity}] ${f.category}: ${f.message}`);
      }
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    process.exit(report.summary.bySeverity.HIGH > 0 ? 2 : 0);
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
