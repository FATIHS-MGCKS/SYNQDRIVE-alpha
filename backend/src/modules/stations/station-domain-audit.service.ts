import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { StationDomainAuditActionCode } from '@shared/stations/station-domain-audit.constants';
import { StationDomainAuditAction } from '@shared/stations/station-domain-audit.constants';
import {
  buildStationDomainAuditDescription,
  buildStationDomainChangeSummary,
  buildStationDomainCorrelationId,
  resolveStationUpdateAuditActions,
  type StationUpdateAuditHintCommand,
} from '@shared/stations/station-domain-audit.util';

export interface StationDomainAuditRecordInput {
  organizationId: string;
  stationId: string;
  auditAction: StationDomainAuditActionCode;
  actorUserId?: string | null;
  vehicleId?: string | null;
  bookingId?: string | null;
  transferId?: string | null;
  reason?: string | null;
  from?: unknown;
  to?: unknown;
  correlationId?: string;
  command?: string | null;
  performedAt?: string | null;
  meta?: Record<string, unknown>;
  route?: string;
  level?: 'INFO' | 'WARN' | 'CRITICAL';
}

@Injectable()
export class StationDomainAuditService {
  private readonly logger = new Logger(StationDomainAuditService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async record(input: StationDomainAuditRecordInput): Promise<void> {
    const correlationId =
      input.correlationId ??
      buildStationDomainCorrelationId({
        auditAction: input.auditAction,
        organizationId: input.organizationId,
        stationId: input.stationId,
        vehicleId: input.vehicleId,
        bookingId: input.bookingId,
        transferId: input.transferId,
        command: input.command,
        performedAt: input.performedAt,
      });

    try {
      const existing = await this.prisma.activityLog.findFirst({
        where: {
          organizationId: input.organizationId,
          entity: ActivityEntity.STATION,
          entityId: input.stationId,
          metaJson: {
            path: ['correlationId'],
            equals: correlationId,
          },
        },
        select: { id: true },
      });
      if (existing) return;

      await this.audit.record({
        actorUserId: input.actorUserId ?? undefined,
        actorOrganizationId: input.organizationId,
        action: this.resolveActivityAction(input.auditAction),
        entity: ActivityEntity.STATION,
        entityId: input.stationId,
        description: buildStationDomainAuditDescription(input.auditAction),
        changeSummary: buildStationDomainChangeSummary(input.from, input.to),
        route: input.route,
        level: input.level ?? this.defaultLevel(input.auditAction),
        metaJson: {
          auditAction: input.auditAction,
          correlationId,
          stationId: input.stationId,
          vehicleId: input.vehicleId ?? null,
          bookingId: input.bookingId ?? null,
          transferId: input.transferId ?? null,
          reason: input.reason ?? null,
          command: input.command ?? null,
          performedAt: input.performedAt ?? new Date().toISOString(),
          from: input.from ?? null,
          to: input.to ?? null,
          ...(input.meta ?? {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist station domain audit (${input.auditAction}) for station ${input.stationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async recordForStations(
    stationIds: Array<string | null | undefined>,
    input: Omit<StationDomainAuditRecordInput, 'stationId'>,
  ): Promise<void> {
    const uniqueStationIds = [
      ...new Set(stationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    ];
    await Promise.all(
      uniqueStationIds.map((stationId) =>
        this.record({
          ...input,
          stationId,
          correlationId: input.correlationId
            ? `${input.correlationId}:${stationId}`
            : undefined,
        }),
      ),
    );
  }

  async recordStationCreated(input: {
    organizationId: string;
    stationId: string;
    actorUserId?: string | null;
    stationName: string;
    performedAt?: string;
  }): Promise<void> {
    await this.record({
      organizationId: input.organizationId,
      stationId: input.stationId,
      auditAction: StationDomainAuditAction.STATION_CREATED,
      actorUserId: input.actorUserId,
      from: null,
      to: input.stationName,
      performedAt: input.performedAt,
    });
  }

  async recordStationUpdated(input: {
    organizationId: string;
    stationId: string;
    actorUserId?: string | null;
    auditHints: Array<{ command: StationUpdateAuditHintCommand }>;
    performedAt?: string;
  }): Promise<void> {
    const actions = resolveStationUpdateAuditActions(input.auditHints);
    await Promise.all(
      actions.map((auditAction) =>
        this.record({
          organizationId: input.organizationId,
          stationId: input.stationId,
          auditAction,
          actorUserId: input.actorUserId,
          performedAt: input.performedAt,
          meta: {
            changedFields: input.auditHints.map((hint) => hint.command),
          },
        }),
      ),
    );
  }

  private resolveActivityAction(auditAction: StationDomainAuditActionCode): ActivityAction {
    if (auditAction === StationDomainAuditAction.STATION_CREATED) {
      return ActivityAction.CREATE;
    }
    if (
      auditAction === StationDomainAuditAction.ARCHIVED ||
      auditAction === StationDomainAuditAction.TRANSFER_CANCELLED
    ) {
      return ActivityAction.DELETE;
    }
    if (auditAction === StationDomainAuditAction.BOOKING_RULE_OVERRIDDEN) {
      return ActivityAction.ADMIN_OVERRIDE;
    }
    return ActivityAction.UPDATE;
  }

  private defaultLevel(
    auditAction: StationDomainAuditActionCode,
  ): 'INFO' | 'WARN' | 'CRITICAL' {
    if (auditAction === StationDomainAuditAction.BOOKING_RULE_OVERRIDDEN) {
      return 'WARN';
    }
    if (
      auditAction === StationDomainAuditAction.ARCHIVED ||
      auditAction === StationDomainAuditAction.DEACTIVATED
    ) {
      return 'WARN';
    }
    return 'INFO';
  }
}
