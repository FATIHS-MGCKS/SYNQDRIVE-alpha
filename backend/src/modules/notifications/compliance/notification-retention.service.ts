import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NotificationStatus, Prisma } from '@prisma/client';
import notificationRetentionConfig from '@config/notification-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  NOTIFICATION_RETENTION_CLASS,
  NOTIFICATION_RETENTION_PURGE_RUN_STATUS,
  NOTIFICATION_RETENTION_SKIP_REASON,
  computeDeletionEligibleAt,
  resolveNotificationRetentionClass,
} from './notification-retention.constants';
import {
  anonymizeTemplateParams,
  minimizeOccurrencePayload,
  sanitizeDeliveryErrorMessage,
} from './notification-data-minimization';
import type {
  NotificationErasureReport,
  NotificationRetentionPhaseResult,
  NotificationRetentionReport,
  NotificationRetentionRunOptions,
} from './notification-retention.types';
import { NotificationAuditService } from '../audit/notification-audit.service';

@Injectable()
export class NotificationRetentionService {
  private readonly logger = new Logger(NotificationRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(notificationRetentionConfig.KEY)
    private readonly config: ConfigType<typeof notificationRetentionConfig>,
    @Optional() private readonly notificationAudit?: NotificationAuditService,
  ) {}

  async runOnce(options: NotificationRetentionRunOptions = {}): Promise<NotificationRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const dryRun = options.dryRun ?? this.config.dryRun;

