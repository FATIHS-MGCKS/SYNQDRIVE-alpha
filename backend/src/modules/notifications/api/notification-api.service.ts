import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  MembershipRole,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationRepository } from '../notification.repository';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from '../registry/notification-event-registry.definitions';
import { deriveAvailableActions } from './notification-available-actions';
import { mapNotificationToDto } from './notification-api.mapper';
import type { NotificationCountsResponseDto, NotificationResponseDto } from './notification-api.mapper';
import {
  buildNotificationOrderBy,
  buildNotificationPaginatedResult,
  buildNotificationWhereInput,
  parseNotificationPagination,
  RESOLVED_RECENT_WINDOW_MS,
  type NotificationListFilters,
} from './notification-query.util';
import type { ListNotificationsQueryDto } from './dto/notification-api.dto';

export interface NotificationRequestUser {
  id?: string;
  membershipRole?: MembershipRole | string;
  platformRole?: string;
}

const STAFF_ROLES: MembershipRole[] = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
  MembershipRole.DRIVER,
];

@Injectable()
export class NotificationApiService {
  constructor(
    private readonly core: NotificationCoreService,
    private readonly repository: NotificationRepository,
    private readonly engineConfig: NotificationEngineConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertApiEnabled(): void {
    if (!this.engineConfig.isV2Enabled()) {
      throw new ServiceUnavailableException('Notification API V2 is not enabled');
    }
  }

  async list(
    orgId: string,
    user: NotificationRequestUser,
    query: ListNotificationsQueryDto,
  ) {
    this.assertApiEnabled();
    const ctx = await this.resolveAccessContext(orgId, user);
    const pagination = parseNotificationPagination(query);

    const listFilters: NotificationListFilters = {
      organizationId: orgId,
      userId: ctx.userId,
      status: query.status,
      severity: query.severity,
      domain: query.domain,
      entityType: query.entityType,
      entityId: query.entityId,
      vehicleId: query.vehicleId,
      stationId: query.stationId,
      bookingId: query.bookingId,
      unreadOnly: query.unreadOnly,
      activeOnly: query.activeOnly,
      resolvedOnly: query.resolvedOnly,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      scopedStationId: ctx.scopedStationId,
      scopedVehicleIds: ctx.scopedVehicleIds,
    };

    if (query.vehicleId) {
      await this.assertEntityInOrg(orgId, 'vehicle', query.vehicleId);
    }
    if (query.stationId) {
      await this.assertEntityInOrg(orgId, 'station', query.stationId);
    }
    if (query.bookingId) {
      await this.assertEntityInOrg(orgId, 'booking', query.bookingId);
    }
    if (query.entityId && query.entityType) {
      await this.assertEntityInOrg(orgId, query.entityType.toLowerCase(), query.entityId);
    }

    const where = this.applyRoleVisibility(
      buildNotificationWhereInput(listFilters),
      ctx.membershipRole,
    );

    const [rows, total] = await Promise.all([
      this.repository.listNotificationsWhere(where, {
        skip: pagination.skip,
        take: pagination.take,
        orderBy: buildNotificationOrderBy(query.sortBy, query.sortOrder),
      }),
      this.repository.countNotificationsWhere(where),
    ]);

    const receipts = await this.repository.findReceiptsForUser(
      rows.map((r) => r.id),
      ctx.userId,
    );
    const receiptByNotification = new Map(receipts.map((r) => [r.notificationId, r]));

    const data = rows.map((row) => {
      const receipt = receiptByNotification.get(row.id) ?? null;
      const isRead = receipt?.readAt != null;
      const actions = deriveAvailableActions({
        status: row.status,
        eventType: row.eventType,
        eventKind: row.eventKind,
        membershipRole: ctx.membershipRole,
        isRead,
        hasActionTarget: Object.keys((row.actionTarget as object) ?? {}).length > 0,
      });
      return mapNotificationToDto(row, receipt, actions);
    });

    return buildNotificationPaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async getById(orgId: string, user: NotificationRequestUser, id: string): Promise<NotificationResponseDto> {
    this.assertApiEnabled();
    const ctx = await this.resolveAccessContext(orgId, user);
    const row = await this.repository.findById(id, orgId);
    if (!row) throw new NotFoundException('Notification not found');

    this.assertNotificationVisible(row, ctx);
    await this.assertNotificationStationScope(orgId, row, ctx);

    const receipt = await this.repository.findReceipt(id, ctx.userId);
    const isRead = receipt?.readAt != null;
    const actions = deriveAvailableActions({
      status: row.status,
      eventType: row.eventType,
      eventKind: row.eventKind,
      membershipRole: ctx.membershipRole,
      isRead,
      hasActionTarget: Object.keys((row.actionTarget as object) ?? {}).length > 0,
    });

    return mapNotificationToDto(row, receipt, actions);
  }

  async getCounts(orgId: string, user: NotificationRequestUser): Promise<NotificationCountsResponseDto> {
    this.assertApiEnabled();
    const ctx = await this.resolveAccessContext(orgId, user);

    const activeWhere = this.applyRoleVisibility(
      buildNotificationWhereInput({
        organizationId: orgId,
        userId: ctx.userId,
        activeOnly: true,
        scopedStationId: ctx.scopedStationId,
        scopedVehicleIds: ctx.scopedVehicleIds,
      }),
      ctx.membershipRole,
    );

    const unreadWhere: Prisma.NotificationWhereInput = {
      ...activeWhere,
      NOT: {
        receipts: {
          some: {
            userId: ctx.userId,
            readAt: { not: null },
          },
        },
      },
    };

    const resolvedRecentWhere = this.applyRoleVisibility(
      buildNotificationWhereInput({
        organizationId: orgId,
        userId: ctx.userId,
        status: [NotificationStatus.RESOLVED],
        from: new Date(Date.now() - RESOLVED_RECENT_WINDOW_MS),
        scopedStationId: ctx.scopedStationId,
        scopedVehicleIds: ctx.scopedVehicleIds,
      }),
      ctx.membershipRole,
    );

    const [totalActive, unread, severityGroups, domainGroups, resolvedRecent] = await Promise.all([
      this.repository.countNotificationsWhere(activeWhere),
      this.repository.countNotificationsWhere(unreadWhere),
      this.repository.groupCountBySeverityWhere(activeWhere),
      this.repository.groupCountByDomainWhere(activeWhere),
      this.repository.countNotificationsWhere(resolvedRecentWhere),
    ]);

    const bySeverity: Record<string, number> = {};
    for (const g of severityGroups) {
      bySeverity[g.severity] = g._count._all;
    }

    const byDomain: Record<string, number> = {};
    for (const g of domainGroups) {
      byDomain[g.domain] = g._count._all;
    }

    return {
      totalActive,
      unread,
      critical: bySeverity.CRITICAL ?? 0,
      warning: bySeverity.WARNING ?? 0,
      info: bySeverity.INFO ?? 0,
      resolvedRecent,
      byDomain,
    };
  }

  async markRead(orgId: string, user: NotificationRequestUser, id: string) {
    return this.withNotificationAction(orgId, user, id, async () => {
      await this.core.markRead(id, orgId, user.id!);
      return this.getById(orgId, user, id);
    });
  }

  async markUnread(orgId: string, user: NotificationRequestUser, id: string) {
    return this.withNotificationAction(orgId, user, id, async () => {
      await this.core.markUnread(id, orgId, user.id!);
      return this.getById(orgId, user, id);
    });
  }

  async acknowledge(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('acknowledge')) {
        throw new BadRequestException('Acknowledge is not allowed for this notification');
      }
      await this.core.acknowledgeNotification(id, orgId);
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification acknowledged: ${id}`,
        route,
        metaJson: { notificationId: id, action: 'acknowledge' },
      });
      return this.getById(orgId, user, id);
    });
  }

  async snooze(
    orgId: string,
    user: NotificationRequestUser,
    id: string,
    untilIso: string,
    route?: string,
  ) {
    const until = new Date(untilIso);
    if (Number.isNaN(until.getTime())) {
      throw new BadRequestException('Invalid snooze date');
    }
    if (until.getTime() <= Date.now()) {
      throw new BadRequestException('Snooze date must be in the future');
    }

    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('snooze')) {
        throw new BadRequestException('Snooze is not allowed for this notification');
      }
      await this.core.snoozeNotification(id, orgId, until);
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification snoozed until ${until.toISOString()}`,
        route,
        metaJson: { notificationId: id, action: 'snooze', until: until.toISOString() },
      });
      return this.getById(orgId, user, id);
    });
  }

  async unsnooze(orgId: string, user: NotificationRequestUser, id: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('unsnooze')) {
        throw new BadRequestException('Unsnooze is not allowed for this notification');
      }
      await this.core.unsnoozeNotification(id, orgId);
      return this.getById(orgId, user, id);
    });
  }

  async resolve(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('resolve')) {
        throw new BadRequestException('Manual resolution is not allowed for this notification');
      }
      await this.core.resolveNotification(id, orgId, new Date(), { manual: true });
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification manually resolved: ${id}`,
        route,
        metaJson: { notificationId: id, action: 'resolve' },
      });
      return this.getById(orgId, user, id);
    });
  }

  async archive(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('archive')) {
        throw new BadRequestException('Archive is not allowed for this notification');
      }
      await this.core.archiveNotification(id, orgId);
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification archived: ${id}`,
        route,
        metaJson: { notificationId: id, action: 'archive' },
      });
      return this.getById(orgId, user, id);
    });
  }

  // ─── Private ─────────────────────────────────────────────────────

  private async withNotificationAction(
    orgId: string,
    user: NotificationRequestUser,
    id: string,
    fn: (current: NotificationResponseDto) => Promise<NotificationResponseDto>,
  ) {
    this.assertApiEnabled();
    const current = await this.getById(orgId, user, id);
    return fn(current);
  }

  private async resolveAccessContext(orgId: string, user: NotificationRequestUser) {
    if (!user.id) {
      throw new ForbiddenException('User context required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, stationScope: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    const membershipRole = membership.role;
    if (!STAFF_ROLES.includes(membershipRole)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    let scopedStationId: string | undefined;
    let scopedVehicleIds: string[] | undefined;

    const scope = membership.stationScope?.trim();
    if (
      scope
      && scope !== 'ALL'
      && (membershipRole === MembershipRole.SUB_ADMIN || membershipRole === MembershipRole.WORKER)
    ) {
      scopedStationId = scope;
      const vehicles = await this.prisma.vehicle.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { homeStationId: scope },
            { currentStationId: scope },
            { expectedStationId: scope },
          ],
        },
        select: { id: true },
      });
      scopedVehicleIds = vehicles.map((v) => v.id);
    }

    return {
      userId: user.id,
      membershipRole,
      scopedStationId,
      scopedVehicleIds,
    };
  }

  private applyRoleVisibility(
    where: Prisma.NotificationWhereInput,
    role: MembershipRole,
  ): Prisma.NotificationWhereInput {
    const allowedEventTypes = NOTIFICATION_EVENT_TYPE_DEFINITIONS
      .filter((d) => (d.supportedRoles as readonly MembershipRole[]).includes(role))
      .map((d) => d.eventType);

    if (!allowedEventTypes.length) {
      return { ...where, id: '__none__' };
    }

    const roleClause: Prisma.NotificationWhereInput = {
      eventType: { in: allowedEventTypes },
    };

    return {
      ...where,
      AND: [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), roleClause],
    };
  }

  private assertNotificationVisible(
    row: { eventType: string },
    ctx: { membershipRole: MembershipRole },
  ) {
    const def = getEventTypeDefinition(row.eventType);
    if (def && !(def.supportedRoles as readonly MembershipRole[]).includes(ctx.membershipRole)) {
      throw new NotFoundException('Notification not found');
    }
  }

  private async assertNotificationStationScope(
    orgId: string,
    row: {
      entityType: string;
      entityId: string;
      actionTarget: unknown;
    },
    ctx: { scopedStationId?: string; scopedVehicleIds?: string[] },
  ) {
    if (!ctx.scopedStationId) return;

    const target = (row.actionTarget ?? {}) as Record<string, string | undefined>;
    const stationId = row.entityType === 'STATION' ? row.entityId : target.stationId;
    const vehicleId = row.entityType === 'VEHICLE' ? row.entityId : target.vehicleId;

    if (stationId === ctx.scopedStationId) return;
    if (vehicleId && ctx.scopedVehicleIds?.includes(vehicleId)) return;

    throw new NotFoundException('Notification not found');
  }

  private async assertEntityInOrg(orgId: string, entityKind: string, entityId: string) {
    const kind = entityKind.toUpperCase();
    let found = false;

    if (kind === 'VEHICLE' || entityKind === 'vehicle') {
      found = !!(await this.prisma.vehicle.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
    } else if (kind === 'STATION' || entityKind === 'station') {
      found = !!(await this.prisma.station.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
    } else if (kind === 'BOOKING' || entityKind === 'booking') {
      found = !!(await this.prisma.booking.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
    } else if (kind === 'CUSTOMER') {
      found = !!(await this.prisma.customer.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
    } else if (kind === 'INVOICE') {
      found = !!(await this.prisma.orgInvoice.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
    } else if (kind === 'TRIP') {
      found = !!(await this.prisma.vehicleTrip.findFirst({
        where: { id: entityId, vehicle: { organizationId: orgId } },
        select: { id: true },
      }));
    }

    if (!found) {
      throw new NotFoundException('Entity not found');
    }
  }
}
