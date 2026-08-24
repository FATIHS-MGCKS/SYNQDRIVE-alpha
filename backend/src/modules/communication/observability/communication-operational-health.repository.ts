import { Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE } from '../retention/communication-retention.constants';
import {
  COMMUNICATION_HEALTH_CHANNEL,
  COMMUNICATION_UNKNOWN_SEND_CHANNELS,
  type CommunicationHealthChannel,
} from './communication-operational-health.constants';

export const COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT = 1000;

export interface CommunicationUnknownSendSignals {
  count: number;
  countAtLeastLimit: boolean;
  oldestAgeSeconds: number | null;
}

export interface CommunicationUnknownSendByChannelSignals {
  aggregate: CommunicationUnknownSendSignals;
  byChannel: Record<CommunicationHealthChannel, CommunicationUnknownSendSignals>;
}

export interface CommunicationHandoffSignals {
  humanRequiredCount: number;
  countAtLeastLimit: boolean;
  oldestAgeSeconds: number | null;
}

export interface CommunicationWebhookBacklogSignals {
  unprocessedCountBounded: number;
  countAtLeastLimit: boolean;
  oldestAgeSeconds: number | null;
  tenantMeasurable: boolean;
}

export interface CommunicationRetentionSignals {
  enabled: boolean;
  dryRun: boolean;
  lastSuccessAt: string | null;
  lastRunStatus: string | null;
  lastRunErrorCode: string | null;
  lastRunAgeSeconds: number | null;
  lockContentionSkipsRecent: number;
  tenantEvidenceAvailable: boolean;
  globalEvidenceOnly: boolean;
}

@Injectable()
export class CommunicationOperationalHealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private orgScope(organizationId?: string) {
    return organizationId ? { organizationId } : {};
  }

  async organizationExists(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    return org != null;
  }

  private async countUnknownSendForChannel(
    channel: CommunicationChannel,
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationUnknownSendSignals> {
    const where = {
      sendState: CommunicationReplySendState.UNKNOWN,
      channel,
      ...this.orgScope(organizationId),
    };
    const [rows, oldest] = await Promise.all([
      this.prisma.communicationReplyCommand.findMany({
        where,
        select: { id: true },
        take: COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
      }),
      this.prisma.communicationReplyCommand.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      count: rows.length,
      countAtLeastLimit: rows.length >= COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000))
        : null,
    };
  }

  async getUnknownSendSignalsByChannel(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationUnknownSendByChannelSignals> {
    const channelEntries = await Promise.all(
      COMMUNICATION_UNKNOWN_SEND_CHANNELS.map(async (channel) => [
        channel,
        await this.countUnknownSendForChannel(channel as CommunicationChannel, organizationId, now),
      ] as const),
    );

    const byChannel = Object.fromEntries(channelEntries) as Record<
      CommunicationHealthChannel,
      CommunicationUnknownSendSignals
    >;

    const aggregateCount = channelEntries.reduce((sum, [, signals]) => sum + signals.count, 0);
    const aggregateAtLeastLimit = channelEntries.some(([, signals]) => signals.countAtLeastLimit);
    const oldestCandidates = channelEntries
      .map(([, signals]) => signals.oldestAgeSeconds)
      .filter((value): value is number => value != null);
    const aggregateOldest =
      oldestCandidates.length > 0 ? Math.max(...oldestCandidates) : null;

    return {
      aggregate: {
        count: aggregateCount,
        countAtLeastLimit: aggregateAtLeastLimit,
        oldestAgeSeconds: aggregateOldest,
      },
      byChannel,
    };
  }

  /** @deprecated Use getUnknownSendSignalsByChannel for channel-correct attribution. */
  async getUnknownSendSignals(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationUnknownSendSignals> {
    const signals = await this.getUnknownSendSignalsByChannel(organizationId, now);
    return signals.aggregate;
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
        take: COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
      }),
      this.prisma.communicationConversation.findFirst({
        where,
        orderBy: { lastActivityAt: 'asc' },
        select: { lastActivityAt: true },
      }),
    ]);
    return {
      humanRequiredCount: rows.length,
      countAtLeastLimit: rows.length >= COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
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
        take: COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
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
      countAtLeastLimit: rows.length >= COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000))
        : null,
      tenantMeasurable: true,
    };
  }

  async getVoiceWebhookBacklog(
    organizationId: string | undefined,
    now: Date,
  ): Promise<CommunicationWebhookBacklogSignals> {
    const pendingStatuses = ['RECEIVED', 'QUEUED'] as const;
    const where = organizationId
      ? { status: { in: [...pendingStatuses] }, organizationId }
      : { status: { in: [...pendingStatuses] } };

    const [rows, oldest] = await Promise.all([
      this.prisma.voiceProviderWebhookEvent.findMany({
        where,
        select: { id: true },
        take: COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
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
      countAtLeastLimit: rows.length >= COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
      oldestAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.receivedAt.getTime()) / 1000))
        : null,
      // Tenant scope uses persisted VoiceProviderWebhookEvent.organizationId (nullable).
      // Events without organizationId are excluded from tenant queries, never attributed cross-tenant.
      tenantMeasurable: true,
    };
  }

  async getRetentionSignals(
    retentionEnabled: boolean,
    retentionDryRun: boolean,
    now: Date,
    organizationId?: string,
  ): Promise<CommunicationRetentionSignals> {
    const tenantScope = organizationId ? { organizationId } : {};
    const latest = await this.prisma.communicationRetentionPurgeRun.findFirst({
      where: tenantScope,
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
        ...tenantScope,
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
        ...tenantScope,
        startedAt: { gte: since },
        status: 'SKIPPED',
      },
      select: { id: true },
      take: COMMUNICATION_HEALTH_BOUNDED_COUNT_LIMIT,
    });

    let tenantEvidenceAvailable = true;
    let globalEvidenceOnly = false;
    if (organizationId) {
      const tenantRun = await this.prisma.communicationRetentionPurgeRun.findFirst({
        where: { organizationId },
        select: { id: true },
      });
      if (!tenantRun) {
        const globalRun = await this.prisma.communicationRetentionPurgeRun.findFirst({
          where: { organizationId: null },
          select: { id: true },
        });
        tenantEvidenceAvailable = false;
        globalEvidenceOnly = globalRun != null;
      }
    }

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
      tenantEvidenceAvailable,
      globalEvidenceOnly,
    };
  }
}
