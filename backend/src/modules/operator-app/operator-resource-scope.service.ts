import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { StationAccessService } from '@shared/stations/station-access.service';
import {
  assertBookingStationReadable,
  assertBookingStationWritable,
  assertFieldAgentAccess,
  assertTaskCompletable,
  assertTaskReadable,
  assertVehicleStationReadable,
  buildBookingStationScopeWhere,
  buildTaskStationScopeWhere,
  resolveEffectiveStationFilter,
  validateActualStationIdForHandover,
} from './operator-resource-scope.policy';
import type {
  BookingStationRef,
  OperatorScopeContext,
  OperatorScopeOverrideAuditInput,
  OperatorScopeOverrideInput,
  TaskScopeRef,
  VehicleStationRef,
} from './operator-resource-scope.types';

@Injectable()
export class OperatorResourceScopeService {
  constructor(
    private readonly stationAccess: StationAccessService,
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Resolves station scope from membership — never from request parameters.
   * When `actorUserId` is omitted (system/cron), scope is bypassed.
   */
  async resolve(actorUserId: string | undefined, organizationId: string): Promise<OperatorScopeContext> {
    const stationCtx = await this.stationAccess.resolve(actorUserId, organizationId);

    if (!actorUserId) {
      return {
        ...stationCtx,
        organizationId,
        fieldAgentAccess: true,
        permissions: null,
        membershipRole: stationCtx.membershipRole,
      };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actorUserId, organizationId, status: 'ACTIVE' },
      select: {
        role: true,
        permissions: true,
        fieldAgentAccess: true,
      },
    });

    return {
      ...stationCtx,
      organizationId,
      fieldAgentAccess: membership?.fieldAgentAccess ?? false,
      permissions: normalizeMembershipPermissions(membership?.permissions ?? null),
      membershipRole: membership?.role ?? stationCtx.membershipRole,
    };
  }

  resolveStationFilter(access: OperatorScopeContext, requestedStationId?: string | null) {
    return resolveEffectiveStationFilter(access, requestedStationId);
  }

  buildBookingListScopeWhere(
    access: OperatorScopeContext,
    requestedStationId?: string | null,
  ): Prisma.BookingWhereInput | null {
    const filter = resolveEffectiveStationFilter(access, requestedStationId);
    if (filter.mode === 'bypass') return null;
    if (filter.mode === 'none') return { id: { in: [] } };
    return buildBookingStationScopeWhere(filter.stationIds);
  }

  async buildTaskListScopeWhere(
    access: OperatorScopeContext,
    actorUserId?: string,
    requestedStationId?: string | null,
  ): Promise<Prisma.OrgTaskWhereInput | null> {
    const filter = resolveEffectiveStationFilter(access, requestedStationId);
    if (filter.mode === 'bypass') return null;
    if (filter.mode === 'none') return { id: { in: [] } };

    const stationIds = filter.stationIds;
    const scopedAccess = {
      ...access,
      bypassScope: false,
      allowedStationIds: stationIds,
    };

    const [bookings, vehicles] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          organizationId: access.organizationId,
          ...buildBookingStationScopeWhere(stationIds),
        },
        select: { id: true },
      }),
      this.prisma.vehicle.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [
            { homeStationId: { in: stationIds } },
            { currentStationId: { in: stationIds } },
          ],
        },
        select: { id: true },
      }),
    ]);

    return buildTaskStationScopeWhere(
      scopedAccess,
      actorUserId,
      bookings.map((b) => b.id),
      vehicles.map((v) => v.id),
    );
  }

  assertBookingReadable(
    access: OperatorScopeContext,
    booking: BookingStationRef,
    vehicle?: VehicleStationRef | null,
  ): void {
    assertBookingStationReadable(access, booking, vehicle);
  }

  assertBookingWritable(
    access: OperatorScopeContext,
    booking: BookingStationRef,
    vehicle: VehicleStationRef | null | undefined,
    options?: {
      requireFieldAgent?: boolean;
      handoverKind?: 'PICKUP' | 'RETURN';
      override?: OperatorScopeOverrideInput;
    },
  ): void {
    assertBookingStationWritable(access, booking, vehicle, options);
  }

  assertTaskReadable(
    access: OperatorScopeContext,
    task: TaskScopeRef,
    actorUserId?: string,
    vehicle?: VehicleStationRef | null,
  ): void {
    assertTaskReadable(access, task, actorUserId, vehicle);
  }

  assertTaskCompletable(
    access: OperatorScopeContext,
    task: TaskScopeRef,
    actorUserId: string,
    override?: OperatorScopeOverrideInput,
    vehicle?: VehicleStationRef | null,
  ) {
    return assertTaskCompletable(access, task, actorUserId, override, vehicle);
  }

  assertVehicleReadable(
    access: OperatorScopeContext,
    vehicle: VehicleStationRef,
    override?: OperatorScopeOverrideInput,
  ) {
    return assertVehicleStationReadable(access, vehicle, override);
  }

  assertFieldAgent(access: OperatorScopeContext): void {
    assertFieldAgentAccess(access);
  }

  validateHandoverActualStation(
    access: OperatorScopeContext,
    booking: BookingStationRef,
    kind: 'PICKUP' | 'RETURN',
    actualStationId?: string | null,
  ): string | undefined {
    return validateActualStationIdForHandover(access, booking, kind, actualStationId);
  }

  async recordScopeOverrideAudit(input: OperatorScopeOverrideAuditInput): Promise<void> {
    const entity =
      input.resourceKind === 'booking' || input.resourceKind === 'handover'
        ? ActivityEntity.BOOKING
        : input.resourceKind === 'vehicle' || input.resourceKind === 'damage'
          ? ActivityEntity.VEHICLE
          : ActivityEntity.TASK;

    try {
      await this.activityLog.log({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        action: ActivityAction.UPDATE,
        entity,
        entityId: input.resourceId,
        description: `Operator scope override (${input.resourceKind})`,
        metaJson: {
          kind: 'OPERATOR_STATION_SCOPE_OVERRIDE',
          resourceKind: input.resourceKind,
          reason: input.reason,
          ...input.metadata,
        },
      });
    } catch {
      // Non-blocking — scope enforcement already succeeded.
    }
  }
}