    if (!this.config.enabled) {
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('Notification retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }

    this.running = true;
    let runId: string | undefined;

    try {
      const run = await this.prisma.notificationRetentionPurgeRun.create({
        data: {
          organizationId: options.organizationId ?? null,
          trigger,
          dryRun,
          status: NOTIFICATION_RETENTION_PURGE_RUN_STATUS.RUNNING,
          correlationId: options.correlationId ?? null,
          report: {},
        },
      });
      runId = run.id;

      const phases: NotificationRetentionPhaseResult[] = [];
      phases.push(await this.phasePurgeResolvedNotifications(dryRun, options.organizationId));
      phases.push(await this.phasePurgeDeliveryOutbox(dryRun, options.organizationId));
      phases.push(await this.phaseRedactTerminalOutboxErrors(dryRun, options.organizationId));
      phases.push(await this.phasePurgeAuditEvents(dryRun, options.organizationId));

      const totals = phases.reduce(
        (acc, phase) => ({
          candidates: acc.candidates + phase.candidates,
          affected: acc.affected + phase.affected,
          skipped: acc.skipped + phase.skipped,
          failed: acc.failed + phase.failed,
        }),
        { candidates: 0, affected: 0, skipped: 0, failed: 0 },
      );

      const report: NotificationRetentionReport = {
        runId,
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };

      await this.prisma.notificationRetentionPurgeRun.update({
        where: { id: runId },
        data: {
          status: NOTIFICATION_RETENTION_PURGE_RUN_STATUS.COMPLETED,
          completedAt: new Date(),
          report: report as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `Notification retention ${trigger} dryRun=${dryRun} totals=${JSON.stringify(totals)}`,
      );
      return report;
    } catch (err) {
      if (runId) {
        await this.prisma.notificationRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: NOTIFICATION_RETENTION_PURGE_RUN_STATUS.FAILED,
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

  applyRetentionMetadataOnResolve(input: {
    domain: Parameters<typeof resolveNotificationRetentionClass>[0]['domain'];
    eventType: string;
    status: string;
    resolvedAt: Date;
  }) {
    const retentionClass = resolveNotificationRetentionClass(input);
    const days =
      retentionClass === NOTIFICATION_RETENTION_CLASS.SECURITY_GOVERNANCE
        ? this.config.days.securityGovernance
        : this.config.days.resolvedOperational;
    const eligible = computeDeletionEligibleAt(retentionClass, input.resolvedAt);
    if (days > 0 && eligible) {
      const adjusted = new Date(input.resolvedAt);
      adjusted.setUTCDate(adjusted.getUTCDate() + days);
      return { retentionClass, deletionEligibleAt: adjusted };
    }
    return { retentionClass, deletionEligibleAt: eligible };
  }

  async eraseSubjectData(input: {
    organizationId: string;
    customerId?: string;
    userId?: string;
    dryRun?: boolean;
  }): Promise<NotificationErasureReport> {
    const dryRun = input.dryRun ?? false;
    const report: NotificationErasureReport = {
      organizationId: input.organizationId,
      dryRun,
      anonymizedNotifications: 0,
      deletedNotifications: 0,
      redactedOutboxRows: 0,
      skippedLegalHold: 0,
    };

    const where: Prisma.NotificationWhereInput = {
      organizationId: input.organizationId,
      legalHold: false,
    };

    if (input.customerId) {
      where.OR = [
        { templateParams: { path: ['customerId'], equals: input.customerId } },
        { actionTarget: { path: ['customerId'], equals: input.customerId } },
      ];
    }

    const rows = await this.prisma.notification.findMany({
      where,
      select: {
        id: true,
        templateParams: true,
        actionTarget: true,
        legalHold: true,
      },
      take: this.config.batchSize,
    });

    for (const row of rows) {
      if (row.legalHold) {
        report.skippedLegalHold += 1;
        continue;
      }
      report.anonymizedNotifications += 1;
      if (!dryRun) {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: {
            templateParams: anonymizeTemplateParams(
              row.templateParams as Record<string, string | number | boolean | null>,
            ) as Prisma.InputJsonValue,
            actionTarget: { redacted: true } as Prisma.InputJsonValue,
            anonymizedAt: new Date(),
          },
        });
        await this.prisma.notificationOccurrence.updateMany({
          where: { notificationId: row.id },
          data: { payload: { redacted: true } as Prisma.InputJsonValue },
        });
      }
    }

    if (input.userId && !dryRun) {
      await this.prisma.notificationReceipt.deleteMany({
        where: { organizationId: input.organizationId, userId: input.userId },
      });
    }

    return report;
  }

  private async phasePurgeResolvedNotifications(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<NotificationRetentionPhaseResult> {
    const phase = 'purge_resolved_notifications';
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      status: { in: [NotificationStatus.RESOLVED, NotificationStatus.ARCHIVED] },
      legalHold: false,
      deletionEligibleAt: { lte: now },
      ...(organizationId ? { organizationId } : {}),
    };

    const candidates = await this.prisma.notification.count({ where });
    if (dryRun || candidates === 0) {
      return { phase, candidates, affected: dryRun ? 0 : 0, skipped: dryRun ? candidates : 0, failed: 0 };
    }

    const deleted = await this.prisma.notification.deleteMany({ where });
    return { phase, candidates, affected: deleted.count, skipped: 0, failed: 0 };
  }

  private async phasePurgeDeliveryOutbox(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<NotificationRetentionPhaseResult> {
    const phase = 'purge_delivery_outbox';
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - this.config.days.deliveryTechnical);

    const where: Prisma.NotificationDeliveryOutboxWhereInput = {
      status: { in: ['COMPLETED', 'SUPPRESSED', 'DEAD_LETTER'] },
      processedAt: { lte: cutoff },
      ...(organizationId ? { organizationId } : {}),
    };

    const candidates = await this.prisma.notificationDeliveryOutbox.count({ where });
    if (dryRun || candidates === 0) {
      return { phase, candidates, affected: 0, skipped: dryRun ? candidates : 0, failed: 0 };
    }

    const deleted = await this.prisma.notificationDeliveryOutbox.deleteMany({ where });
    return { phase, candidates, affected: deleted.count, skipped: 0, failed: 0 };
  }

  private async phaseRedactTerminalOutboxErrors(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<NotificationRetentionPhaseResult> {
    const phase = 'redact_outbox_errors';
    const rows = await this.prisma.notificationDeliveryOutbox.findMany({
      where: {
        lastError: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, lastError: true },
      take: this.config.batchSize,
    });

    let affected = 0;
    for (const row of rows) {
      const sanitized = sanitizeDeliveryErrorMessage(row.lastError);
      if (sanitized === row.lastError) continue;
      affected += 1;
      if (!dryRun) {
        await this.prisma.notificationDeliveryOutbox.update({
          where: { id: row.id },
          data: { lastError: sanitized },
        });
      }
    }

    return {
      phase,
      candidates: rows.length,
      affected,
      skipped: dryRun ? affected : 0,
      failed: 0,
    };
  }

  private async phasePurgeAuditEvents(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<NotificationRetentionPhaseResult> {
    const phase = 'purge_notification_audit_events';
    if (!this.notificationAudit) {
      return { phase, candidates: 0, affected: 0, skipped: 0, failed: 0 };
    }
    const result = await this.notificationAudit.purgeExpiredEvents({
      organizationId,
      dryRun,
    });
    return {
      phase,
      candidates: result.deleted,
      affected: dryRun ? 0 : result.deleted,
      skipped: result.skippedLegalHold,
      failed: 0,
    };
  }

  private emptyReport(
    trigger: string,
    dryRun: boolean,
    startedAtMs: number,
  ): NotificationRetentionReport {
    return {
      trigger,
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0, failed: 0 },
    };
  }
}
