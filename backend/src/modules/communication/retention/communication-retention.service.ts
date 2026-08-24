import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  CommunicationAttachmentState,
  CommunicationChannel,
  CommunicationReplySendState,
  Prisma,
} from '@prisma/client';
import communicationRetentionConfig from '@config/communication-retention.config';
import voiceRetentionConfig from '@config/voice-retention.config';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { recordCommunicationRetentionRun } from '../observability/communication-prometheus.metrics';
import {
  COMMUNICATION_ACTIVE_CONVERSATION_STATUSES,
  COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY,
  COMMUNICATION_RETENTION_LEGACY_NATIVE_PAGE_MULTIPLIER,
  COMMUNICATION_RETENTION_PHASE,
  type CommunicationRetentionPhase,
  COMMUNICATION_RETENTION_PURGED_PREVIEW,
  COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE,
  COMMUNICATION_RETENTION_PURGE_RUN_STATUS,
  COMMUNICATION_RETENTION_RUN_SKIP_REASON,
  COMMUNICATION_RETENTION_SKIP_REASON,
  computeRetentionCutoffUtc,
  isRetentionPolicyEnabled,
} from './communication-retention.constants';
import type { DistributedLockHandle } from '@shared/redis/redis-distributed-lock.service';
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
  private globalLockHandle?: DistributedLockHandle;
  private globalLockHeartbeat: NodeJS.Timeout | null = null;
  private globalLockLost = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(communicationRetentionConfig.KEY)
    private readonly config: ConfigType<typeof communicationRetentionConfig>,
    @Inject(voiceRetentionConfig.KEY)
    private readonly voiceConfig: ConfigType<typeof voiceRetentionConfig>,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly lockService: RedisDistributedLockService,
    @Optional() private readonly voiceRetention?: VoiceRetentionService,
    @Optional() private readonly metrics?: CommunicationRetentionMetrics,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async runOnce(options: CommunicationRetentionRunOptions = {}): Promise<CommunicationRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? this.config.dryRun;
    const isGlobalRun = !options.organizationId;

    if (!this.config.enabled) {
      return this.skippedReport(trigger, dryRun, startedAtMs, COMMUNICATION_RETENTION_RUN_SKIP_REASON.DISABLED);
    }
    if (this.running) {
      this.logger.warn('Communication retention already running in this process — skipping overlapping run.');
      return this.skippedReport(trigger, dryRun, startedAtMs, COMMUNICATION_RETENTION_RUN_SKIP_REASON.IN_PROCESS_GUARD);
    }

    let lockHandle: Awaited<ReturnType<RedisDistributedLockService['acquire']>> | undefined;
    if (isGlobalRun) {
      lockHandle = await this.lockService.acquire(
        COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY,
        this.config.globalLockTtlMs,
      );
      if (!lockHandle.acquired) {
        this.logger.warn(
          `Communication retention global lock not acquired (${lockHandle.reason}) — skipping scheduled run.`,
        );
        return this.skippedReport(trigger, dryRun, startedAtMs, COMMUNICATION_RETENTION_RUN_SKIP_REASON.LOCK_CONTENTED);
      }
      this.startGlobalLockHeartbeat(lockHandle.handle);
    }

    this.running = true;
    let runId: string | undefined;
    this.globalLockLost = false;

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
      const batchSize = this.config.batchSize;
      let organizationsProcessed = 0;

      for (const organizationId of orgIds) {
        if (!(await this.assertGlobalLockHeld())) break;

        phases.push(await this.phaseVoiceDelegated(organizationId, dryRun, now));
        if (!(await this.assertGlobalLockHeld())) break;

        phases.push(await this.phaseMessageContent(organizationId, dryRun, now, batchSize));
        if (!(await this.assertGlobalLockHeld())) break;

        phases.push(await this.phaseLegacyNativeWhatsAppContent(organizationId, dryRun, now, batchSize));
        if (!(await this.assertGlobalLockHeld())) break;

        phases.push(await this.phaseAttachmentBinary(organizationId, dryRun, now, batchSize));
        if (!(await this.assertGlobalLockHeld())) break;

        phases.push(await this.phaseReplyCommandContent(organizationId, dryRun, now, batchSize));
        organizationsProcessed += 1;
        if (!(await this.assertGlobalLockHeld())) break;
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

      const completedAt = new Date();
      const report: CommunicationRetentionReport = {
        runId,
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAtMs,
        organizationsProcessed,
        phases,
        totals,
      };

      if (this.globalLockLost) {
        report.aborted = true;
        report.errorCode = COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST;
        await this.prisma.communicationRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.ABORTED,
            completedAt,
            report: report as unknown as Prisma.InputJsonValue,
          },
        });
        if (this.tripMetrics) {
          recordCommunicationRetentionRun(this.tripMetrics, {
            dryRun,
            status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.ABORTED,
            affected: totals.affected,
            failed: totals.failed,
          });
        }
        this.logger.warn(
          `Communication retention ${trigger} aborted after lock loss orgs=${organizationsProcessed} totals=${JSON.stringify(totals)}`,
        );
        return report;
      }

      await this.prisma.communicationRetentionPurgeRun.update({
        where: { id: runId },
        data: {
          status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.COMPLETED,
          completedAt,
          report: report as unknown as Prisma.InputJsonValue,
        },
      });

      this.metrics?.recordRun({
        durationMs: report.durationMs,
        affected: totals.affected,
        failed: totals.failed,
        completedAt,
      });
      if (this.tripMetrics) {
        recordCommunicationRetentionRun(this.tripMetrics, {
          dryRun,
          status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.COMPLETED,
          affected: totals.affected,
          failed: totals.failed,
        });
      }

      this.logger.log(
        `Communication retention ${trigger} dryRun=${dryRun} orgs=${organizationsProcessed} totals=${JSON.stringify(totals)}`,
      );
      return report;
    } catch (err) {
      this.logger.error(`Communication retention run failed: ${(err as Error).message}`);
      if (runId) {
        await this.prisma.communicationRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.FAILED,
            completedAt: new Date(),
            report: {
              errorCode: COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.RUN_FAILED,
            } as Prisma.InputJsonValue,
          },
        });
      }
      throw err;
    } finally {
      this.running = false;
      this.stopGlobalLockHeartbeat();
      if (lockHandle?.acquired) {
        await this.lockService.release(lockHandle.handle);
      }
    }
  }

  private startGlobalLockHeartbeat(handle: DistributedLockHandle): void {
    this.stopGlobalLockHeartbeat();
    this.globalLockHandle = handle;
    this.globalLockHeartbeat = setInterval(() => {
      void this.renewGlobalLockHeartbeat();
    }, this.config.globalLockHeartbeatMs);
    this.globalLockHeartbeat.unref?.();
  }

  private stopGlobalLockHeartbeat(): void {
    if (this.globalLockHeartbeat) {
      clearInterval(this.globalLockHeartbeat);
      this.globalLockHeartbeat = null;
    }
    this.globalLockHandle = undefined;
  }

  private async renewGlobalLockHeartbeat(): Promise<void> {
    if (!this.globalLockHandle || this.globalLockLost) return;
    const extended = await this.lockService.extend(this.globalLockHandle, this.config.globalLockTtlMs);
    if (!extended) {
      this.globalLockLost = true;
      this.logger.warn('Communication retention global lock lost during heartbeat — aborting run.');
      this.stopGlobalLockHeartbeat();
    }
  }

  /** Renew lease before each org/phase boundary; abort if ownership is lost. */
  private async assertGlobalLockHeld(): Promise<boolean> {
    if (!this.globalLockHandle) return true;
    if (this.globalLockLost) return false;
    const extended = await this.lockService.extend(this.globalLockHandle, this.config.globalLockTtlMs);
    if (!extended) {
      this.globalLockLost = true;
      this.logger.warn('Communication retention global lock lost — aborting before next phase.');
      this.stopGlobalLockHeartbeat();
      return false;
    }
    return true;
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
    const policyEnabled = Boolean(this.voiceConfig.retention.enabled && this.voiceRetention);
    const result = this.emptyPhase(COMMUNICATION_RETENTION_PHASE.VOICE_DELEGATED, policyEnabled);

    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const eligible = await this.voiceRetention!.countEligibleForPurge(organizationId, now.getTime());
    result.candidates = eligible.transcripts + eligible.summaries + eligible.webhookPayloads;

    if (dryRun) {
      result.skipped = result.candidates;
      if (result.candidates > 0) {
        result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = result.candidates;
      }
      return result;
    }

    const purged = await this.voiceRetention!.purgeOrganization(organizationId);
    result.affected = purged.transcriptsCleared + purged.summariesCleared + purged.webhookPayloadsCleared;
    return result;
  }

  private async phaseMessageContent(
    organizationId: string,
    dryRun: boolean,
    now: Date,
    batchSize: number,
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
        channel: true,
        nativeMessageId: true,
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
        await this.prisma.$transaction((tx) =>
          this.purgeCorrelatedMessageContent(tx, {
            organizationId,
            contentId: row.id,
            conversationId: row.conversationId,
            channel: row.channel,
            nativeMessageId: row.nativeMessageId,
            purgeAt,
          }),
        );
        result.affected += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }

  private async phaseLegacyNativeWhatsAppContent(
    organizationId: string,
    dryRun: boolean,
    now: Date,
    batchSize: number,
  ): Promise<CommunicationRetentionPhaseResult> {
    const policyEnabled = isRetentionPolicyEnabled(this.config.days.messageContent);
    const result = this.emptyPhase(
      COMMUNICATION_RETENTION_PHASE.LEGACY_NATIVE_WHATSAPP_CONTENT,
      policyEnabled,
    );
    if (!policyEnabled) {
      result.skipped += 1;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.POLICY_DISABLED] = 1;
      return result;
    }

    const cutoff = computeRetentionCutoffUtc(now, this.config.days.messageContent)!;
    const pageSize = Math.max(
      batchSize * COMMUNICATION_RETENTION_LEGACY_NATIVE_PAGE_MULTIPLIER,
      batchSize,
    );
    const eligible: { id: string; createdAt: Date }[] = [];
    let scanCursor: { createdAt: Date; id: string } | undefined;

    while (eligible.length < batchSize) {
      const candidates = await this.prisma.whatsAppMessage.findMany({
        where: {
          organizationId,
          createdAt: { lt: cutoff },
          contentPurgedAt: null,
          NOT: { content: '' },
          ...(scanCursor
            ? {
                OR: [
                  { createdAt: { gt: scanCursor.createdAt } },
                  { createdAt: scanCursor.createdAt, id: { gt: scanCursor.id } },
                ],
              }
            : {}),
        },
        select: { id: true, conversationId: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize,
      });

      if (candidates.length === 0) break;

      const candidateIds = candidates.map((row) => row.id);
      const projectedRows =
        candidateIds.length > 0
          ? await this.prisma.communicationMessageContent.findMany({
              where: {
                organizationId,
                channel: CommunicationChannel.WHATSAPP,
                nativeMessageId: { in: candidateIds },
              },
              select: { nativeMessageId: true },
            })
          : [];
      const projectedNativeIds = new Set(projectedRows.map((row) => row.nativeMessageId));

      const legacyInPage = candidates.filter((row) => !projectedNativeIds.has(row.id));
      const conversationIds = [...new Set(legacyInPage.map((row) => row.conversationId))];
      const activeNativeConversationIds = new Set<string>();
      if (conversationIds.length > 0) {
        const activeRows = await this.prisma.communicationConversation.findMany({
          where: {
            organizationId,
            channel: CommunicationChannel.WHATSAPP,
            status: { in: COMMUNICATION_ACTIVE_CONVERSATION_STATUSES },
            nativeConversationId: { in: conversationIds },
          },
          select: { nativeConversationId: true },
        });
        for (const row of activeRows) {
          activeNativeConversationIds.add(row.nativeConversationId);
        }
      }

      for (const row of legacyInPage) {
        if (activeNativeConversationIds.has(row.conversationId)) continue;
        eligible.push({ id: row.id, createdAt: row.createdAt });
        if (eligible.length >= batchSize) break;
      }

      const lastCandidate = candidates[candidates.length - 1];
      scanCursor = { createdAt: lastCandidate.createdAt, id: lastCandidate.id };
      if (candidates.length < pageSize) break;
    }

    result.candidates = eligible.length;
    if (eligible.length === 0) return result;

    result.oldestEligibleAgeDays = Math.floor(
      (now.getTime() - eligible[0].createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (dryRun) {
      result.skipped = eligible.length;
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN] = eligible.length;
      return result;
    }

    const updated = await this.prisma.whatsAppMessage.updateMany({
      where: { id: { in: eligible.map((row) => row.id) }, organizationId },
      data: { content: '', contentPurgedAt: now },
    });
    result.affected = updated.count;
    return result;
  }

  private async purgeCorrelatedMessageContent(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      contentId: string;
      conversationId: string;
      channel: CommunicationChannel;
      nativeMessageId: string;
      purgeAt: Date;
    },
  ): Promise<void> {
    await tx.communicationMessageContent.update({
      where: { id: input.contentId },
      data: { text: null, contentPurgedAt: input.purgeAt },
    });

    if (input.channel === CommunicationChannel.WHATSAPP) {
      await tx.whatsAppMessage.updateMany({
        where: {
          id: input.nativeMessageId,
          organizationId: input.organizationId,
          contentPurgedAt: null,
        },
        data: { content: '', contentPurgedAt: input.purgeAt },
      });
    }

    const conversation = await tx.communicationConversation.findFirst({
      where: { id: input.conversationId, organizationId: input.organizationId },
      select: { lastContentId: true },
    });
    if (conversation?.lastContentId === input.contentId) {
      await tx.communicationConversation.update({
        where: { id: input.conversationId },
        data: { lastMessagePreview: COMMUNICATION_RETENTION_PURGED_PREVIEW },
      });
    }
  }

  private async phaseAttachmentBinary(
    organizationId: string,
    dryRun: boolean,
    now: Date,
    batchSize: number,
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
      take: batchSize,
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
    batchSize: number,
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
      take: batchSize,
    });

    const [unknownCount, pendingCount] = await Promise.all([
      this.prisma.communicationReplyCommand.count({
        where: {
          organizationId,
          createdAt: { lt: cutoff },
          sendState: CommunicationReplySendState.UNKNOWN,
        },
      }),
      this.prisma.communicationReplyCommand.count({
        where: {
          organizationId,
          createdAt: { lt: cutoff },
          sendState: CommunicationReplySendState.PENDING,
        },
      }),
    ]);

    result.candidates = rows.length;
    result.skipped += unknownCount + pendingCount;
    if (unknownCount > 0) {
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.UNKNOWN_SEND_STATE] = unknownCount;
    }
    if (pendingCount > 0) {
      result.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.PENDING_SEND_STATE] = pendingCount;
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

  private skippedReport(
    trigger: string,
    dryRun: boolean,
    startedAtMs: number,
    skipReason: string,
  ): CommunicationRetentionReport {
    return {
      trigger,
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      organizationsProcessed: 0,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0, failed: 0 },
      skipped: true,
      skipReason,
    };
  }
}
