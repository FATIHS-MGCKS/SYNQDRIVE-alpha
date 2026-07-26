import {
  BadRequestException,
  ConflictException,
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
import { isPrismaOptimisticLockFailure } from '../notification-prisma.util';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationRepository } from '../notification.repository';
import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from '../registry/notification-event-registry.definitions';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import type { NotificationAccessContext } from '../access/notification-access.types';
import { NotificationPreferenceService } from '../access/notification-preference.service';
import {
  buildPreferenceWhereClause,
  buildUserSnoozeExclusionClause,
} from '../access/notification-preference.query';
import { buildUserHiddenExclusionClause } from '../access/notification-receipt.policy';
import { NotificationReceiptService } from '../access/notification-receipt.service';
import { NotificationStationScopeService } from '../access/notification-station-scope.service';
import { deriveAvailableActions } from './notification-available-actions';
import { mapNotificationToDto } from './notification-api.mapper';
import {
  enrichActiveDtcTemplateParams,
  enrichTemplateParamsFromLegacyInsights,
  mergeEnrichedTemplateParams,
  resolveEntityLabelContexts,
} from './notification-entity-label.enricher';
import type { NotificationCountsResponseDto, NotificationResponseDto } from './notification-api.mapper';
import {
  buildNotificationOrderBy,
  buildNotificationPaginatedResult,
  buildNotificationWhereInput,
  parseNotificationPagination,
  RESOLVED_RECENT_WINDOW_MS,
  type NotificationListFilters,
} from './notification-query.util';
import {
  buildNotificationListCursorWhere,
  decodeNotificationListCursor,
  encodeNotificationListCursorFromRow,
  resolveNotificationListLimit,
  type NotificationListPageResult,
} from './notification-list-cursor.util';
import type { ListNotificationsQueryDto, NotificationCountsQueryDto } from './dto/notification-api.dto';

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
  private readonly preferenceService = new NotificationPreferenceService();

  constructor(
    private readonly core: NotificationCoreService,
    private readonly repository: NotificationRepository,
    private readonly engineConfig: NotificationEngineConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly receiptService: NotificationReceiptService,
    private readonly stationScopeService: NotificationStationScopeService,
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
    const referenceNow = new Date();
    const sortBy = query.sortBy ?? 'lastSeenAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const limit = resolveNotificationListLimit(query.limit);

    await this.validateEntityFilters(orgId, query);

    const listFilters = this.buildListFiltersFromQuery(orgId, ctx, query, referenceNow);
    let where = this.buildAccessWhere(listFilters, ctx, referenceNow, !listFilters.resolvedOnly);

    if (query.cursor) {
      const cursorPayload = decodeNotificationListCursor(query.cursor);
      if (cursorPayload.sortBy !== sortBy || cursorPayload.sortOrder !== sortOrder) {
        throw new BadRequestException('Cursor sort parameters do not match request');
      }
      where = {
        AND: [where, buildNotificationListCursorWhere(cursorPayload)],
      };
    }

    const orderBy = buildNotificationOrderBy(sortBy, sortOrder);

    if (query.page != null && !query.cursor) {
      const pagination = parseNotificationPagination(query);
      const [rows, total] = await Promise.all([
        this.repository.listNotificationsWhere(where, {
          skip: pagination.skip,
          take: pagination.take,
          orderBy,
        }),
        this.repository.countNotificationsWhere(where),
      ]);
      return buildNotificationPaginatedResult(
        await this.mapRows(rows, ctx, referenceNow),
        total,
        pagination.page,
        pagination.limit,
      );
    }

    const rows = await this.repository.listNotificationsWhere(where, {
      take: limit + 1,
      orderBy,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const mapped = await this.mapRows(pageRows, ctx, referenceNow);

    const nextCursor =
      hasMore && pageRows.length > 0
        ? encodeNotificationListCursorFromRow(pageRows[pageRows.length - 1], sortBy, sortOrder)
        : null;
    const result: NotificationListPageResult<NotificationResponseDto> = {
      data: mapped,
      meta: { limit, nextCursor },
    };
    return result;
  }

  async getById(orgId: string, user: NotificationRequestUser, id: string): Promise<NotificationResponseDto> {
    this.assertApiEnabled();
    const ctx = await this.resolveAccessContext(orgId, user);
    const row = await this.repository.findById(id, orgId);
    if (!row) throw new NotFoundException('Notification not found');

    await this.assertRowAccessible(row, ctx);

    const [dto] = await this.mapRows([row], ctx);
    return dto;
  }

  async getCounts(
    orgId: string,
    user: NotificationRequestUser,
    query: NotificationCountsQueryDto = {},
  ): Promise<NotificationCountsResponseDto> {
    this.assertApiEnabled();
    const ctx = await this.resolveAccessContext(orgId, user);
    const referenceNow = new Date();

    await this.validateEntityFilters(orgId, query);

    const hasExplicitScope =
      !!query.status?.length
      || query.activeOnly
      || query.resolvedOnly
      || query.domain
      || !!query.severity?.length
      || query.entityType
      || query.entityId
      || query.vehicleId
      || query.bookingId
      || query.stationId
      || query.readState
      || query.unreadOnly
      || query.from
      || query.to
      || query.search;

    const countsQuery: NotificationCountsQueryDto = {
      ...query,
      activeOnly: query.activeOnly ?? (hasExplicitScope ? undefined : true),
    };

    const listFilters = this.buildListFiltersFromQuery(orgId, ctx, countsQuery, referenceNow);
    const baseWhere = this.buildAccessWhere(
      listFilters,
      ctx,
      referenceNow,
      !listFilters.resolvedOnly,
    );

    const hiddenClause = buildUserHiddenExclusionClause(ctx.userId);
    const activeWhere =
      countsQuery.activeOnly && !listFilters.resolvedOnly
        ? { AND: [baseWhere, hiddenClause] }
        : baseWhere;

    const unreadWhere: Prisma.NotificationWhereInput = {
      AND: [
        baseWhere,
        {
          NOT: {
            receipts: {
              some: {
                userId: ctx.userId,
                readAt: { not: null },
              },
            },
          },
        },
        ...(countsQuery.activeOnly && !listFilters.resolvedOnly ? [hiddenClause] : []),
      ],
    };

    const resolvedRecentWhere = this.buildAccessWhere(
      {
        ...listFilters,
        status: [NotificationStatus.RESOLVED],
        resolvedOnly: true,
        activeOnly: false,
        from: query.from
          ? new Date(query.from)
          : listFilters.resolvedOnly
            ? listFilters.from
            : new Date(referenceNow.getTime() - RESOLVED_RECENT_WINDOW_MS),
      },
      ctx,
      referenceNow,
      false,
    );

    const [totalActive, unread, severityGroups, domainGroups, resolvedRecent] = await Promise.all([
      this.repository.countNotificationsWhere(activeWhere),
      this.repository.countNotificationsWhere(unreadWhere),
      this.repository.groupCountBySeverityWhere(activeWhere),
      this.repository.groupCountByDomainWhere(activeWhere),
      listFilters.resolvedOnly || query.resolvedOnly
        ? this.repository.countNotificationsWhere(baseWhere)
        : this.repository.countNotificationsWhere(resolvedRecentWhere),
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

  async markRead(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async () => {
      await this.receiptService.markRead(id, orgId, user.id!);
      void this.auditNotificationAction(user, orgId, id, 'read', route);
      return this.getById(orgId, user, id);
    }, { skipActionCheck: true });
  }

  async markUnread(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async () => {
      await this.receiptService.markUnread(id, orgId, user.id!);
      void this.auditNotificationAction(user, orgId, id, 'unread', route);
      return this.getById(orgId, user, id);
    }, { skipActionCheck: true });
  }

  async acknowledge(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('acknowledge')) {
        throw new BadRequestException('Acknowledge is not allowed for this notification');
      }
      await this.receiptService.acknowledgePersonal(id, orgId, user.id!);
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification personally acknowledged: ${id}`,
        route,
        metaJson: { notificationId: id, action: 'acknowledge_personal' },
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
      await this.receiptService.snoozePersonal(id, orgId, user.id!, until);
      void this.audit.record({
        actorUserId: user.id,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ORGANIZATION,
        entityId: orgId,
        description: `Notification personally snoozed until ${until.toISOString()}`,
        route,
        metaJson: { notificationId: id, action: 'snooze_personal', until: until.toISOString() },
      });
      return this.getById(orgId, user, id);
    });
  }

  async unsnooze(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('unsnooze')) {
        throw new BadRequestException('Unsnooze is not allowed for this notification');
      }
      await this.receiptService.unsnoozePersonal(id, orgId, user.id!);
      void this.auditNotificationAction(user, orgId, id, 'unsnooze', route);
      return this.getById(orgId, user, id);
    });
  }

  async resolve(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('resolve')) {
        throw new BadRequestException('Manual resolution is not allowed for this notification');
      }
      try {
        await this.core.resolveNotification(id, orgId, new Date(), { manual: true });
      } catch (err: unknown) {
        if (isPrismaOptimisticLockFailure(err)) {
          throw new ConflictException('Notification was updated concurrently; refresh and retry');
        }
        throw err;
      }
      void this.auditNotificationAction(user, orgId, id, 'resolve', route);
      return this.getById(orgId, user, id);
    });
  }

  async archive(orgId: string, user: NotificationRequestUser, id: string, route?: string) {
    return this.withNotificationAction(orgId, user, id, async (dto) => {
      if (!dto.availableActions.includes('archive')) {
        throw new BadRequestException('Archive is not allowed for this notification');
      }
      try {
        await this.core.archiveNotification(id, orgId);
      } catch (err: unknown) {
        if (isPrismaOptimisticLockFailure(err)) {
          throw new ConflictException('Notification was updated concurrently; refresh and retry');
        }
        throw err;
      }
      void this.auditNotificationAction(user, orgId, id, 'archive', route);
      return this.getById(orgId, user, id);
    });
  }

  // ─── Private ─────────────────────────────────────────────────────

  private async withNotificationAction(
    orgId: string,
    user: NotificationRequestUser,
    id: string,
    fn: (current: NotificationResponseDto) => Promise<NotificationResponseDto>,
    options: { skipActionCheck?: boolean } = {},
  ) {
    this.assertApiEnabled();
    const current = await this.getById(orgId, user, id);
    if (!options.skipActionCheck) {
      // availableActions validated inside fn for mutating lifecycle actions
    }
    return fn(current);
  }

  private buildListFiltersFromQuery(
    orgId: string,
    ctx: NotificationAccessContext,
    query: ListNotificationsQueryDto,
    referenceNow: Date,
  ): NotificationListFilters {
    const resolvedOnly = !!query.resolvedOnly;
    return {
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
      readState: query.readState,
      activeOnly: query.activeOnly,
      resolvedOnly,
      from: query.from
        ? new Date(query.from)
        : resolvedOnly
          ? new Date(referenceNow.getTime() - RESOLVED_RECENT_WINDOW_MS)
          : undefined,
      to: query.to ? new Date(query.to) : undefined,
      timeField: query.timeField,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      scopedStationId: ctx.scopedStationId,
      scopedStationIds: ctx.scopedStationIds,
      scopedVehicleIds: ctx.scopedVehicleIds,
      scopedBookingIds: ctx.scopedBookingIds,
    };
  }

  private auditNotificationAction(
    user: NotificationRequestUser,
    orgId: string,
    notificationId: string,
    action: string,
    route?: string,
  ): void {
    void this.audit.record({
      actorUserId: user.id,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: orgId,
      description: `Notification ${action}: ${notificationId}`,
      route,
      metaJson: { notificationId, action },
    });
  }

  private async resolveAccessContext(
    orgId: string,
    user: NotificationRequestUser,
  ): Promise<NotificationAccessContext> {
    if (!user.id) {
      throw new ForbiddenException('User context required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, stationScope: true },
    });

    if (!membership) {
      const inactive = await this.prisma.organizationMembership.findFirst({
        where: { userId: user.id, organizationId: orgId },
        select: { status: true },
      });
      if (inactive) {
        throw new ForbiddenException('User membership is not active');
      }
      throw new ForbiddenException('You do not have access to this organization');
    }

    const membershipRole = membership.role;
    if (!STAFF_ROLES.includes(membershipRole) && user.platformRole !== 'MASTER_ADMIN') {
      throw new ForbiddenException('Insufficient role permissions');
    }

    const scopeFields = user.platformRole === 'MASTER_ADMIN'
      ? { scopedVehicleIds: [], scopedBookingIds: [], bypassStationScope: true }
      : await this.stationScopeService.buildScopeContext(
          orgId,
          membershipRole,
          membership.stationScope,
          user.id,
        );

    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: { userId: user.id, organizationId: orgId },
    });

    return {
      userId: user.id,
      organizationId: orgId,
      membershipRole,
      platformRole: user.platformRole,
      stationScope: membership.stationScope,
      preferences,
      ...scopeFields,
    };
  }

  private buildAccessWhere(
    filters: NotificationListFilters,
    ctx: NotificationAccessContext,
    referenceNow: Date,
    excludeUserPersonalOverlays: boolean,
  ): Prisma.NotificationWhereInput {
    const clauses: Prisma.NotificationWhereInput[] = [
      buildNotificationWhereInput(filters, referenceNow),
    ];

    const roleFiltered = this.applyRoleVisibility(
      clauses[0],
      ctx.membershipRole,
      ctx.platformRole,
    );
    clauses[0] = roleFiltered;

    const prefClause = buildPreferenceWhereClause(ctx.preferences);
    if (prefClause) {
      clauses.push(prefClause);
    }

    if (excludeUserPersonalOverlays) {
      clauses.push(
        buildUserSnoozeExclusionClause(ctx.userId, referenceNow),
        buildUserHiddenExclusionClause(ctx.userId),
      );
    }

    return clauses.length === 1 ? clauses[0] : { AND: clauses };
  }

  private applyRoleVisibility(
    where: Prisma.NotificationWhereInput,
    role: MembershipRole,
    platformRole?: string,
  ): Prisma.NotificationWhereInput {
    if (platformRole === 'MASTER_ADMIN') {
      return where;
    }

    const allowedEventTypes = NOTIFICATION_EVENT_TYPE_DEFINITIONS
      .filter((d) => (d.supportedRoles as readonly MembershipRole[]).includes(role))
      .map((d) => d.eventType);

    if (!allowedEventTypes.length) {
      return { ...where, id: '__none__' };
    }

    return {
      ...where,
      AND: [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { eventType: { in: allowedEventTypes } },
      ],
    };
  }

  private async assertRowAccessible(
    row: {
      id: string;
      eventType: string;
      domain: string;
      severity: import('@prisma/client').NotificationSeverity;
      entityType: string;
      entityId: string;
      actionTarget: unknown;
      status: string;
    },
    ctx: NotificationAccessContext,
  ) {
    const def = getEventTypeDefinition(row.eventType);
    if (
      ctx.platformRole !== 'MASTER_ADMIN'
      && def
      && !(def.supportedRoles as readonly MembershipRole[]).includes(ctx.membershipRole)
    ) {
      throw new NotFoundException('Notification not found');
    }

    if (!this.stationScopeService.isNotificationInScope(row, ctx)) {
      if (row.entityType === 'VEHICLE' && !ctx.bypassStationScope) {
        const vehicleId = row.entityId;
        const stationIds = ctx.scopedStationIds?.length
          ? ctx.scopedStationIds
          : ctx.scopedStationId
            ? [ctx.scopedStationId]
            : [];
        let stillInScope = ctx.scopedVehicleIds.includes(vehicleId);
        if (!stillInScope && stationIds.length > 0) {
          for (const stationId of stationIds) {
            stillInScope = await this.stationScopeService.recheckVehicleStationScope(
              ctx.organizationId,
              vehicleId,
              stationId,
            );
            if (stillInScope) break;
          }
        }
        if (!stillInScope) {
          throw new NotFoundException('Notification not found');
        }
      } else {
        throw new NotFoundException('Notification not found');
      }
    }

    const delivery = this.preferenceService.evaluateInAppDelivery(
      row.eventType,
      row.severity,
      ctx.preferences,
    );
    if (delivery.suppressedByPreference) {
      throw new NotFoundException('Notification not found');
    }
  }

  private async mapRows(
    rows: Array<{
      id: string;
      eventType: string;
      eventKind: import('@prisma/client').NotificationEventKind;
      domain: import('@prisma/client').NotificationDomain;
      severity: import('@prisma/client').NotificationSeverity;
      status: NotificationStatus;
      entityType: string;
      entityId: string;
      actionTarget: unknown;
      templateParams: unknown;
      titleKey: string;
      bodyKey: string;
      actionType: import('@prisma/client').NotificationActionType;
      sourceType: import('@prisma/client').NotificationSourceType;
      primarySourceRef: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
      occurrenceCount: number;
      resolvedAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
    ctx: NotificationAccessContext,
    referenceNow = new Date(),
  ): Promise<NotificationResponseDto[]> {
    const receipts = await this.repository.findReceiptsForUser(
      rows.map((r) => r.id),
      ctx.userId,
    );
    const receiptByNotification = new Map(receipts.map((r) => [r.notificationId, r]));

    const labelContexts = await resolveEntityLabelContexts(this.prisma, ctx.organizationId, rows);
    const enrichedParamsById = new Map(
      rows.map((row) => [row.id, mergeEnrichedTemplateParams(row, labelContexts)]),
    );
    await enrichTemplateParamsFromLegacyInsights(this.prisma, rows, enrichedParamsById);
    await enrichActiveDtcTemplateParams(this.prisma, rows, enrichedParamsById);

    return rows.map((row) => {
      const receipt = receiptByNotification.get(row.id) ?? null;
      const isRead = receipt?.readAt != null;
      const actions = deriveAvailableActions({
        status: row.status,
        eventType: row.eventType,
        eventKind: row.eventKind,
        membershipRole: ctx.membershipRole,
        isRead,
        isPersonallyAcknowledged: receipt?.acknowledgedAt != null,
        userSnoozedUntil: receipt?.snoozedUntil ?? null,
        hasActionTarget: Object.keys((row.actionTarget as object) ?? {}).length > 0,
        referenceNow,
      });
      const enrichedParams = enrichedParamsById.get(row.id) ?? mergeEnrichedTemplateParams(row, labelContexts);
      return mapNotificationToDto(row as any, receipt, actions, ctx.membershipRole, enrichedParams);
    });
  }

  private async validateEntityFilters(orgId: string, query: ListNotificationsQueryDto) {
    if (query.vehicleId) await this.assertEntityInOrg(orgId, 'vehicle', query.vehicleId);
    if (query.stationId) await this.assertEntityInOrg(orgId, 'station', query.stationId);
    if (query.bookingId) await this.assertEntityInOrg(orgId, 'booking', query.bookingId);
    if (query.entityId && query.entityType) {
      await this.assertEntityInOrg(orgId, query.entityType.toLowerCase(), query.entityId);
    } else if (query.entityId && !query.entityType) {
      throw new BadRequestException('entityType is required when filtering by entityId');
    }
  }

  private async assertEntityInOrg(orgId: string, entityKind: string, entityId: string) {
    const kind = entityKind.toUpperCase();
    let found = false;

    if (kind === 'ORGANIZATION') {
      found = entityId === orgId;
    } else if (kind === 'VEHICLE' || entityKind === 'vehicle') {
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
