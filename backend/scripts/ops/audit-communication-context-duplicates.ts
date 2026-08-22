#!/usr/bin/env npx ts-node
/**
 * Aggregate-only duplicate customer identity audit for Communication Center C6.
 * Usage: npx ts-node scripts/ops/audit-communication-context-duplicates.ts [--org <uuid>]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { CommunicationContextDuplicateAuditService } from '../../src/modules/communication/context/communication-context-duplicate-audit.service';
import { reportOpsScriptFailure } from './communication-ops-script.util';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const organizationId = readArg('--org');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const audit = app.get(CommunicationContextDuplicateAuditService);
    const result = await audit.audit({ organizationId });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  reportOpsScriptFailure(error);
  process.exit(1);
});
