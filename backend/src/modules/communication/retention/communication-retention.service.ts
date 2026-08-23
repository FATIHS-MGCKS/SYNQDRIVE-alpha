import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  CommunicationAttachmentState,
  CommunicationReplySendState,
  Prisma,
} from '@prisma/client';
import communicationRetentionConfig from '@config/communication-retention.config';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  COMMUNICATION_ACTIVE_CONVERSATION_STATUSES,
  COMMUNICATION_REPLY_COMMAND_PROTECTED_STATES,
  COMMUNICATION_RETENTION_PHASE,
  type CommunicationRetentionPhase,
  COMMUNICATION_RETENTION_PURGED_PREVIEW,
  COMMUNICATION_RETENTION_PURGE_RUN_STATUS,
  COMMUNICATION_RETENTION_SKIP_REASON,
  computeRetentionCutoffUtc,
  isRetentionPolicyEnabled,
} from './communication-retention.constants';
import { CommunicationRetentionMetrics } from './communication-retention.metrics';
import type {
  CommunicationRetentionPhaseResult,
  CommunicationRetentionReport,
  CommunicationRetentionRunOptions,
} from './communication-retention.types';

@Injectable()
export class CommunicationRetentionService {
  private readonly logger = new Logger(CommunicationRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(communicationRetentionConfig.KEY)
    private readonly config: ConfigType<typeof communicationRetentionConfig>,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
    @Optional() private readonly voiceRetention?: VoiceRetentionService,
    @Optional() private readonly metrics?: CommunicationRetentionMetrics,
  ) {}

  async runOnce(options: CommunicationRetentionRunOptions = {}): Promise<CommunicationRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? this.config.dryRun;

    if (!this.config.enabled) {
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('Communication retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }

    this.running = true;
    let runId: string | undefined;

    try {
      const run = await this.prisma.communicationRetentionPurgeRun.create({
        data: {
          organizationId: options.organizationId ?? null,
          trigger,
          dryRun,
          status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.RUNNING,
          correlationId: options.correlationId ?? null,
          report: {},
        },
      });
      runId = run.id;

      const orgIds = await this.resolveOrganizationIds(options.organizationId);
      const phases: CommunicationRetentionPhaseResult[] = [];

      for (const organizationId of orgIds) {
        phases.push(await this.phaseVoiceDelegated(organizationId, dryRun, now));
        phases.push(
          await this.phaseMessageContent(organizationId, dryRun, now, options.organizationId ? undefined : this.config.batchSize),
        );
        phases.push(await this.phaseNativeWhatsAppContent(organizationId, dryRun, now));
        phases.push(await this.phaseAttachmentBinary(organizationId, dryRun, now));
        phases.push(await this.phaseReplyCommandContent(organizationId, dryRun, now));
      }

      const totals = phases.reduce(
        (acc, phase) => ({
          candidates: acc.candidates + phase.candidates,
          affected: acc.affected + phase.affected,
          skipped: acc.skipped + phase.skipped,
          failed: acc.failed + phase.failed,
        }),
        { candidates: 0, affected: 0, skipped: 0, failed: 0 },
      );

      const report: CommunicationRetentionReport = {
        runId,
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        organizationsProcessed: orgIds.length,
        phases,
        totals,
      };

      await this.prisma.communicationRetentionPurgeRun.update({
        where: { id: runId },
        data: {
          status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.COMPLETED,
          completedAt: new Date(),
          report: report as unknown as Prisma.InputJsonValue,
        },
      });

      this.metrics?.recordRun({
        durationMs: report.durationMs,
        affected: totals.affected,
        failed: totals.failed,
        completedAt: new Date(report.completedAt),
      });

      this.logger.log(
        `Communication retention ${trigger} dryRun=${dryRun} orgs=${orgIds.length} totals=${JSON.stringify(totals)}`,
      );
      return report;
    } catch (err) {
      if (runId) {
        await this.prisma.communicationRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.FAILED,
            completedAt: new Date(),
            report: { error: (err as Error).message } as Prisma.InputJsonValue,
          },
        });
      }
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async resolveOrganizationIds(organizationId?: string): Promise<string[]> {
    if (organizationId) return [organizationId];
    const rows = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  private async phaseVoiceDelegated(
    organizationId: string,
    dryRun: boolean,
    now: Date,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled =
      isRetentionPolicyEnabled(this.config.days.voiceTranscript)
      || isRetentionPolicyEnabled(this.config.days.voiceSummary)
      || isRetentionPolicyEnabled(this.config.days.voiceProviderPayload);

    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.VOICE_DELEGATED, policyEnabled);

    if (!policyEnabled || !this.voiceRetention) {
      if (!policyEnabled) {
        result.skipped += 1;
        result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      }
      return result;
    }

    if (dryRun) {
      const transcriptCutoff = computeRetentionCutoffUtc(now, this.config.days.voiceTranscript);
      const summaryCutoff = computeRetentionCutoffUtc(now, this.config.days.voiceSummary);
      const payloadCutoff = computeRetentionCutoffUtc(now, this.config.days.voiceProviderPayload);
      const [transcripts, summaries, payloads] = await Promise.all([
        transcriptCutoff
          ? this.prisma.voiceConversation.count({
              where: {
                organizationId,
                startedAt: { lt: transcriptCutoff },
                transcript: { not: null },
              },
            })
          : Promise.resolve(0),
        summaryCutoff
          ? this.prisma.voiceConversation.count({
              where: {
                organizationId,
                startedAt: { lt: summaryCutoff },
                summary: { not: null },
              },
            })
          : Promise.resolve(0),
        payloadCutoff
          ? this.prisma.voiceProviderWebhookEvent.count({
              where: {
                organizationId,
                receivedAt: { lt: payloadCutoff },
                redactedPayload: { not: Prisma.DbNull },
              },
            })
          : Promise.resolve(0),
      ]);
      result.candidates = transcripts + summaries + payloads;
      result.skipped = result.candidates;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = result.candidates;
      return result;
    }

    const purged = await this.voiceRetention.purgeOrganization(organizationId);
    result.candidates = purged.transcriptsCleared + purged.summariesCleared + purged.webhookPayloadsCleared;
    result.affected = result.candidates;
    return result;
  }

