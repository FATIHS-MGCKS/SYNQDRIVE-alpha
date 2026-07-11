import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationRepository } from '../notification.repository';
import { fingerprintFromCandidate } from '../notification-candidate.validator';
import {
  resolveInsightFingerprint,
} from './notification-migration-insight.util';
import type {
  NotificationMigrationBackfillResult,
  NotificationMigrationCheckpoint,
  NotificationMigrationMode,
  NotificationMigrationFailure,
  NotificationMigrationSkipReason,
  NotificationMigrationStats,
} from './notification-migration.types';

export interface BackfillOptions {
  organizationId: string;
  mode: NotificationMigrationMode;
  batchSize?: number;
  checkpoint?: NotificationMigrationCheckpoint | null;
  includeInactive?: boolean;
}

@Injectable()
export class NotificationMigrationBackfillService {
  private readonly logger = new Logger(NotificationMigrationBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: NotificationRepository,
  ) {}

  async run(options: BackfillOptions): Promise<NotificationMigrationBackfillResult> {
    const batchSize = options.batchSize ?? 100;
    const stats: NotificationMigrationStats = {
      analyzed: 0,
      migrated: 0,
      merged: 0,
      skipped: 0,
      unresolved: 0,
      failed: 0,
    };
    const failures: NotificationMigrationFailure[] = [];
    const skipReasons: NotificationMigrationSkipReason[] = [];

    let cursorUpdatedAt: Date | null = options.checkpoint?.lastInsightUpdatedAt
      ? new Date(options.checkpoint.lastInsightUpdatedAt)
      : null;
    let cursorId: string | null = options.checkpoint?.lastInsightId ?? null;
    let processedInRun = options.checkpoint?.processedCount ?? 0;

    while (true) {
      const batch = await this.prisma.dashboardInsight.findMany({
        where: {
          organizationId: options.organizationId,
          ...(options.includeInactive ? {} : { isActive: true }),
          ...(cursorUpdatedAt && cursorId
            ? {
                OR: [
                  { updatedAt: { gt: cursorUpdatedAt } },
                  { updatedAt: cursorUpdatedAt, id: { gt: cursorId } },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: batchSize,
      });

      if (batch.length === 0) break;

      for (const row of batch) {
        stats.analyzed += 1;
        processedInRun += 1;

        try {
          const outcome = await this.processInsight(row, options.mode, skipReasons);
          stats[outcome] += 1;
        } catch (err) {
          stats.failed += 1;
          failures.push({
            insightId: row.id,
            error: (err as Error).message ?? String(err),
          });
        }

        cursorUpdatedAt = row.updatedAt;
        cursorId = row.id;
      }

      if (batch.length < batchSize) break;
    }

    const checkpoint: NotificationMigrationCheckpoint = {
      organizationId: options.organizationId,
      lastInsightId: cursorId ?? null,
      lastInsightUpdatedAt: cursorUpdatedAt?.toISOString() ?? null,
      processedCount: processedInRun,
      updatedAt: new Date().toISOString(),
    };

    this.logger.log({
      msg: 'notification.migration.backfill_completed',
      mode: options.mode,
      organizationId: options.organizationId,
      stats,
      failures: failures.length,
    });

    return {
      mode: options.mode,
      organizationId: options.organizationId,
      stats,
      checkpoint,
      failures,
      skipReasons,
    };
  }

  private async processInsight(
    row: Prisma.DashboardInsightGetPayload<object>,
    mode: NotificationMigrationMode,
    skipReasons: NotificationMigrationSkipReason[],
  ): Promise<keyof Pick<NotificationMigrationStats, 'migrated' | 'merged' | 'skipped' | 'unresolved'>> {
    const existingByLegacy = await this.prisma.notification.findFirst({
      where: { legacyInsightId: row.id },
    });
    if (existingByLegacy) {
      skipReasons.push({ insightId: row.id, reason: 'ALREADY_MIGRATED' });
      return 'skipped';
    }

    const resolved = resolveInsightFingerprint(row.organizationId, row);
    if (!resolved?.candidate) {
      skipReasons.push({
        insightId: row.id,
        reason: 'NOT_MIGRATABLE',
        detail: row.type,
      });
      return 'unresolved';
    }

    const { canonical: fingerprint } = fingerprintFromCandidate(resolved.candidate);
    const active = await this.repository.findAnyActiveByFingerprint(
      row.organizationId,
      fingerprint,
    );

    if (active) {
      if (mode === 'dry_run') return 'merged';
      await this.repository.runTransaction(async (tx) => {
        await this.repository.createOccurrence(
          {
            notificationId: active.id,
            organizationId: row.organizationId,
            occurredAt: row.updatedAt,
            sourceType: resolved.candidate!.sourceType,
            sourceRef: row.id,
            severityAtOccurrence: resolved.candidate!.severity as NotificationSeverity,
            payload: { backfill: true, legacyInsightId: row.id } as Prisma.InputJsonValue,
          },
          tx,
        );
        await this.repository.updateNotification(
          active.id,
          {
            lastSeenAt: row.updatedAt > active.lastSeenAt ? row.updatedAt : active.lastSeenAt,
            firstSeenAt: row.createdAt < active.firstSeenAt ? row.createdAt : active.firstSeenAt,
            occurrenceCount: active.occurrenceCount + 1,
            legacyInsightId: active.legacyInsightId ?? row.id,
          },
          active.version,
          tx,
        );
      });
      return 'merged';
    }

    if (!row.isActive) {
      skipReasons.push({ insightId: row.id, reason: 'INACTIVE_RESOLVED' });
      return 'skipped';
    }

    if (mode === 'dry_run') return 'migrated';

    const candidate = resolved.candidate;
    await this.repository.runTransaction(async (tx) => {
      const notification = await this.repository.createNotification(
        {
          organizationId: row.organizationId,
          fingerprint,
          lifecycleGeneration: 1,
          eventType: candidate.eventType,
          eventKind: candidate.eventKind,
          conditionCode: candidate.conditionCode,
          domain: candidate.domain,
          severity: candidate.severity as NotificationSeverity,
          status: NotificationStatus.OPEN,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          titleKey: candidate.titleKey,
          bodyKey: candidate.bodyKey,
          templateParams: candidate.templateParams as Prisma.InputJsonValue,
          actionType: candidate.actionType,
          actionTarget: candidate.actionTarget as unknown as Prisma.InputJsonValue,
          sourceType: candidate.sourceType,
          primarySourceRef: row.id,
          legacyInsightId: row.id,
          firstSeenAt: row.createdAt,
          lastSeenAt: row.updatedAt,
          expiresAt: candidate.expiresAt ?? row.expiresAt,
        },
        tx,
      );

      await this.repository.createOccurrence(
        {
          notificationId: notification.id,
          organizationId: row.organizationId,
          occurredAt: row.updatedAt,
          sourceType: candidate.sourceType,
          sourceRef: row.id,
          severityAtOccurrence: candidate.severity as NotificationSeverity,
          payload: { backfill: true, dedupeKey: row.dedupeKey } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    return 'migrated';
  }
}
