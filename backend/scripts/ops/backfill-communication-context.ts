#!/usr/bin/env npx ts-node
/**
 * Bounded Communication Center context backfill (C6).
 * Usage:
 *   npx ts-node scripts/ops/backfill-communication-context.ts --org <uuid> [--channel WHATSAPP|SMS|VOICE] [--apply]
 */
import { NestFactory } from '@nestjs/core';
import { CommunicationChannel } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { CommunicationContextBackfillService } from '../../src/modules/communication/context/communication-context-enrichment.service';
import { reportOpsScriptFailure } from './communication-ops-script.util';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const organizationId = readArg('--org');
  if (!organizationId) {
    console.error('Missing required --org <organizationId>');
    process.exit(1);
  }

  const channelRaw = readArg('--channel');
  const channel = channelRaw
    ? CommunicationChannel[channelRaw as keyof typeof CommunicationChannel]
    : undefined;
  if (channelRaw && !channel) {
    console.error(`Invalid --channel ${channelRaw}`);
    process.exit(1);
  }

  const dryRun = !process.argv.includes('--apply');
  const batchSize = Number(readArg('--batch-size') ?? '100');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const backfill = app.get(CommunicationContextBackfillService);
    const result = await backfill.backfillOrganization({
      organizationId,
      channel,
      batchSize,
      unresolvedOnly: true,
      dryRun,
    });

    console.log(
      JSON.stringify({
        dryRun,
        organizationId,
        channel: channel ?? 'ALL',
        ...result,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  reportOpsScriptFailure(error);
  process.exit(1);
});
