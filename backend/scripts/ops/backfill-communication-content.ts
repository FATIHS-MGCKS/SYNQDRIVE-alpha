#!/usr/bin/env npx ts-node
/**
 * Bounded Communication Center canonical content backfill (C7.2).
 * Usage:
 *   npx ts-node scripts/ops/backfill-communication-content.ts --org <uuid> [--channel WHATSAPP|SMS] [--apply]
 */
import { NestFactory } from '@nestjs/core';
import { CommunicationChannel } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { CommunicationContentBackfillService } from '../../src/modules/communication/content/communication-content-backfill.service';
import { reportOpsScriptFailure } from './communication-ops-script.util';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const organizationId = readArg('--org');
  if (!organizationId) {
    console.error(JSON.stringify({ status: 'failed', error: 'MissingOrgArgument' }));
    process.exit(1);
  }

  const channelRaw = readArg('--channel');
  const channel = channelRaw
    ? CommunicationChannel[channelRaw as keyof typeof CommunicationChannel]
    : undefined;
  if (channelRaw && (!channel || (channel !== 'WHATSAPP' && channel !== 'SMS'))) {
    console.error(JSON.stringify({ status: 'failed', error: 'InvalidChannelArgument' }));
    process.exit(1);
  }

  const dryRun = !process.argv.includes('--apply');
  const batchSize = Number(readArg('--batch-size') ?? '100');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const backfill = app.get(CommunicationContentBackfillService);
    const result = await backfill.backfillOrganization({
      organizationId,
      channel: channel as 'WHATSAPP' | 'SMS' | undefined,
      batchSize,
      dryRun,
    });

    console.log(
      JSON.stringify({
        dryRun,
        channel: channel ?? 'WHATSAPP+SMS',
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