  private async phaseMessageContent(
    organizationId: string,
    dryRun: boolean,
    now: Date,
    batchSize = this.config.batchSize,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled = isRetentionPolicyEnabled(this.config.days.messageContent);
    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.MESSAGE_CONTENT, policyEnabled);
    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const cutoff = computeRetentionCutoffUtc(now, this.config.days.messageContent)!;
    const rows = await this.prisma.communicationMessageContent.findMany({
      where: {
        organizationId,
        occurredAt: { lt: cutoff },
        contentPurgedAt: null,
        text: { not: null },
        conversation: {
          organizationId,
          status: { notIn: COMMUNICATION_ACTIVE_CONVERSATION_STATUSES },
        },
      },
      select: {
        id: true,
        conversationId: true,
        nativeMessageId: true,
        text: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'asc' },
      take: batchSize,
    });

    result.candidates = rows.length;
    if (rows.length === 0) return result;

    result.oldestEligibleAgeDays = Math.floor(
      (now.getTime() - rows[0].occurredAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (dryRun) {
      result.skipped = rows.length;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = rows.length;
      return result;
    }

    const purgeAt = now;
    for (const row of rows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.communicationMessageContent.update({
            where: { id: row.id },
            data: { text: null, contentPurgedAt: purgeAt },
          });

          const conversation = await tx.communicationConversation.findFirst({
            where: { id: row.conversationId, organizationId },
            select: { lastContentId: true, lastMessagePreview: true },
          });
          if (conversation?.lastContentId === row.id) {
            await tx.communicationConversation.update({
              where: { id: row.conversationId },
              data: { lastMessagePreview: COMMUNICATION_RETENTION_PURGED_PREVIEW },
            });
          }
        });
        result.affected += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }

