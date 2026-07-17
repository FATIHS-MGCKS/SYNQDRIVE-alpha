import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { CanonicalAgentConfig } from '../agent-deployment/agent-config.types';

const DEFAULT_TRANSCRIPT_DAYS = 90;
const DEFAULT_SUMMARY_DAYS = 90;
const DEFAULT_PROVIDER_PAYLOAD_DAYS = 30;

@Injectable()
export class VoiceRetentionService {
  private readonly logger = new Logger(VoiceRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purgeOrganization(organizationId: string): Promise<{
    transcriptsCleared: number;
    summariesCleared: number;
    webhookPayloadsCleared: number;
  }> {
    const retention = await this.resolveRetentionDays(organizationId);
    const now = Date.now();

    const transcriptCutoff = new Date(now - retention.transcriptDays * 24 * 60 * 60 * 1000);
    const summaryCutoff = new Date(now - retention.summaryDays * 24 * 60 * 60 * 1000);
    const payloadCutoff = new Date(now - retention.providerPayloadDays * 24 * 60 * 60 * 1000);

    const [transcripts, summaries, webhookPayloads] = await Promise.all([
      this.prisma.voiceConversation.updateMany({
        where: {
          organizationId,
          startedAt: { lt: transcriptCutoff },
          transcript: { not: null },
        },
        data: { transcript: null },
      }),
      this.prisma.voiceConversation.updateMany({
        where: {
          organizationId,
          startedAt: { lt: summaryCutoff },
          summary: { not: null },
        },
        data: { summary: null },
      }),
      this.prisma.voiceProviderWebhookEvent.updateMany({
        where: {
          organizationId,
          receivedAt: { lt: payloadCutoff },
          redactedPayload: { not: Prisma.DbNull },
        },
        data: { redactedPayload: Prisma.JsonNull },
      }),
    ]);

    return {
      transcriptsCleared: transcripts.count,
      summariesCleared: summaries.count,
      webhookPayloadsCleared: webhookPayloads.count,
    };
  }

  async purgeAllOrganizations(batchSize = 50): Promise<Array<{ organizationId: string; deleted: number }>> {
    const orgs = await this.prisma.organization.findMany({
      where: {
        voiceAssistant: { isNot: null },
      },
      select: { id: true },
      take: batchSize,
    });

    const results: Array<{ organizationId: string; deleted: number }> = [];
    for (const org of orgs) {
      const purged = await this.purgeOrganization(org.id);
      const deleted =
        purged.transcriptsCleared + purged.summariesCleared + purged.webhookPayloadsCleared;
      if (deleted > 0) {
        results.push({ organizationId: org.id, deleted });
        this.logger.log(
          `Voice retention purge org=${org.id} transcripts=${purged.transcriptsCleared} summaries=${purged.summariesCleared} payloads=${purged.webhookPayloadsCleared}`,
        );
      }
    }
    return results;
  }

  private async resolveRetentionDays(organizationId: string): Promise<{
    transcriptDays: number;
    summaryDays: number;
    providerPayloadDays: number;
  }> {
    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { activatedVersion: 'desc' },
      select: { configSnapshot: true },
    });

    const config = deployment?.configSnapshot as CanonicalAgentConfig | null;
    const privacy = config?.privacyRetention;

    return {
      transcriptDays: privacy?.retentionTranscriptDays ?? privacy?.retentionDays ?? DEFAULT_TRANSCRIPT_DAYS,
      summaryDays: privacy?.retentionSummaryDays ?? privacy?.retentionDays ?? DEFAULT_SUMMARY_DAYS,
      providerPayloadDays:
        privacy?.retentionProviderPayloadDays ?? DEFAULT_PROVIDER_PAYLOAD_DAYS,
    };
  }
}
