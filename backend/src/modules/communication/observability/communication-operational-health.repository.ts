import { Injectable } from '@nestjs/common';
import { CommunicationConversationStatus, CommunicationReplySendState } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE } from '../retention/communication-retention.constants';

const BOUNDED_COUNT_LIMIT = 1000;

export interface CommunicationUnknownSendSignals {
  count: number;
  oldestAgeSeconds: number | null;
}

export interface CommunicationHandoffSignals {
  humanRequiredCount: number;
  oldestAgeSeconds: number | null;
}

export interface CommunicationWebhookBacklogSignals {
  unprocessedCountBounded: number;
  oldestAgeSeconds: number | null;
}

export interface CommunicationRetentionSignals {
  enabled: boolean;
  dryRun: boolean;
  lastSuccessAt: string | null;
  lastRunStatus: string | null;
  lastRunErrorCode: string | null;
  lastRunAgeSeconds: number | null;
  lockContentionSkipsRecent: number;
}

@Injectable()
export class CommunicationOperationalHealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private orgScope(organizationId?: string) {
    return organizationId ? { organizationId } : {};
  }

  async getUnknownSendSignals(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationUnknownSendSignals> {
    const where = {
      sendState: CommunicationReplySendState.UNKNOWN,
      ...this.orgScope(organizationId),
    };
    const [rows, oldest] = await Promise.all([
      this.prisma.communicationReplyCommand.findMany({
        where,
        select: { id: true },
        take: BOUNDED_COUNT_LIMIT,
      }),
      this.prisma.communicationReplyCommand.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      count: rows.length,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000))
        : null,
    };
  }

  async getHandoffSignals(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationHandoffSignals> {
    const where = {
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      ...this.orgScope(organizationId),
    };
    const [rows, oldest] = await Promise.all([
      this.prisma.communicationConversation.findMany({
        where,
        select: { id: true },
        take: BOUNDED_COUNT_LIMIT,
      }),
      this.prisma.communicationConversation.findFirst({
        where,
        orderBy: { lastActivityAt: 'asc' },
        select: { lastActivityAt: true },
      }),
    ]);
    return {
      humanRequiredCount: rows.length,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.lastActivityAt.getTime()) / 1000))
        : null,
    };
  }

  async getWhatsAppWebhookBacklog(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationWebhookBacklogSignals> {
    const where = {
      processedAt: null,
      ...(organizationId ? { organizationId } : {}),
    };
    const [rows, oldest] = await Promise.all([
      this.prisma.whatsAppWebhookEvent.findMany({
        where,
        select: { id: true },
        take: BOUNDED_COUNT_LIMIT,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.whatsAppWebhookEvent.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      unprocessedCountBounded: rows.length,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000))
        : null,
    };
  }

  async getVoiceWebhookBacklog(now: Date): Promise<CommunicationWebhookBacklogSignals> {
    const pendingStatuses = ['RECEIVED', 'QUEUED'] as const;
    const where = { status: { in: [...pendingStatuses] } };
    const [rows, oldest] = await Promise.all([
      this.prisma.voiceProviderWebhookEvent.findMany({
        where,
        select: { id: true },
        take: BOUNDED_COUNT_LIMIT,
        orderBy: { receivedAt: 'asc' },
      }),
      this.prisma.voiceProviderWebhookEvent.findFirst({
        where,
        orderBy: { receivedAt: 'asc' },
        select: { receivedAt: true },
      }),
    ]);
    return {
      unprocessedCountBounded: rows.length,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.receivedAt.getTime()) / 1000))
        : null,
    };
  }

  async getRetentionSignals(
    retentionEnabled: boolean,
    retentionDryRun: boolean,
    now: Date,
    organizationId?: string,
  ): Promise<CommunicationRetentionSignals> {
    const latest = await this.prisma.communicationRetentionPurgeRun.findFirst({
      where: organizationId ? { organizationId } : {},
      orderBy: { startedAt: 'desc' },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        report: true,
      },
    });

    const lastSuccess = await this.prisma.communicationRetentionPurgeRun.findFirst({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: 'COMPLETED',
        dryRun: false,
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });

    const report =
      latest?.report && typeof latest.report === 'object' && !Array.isArray(latest.report)
        ? (latest.report as Record<string, unknown>)
        : null;

    const lastRunErrorCode =
      typeof report?.errorCode === 'string'
        ? report.errorCode
        : latest?.status === 'ABORTED'
          ? COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST
          : latest?.status === 'FAILED'
            ? COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.RUN_FAILED
            : null;

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lockContentionRows = await this.prisma.communicationRetentionPurgeRun.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        startedAt: { gte: since },
        status: 'SKIPPED',
      },
      select: { id: true },
      take: BOUNDED_COUNT_LIMIT,
    });

    return {
      enabled: retentionEnabled,
      dryRun: retentionDryRun,
      lastSuccessAt: lastSuccess?.completedAt?.toISOString() ?? null,
      lastRunStatus: latest?.status ?? null,
      lastRunErrorCode,
      lastRunAgeSeconds: latest
        ? Math.max(0, Math.floor((now.getTime() - latest.startedAt.getTime()) / 1000))
        : null,
      lockContentionSkipsRecent: lockContentionRows.length,
    };
  }
}