  private async phaseNativeWhatsAppContent(
    organizationId: string,
    dryRun: boolean,
    now: Date,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled = isRetentionPolicyEnabled(this.config.days.nativeWhatsAppContent);
    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.NATIVE_WHATSAPP_CONTENT, policyEnabled);
    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const cutoff = computeRetentionCutoffUtc(now, this.config.days.nativeWhatsAppContent)!;
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: {
        organizationId,
        createdAt: { lt: cutoff },
        contentPurgedAt: null,
        NOT: { content: '' },
        conversation: {
          organizationId,
        },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: this.config.batchSize,
    });

    result.candidates = rows.length;
    if (rows.length === 0) return result;

    if (dryRun) {
      result.skipped = rows.length;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = rows.length;
      return result;
    }

    const updated = await this.prisma.whatsAppMessage.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, organizationId },
      data: { content: '', contentPurgedAt: now },
    });
    result.affected = updated.count;
    return result;
  }

  private async phaseAttachmentBinary(
    organizationId: string,
    dryRun: boolean,
    now: Date,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled = isRetentionPolicyEnabled(this.config.days.attachment);
    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.ATTACHMENT_BINARY, policyEnabled);
    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const cutoff = computeRetentionCutoffUtc(now, this.config.days.attachment)!;
    const rows = await this.prisma.communicationAttachment.findMany({
      where: {
        organizationId,
        state: CommunicationAttachmentState.READY,
        createdAt: { lt: cutoff },
        purgedAt: null,
        conversation: {
          organizationId,
          status: { notIn: COMMUNICATION_ACTIVE_CONVERSATION_STATUSES },
        },
      },
      select: { id: true, objectKey: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: this.config.batchSize,
    });

    result.candidates = rows.length;
    if (rows.length === 0) return result;

    if (dryRun) {
      result.skipped = rows.length;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = rows.length;
      return result;
    }

    for (const row of rows) {
      try {
        await this.storage.deleteObject(row.objectKey);
        await this.prisma.communicationAttachment.update({
          where: { id: row.id },
          data: {
            state: CommunicationAttachmentState.PURGED,
            purgedAt: now,
          },
        });
        result.affected += 1;
      } catch {
        result.failed += 1;
        result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.STORAGE_DELETE_FAILED] =
          (result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.STORAGE_DELETE_FAILED] ?? 0) + 1;
      }
    }

    return result;
  }

  private async phaseReplyCommandContent(
    organizationId: string,
    dryRun: boolean,
    now: Date,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled = isRetentionPolicyEnabled(this.config.days.replyCommandSettled);
    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.REPLY_COMMAND_CONTENT, policyEnabled);
    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const cutoff = computeRetentionCutoffUtc(now, this.config.days.replyCommandSettled)!;
    const rows = await this.prisma.communicationReplyCommand.findMany({
      where: {
        organizationId,
        createdAt: { lt: cutoff },
        contentPurgedAt: null,
        sendState: {
          in: [CommunicationReplySendState.ACCEPTED, CommunicationReplySendState.FAILED],
        },
        OR: [{ text: { not: '' } }, { templateVariables: { not: Prisma.DbNull } }],
      },
      select: { id: true, sendState: true },
      orderBy: { createdAt: 'asc' },
      take: this.config.batchSize,
    });

    const protectedRows = await this.prisma.communicationReplyCommand.count({
      where: {
        organizationId,
        createdAt: { lt: cutoff },
        sendState: { in: COMMUNICATION_REPLY_COMMAND_PROTECTED_STATES },
      },
    });

    result.candidates = rows.length;
    result.skipped += protectedRows;
    if (protectedRows > 0) {
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.UNKNOWN_SEND_STATE] = protectedRows;
    }

    if (rows.length === 0) return result;

    if (dryRun) {
      result.skipped += rows.length;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = rows.length;
      return result;
    }

    const updated = await this.prisma.communicationReplyCommand.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, organizationId },
      data: {
        text: '',
        templateVariables: Prisma.JsonNull,
        contentPurgedAt: now,
      },
    });
    result.affected = updated.count;
    return result;
  }

  private emptyPhase(
    phase: CommunicationRetentionPhase,
    policyEnabled: boolean,
  ): CommunicationRetentionPhaseResult {
    return {
      phase,
      policyEnabled,
      candidates: 0,
      affected: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
    };
  }

  private emptyReport(trigger: string, dryRun: boolean, startedAtMs: number): CommunicationRetentionReport {
    return {
      trigger,
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      organizationsProcessed: 0,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0, failed: 0 },
    };
  }
}
