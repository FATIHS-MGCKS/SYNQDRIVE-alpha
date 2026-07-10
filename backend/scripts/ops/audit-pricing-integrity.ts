/**
 * Read-only pricing integrity audit (per organization or all orgs).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-pricing-integrity.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-pricing-integrity.ts --organization-id=<uuid>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PricingIntegrityAuditService } from '../../src/modules/pricing/pricing-integrity-audit.service';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseOrgId(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--organization-id='));
  return arg?.split('=')[1]?.trim() || undefined;
}

async function main() {
  const organizationId = parseOrgId();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const audit = app.get(PricingIntegrityAuditService);
    const report = await audit.runAudit(organizationId);
    console.log(JSON.stringify(report, null, 2));
    if (report.summary.errors > 0) {
      process.exitCode = 2;
    } else if (report.summary.warnings > 0) {
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
