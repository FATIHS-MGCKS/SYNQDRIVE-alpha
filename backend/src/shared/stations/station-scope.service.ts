import { Injectable } from '@nestjs/common';
import { StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import {
  evaluateStationsV2Permission,
  resolveStationsV2Permissions,
} from '@shared/auth/stations-v2-permission.util';
import {
  STATION_SCOPE_CONTEXT_KEY,
  STATION_SCOPE_MODE,
  StationScopeErrorCode,
} from './station-scope.constants';
import { throwStationScopeForbidden } from './station-scope.errors';
import type {
  StationScopeContext,
  StationScopeMembershipRecord,
  StationScopeOptions,
  StationScopeRequestLike,
} from './station-scope.types';
import {
  isHistoricalReadHttpMethod,
  isStationIdAllowed,
  isUuidLike,
  resolveAllowedStationIds,
  resolveNestedResourceIdFromRequest,
  resolveStationIdFromRequest,
  resolveStationScopeMode,
  stationIdsIntersectScope,
} from './station-scope.util';

@Injectable()
export class StationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  buildMasterAdminScopeContext(orgId: string): StationScopeContext {
    return {
      orgId,
      mode: STATION_SCOPE_MODE.ALL_STATIONS,
      allowedStationIds: null,
      bypassScope: true,
    };
  }

  buildMembershipScopeContext(
    orgId: string,
    membership: StationScopeMembershipRecord,
  ): StationScopeContext {
    const mode = resolveStationScopeMode(membership);
    const allowedStationIds = resolveAllowedStationIds(mode, membership);
    return {
      orgId,
      mode,
      allowedStationIds,
      bypassScope: mode === STATION_SCOPE_MODE.ALL_STATIONS,
    };
  }

  async loadActiveMembership(
    orgId: string,
    userId: string,
  ): Promise<StationScopeMembershipRecord | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: orgId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        stationScope: true,
        stationIds: true,
        permissions: true,
      },
    });

    return membership;
  }

  assertOrganizationContext(request: StationScopeRequestLike, actor?: PermissionActor): string {
    const orgId = request.params?.orgId ?? request.tenantId;
    if (!orgId) {
      throwStationScopeForbidden(
        StationScopeErrorCode.ORGANIZATION_CONTEXT_REQUIRED,
        'Organization context required for station scope',
      );
    }

    if (
      actor?.platformRole !== 'MASTER_ADMIN' &&
      actor?.organizationId &&
      actor.organizationId !== orgId
    ) {
      throwStationScopeForbidden(
        StationScopeErrorCode.CROSS_ORGANIZATION,
        'You do not have access to this organization',
      );
    }

    return orgId;
  }

  async enforceRequestScope(
    request: StationScopeRequestLike,
    options: StationScopeOptions = {},
  ): Promise<StationScopeContext> {
    const actor = request.user;
    if (!actor?.id) {
      throwStationScopeForbidden(
        StationScopeErrorCode.AUTHENTICATION_REQUIRED,
        'Authentication required',
      );
    }

    const orgId = this.assertOrganizationContext(request, actor);
    const resource = options.resource ?? 'station';

    if (resource === 'none') {
      const context = this.buildBypassContext(orgId);
      this.attachContext(request, context);
      return context;
    }

    if (actor.platformRole === 'MASTER_ADMIN') {
      const context = await this.enforceForMasterAdmin(request, orgId, resource, options);
      this.attachContext(request, context);
      return context;
    }

    const membership = await this.loadActiveMembership(orgId, actor.id);
    if (!membership) {
      throwStationScopeForbidden(
        StationScopeErrorCode.MEMBERSHIP_REQUIRED,
        'You do not have access to this organization',
      );
    }

    const context = this.buildMembershipScopeContext(orgId, membership);

    if (context.mode === STATION_SCOPE_MODE.NO_STATIONS) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NO_STATIONS,
        'Station access is not allowed for this membership',
        { mode: context.mode },
      );
    }

    if (resource === 'list') {
      if (context.mode === STATION_SCOPE_MODE.ASSIGNED_STATIONS && context.allowedStationIds?.length === 0) {
        throwStationScopeForbidden(
          StationScopeErrorCode.NO_STATIONS,
          'No stations assigned to this membership',
          { mode: context.mode },
        );
      }
      this.attachContext(request, context);
      return context;
    }

    if (resource === 'create') {
      this.attachContext(request, context);
      return context;
    }

    const stationIds = await this.resolveTargetStationIds(request, orgId, resource, options);

    if (resource === 'vehicle' || resource === 'booking' || resource === 'vehicle_location') {
      await this.assertNestedResourceStationsInScope({
        orgId,
        stationIds,
        context,
        membership,
        httpMethod: request.method,
      });
      this.attachContext(request, context);
      return context;
    }

    for (const stationId of stationIds) {
      await this.assertVerifiedStationInScope({
        orgId,
        stationId,
        context,
        membership,
        httpMethod: request.method,
      });
    }

    this.attachContext(request, context);
    return context;
  }

  async assertInScope(
    orgId: string,
    membership: StationScopeMembershipRecord,
    stationId: string,
    httpMethod: string,
  ): Promise<void> {
    const context = this.buildMembershipScopeContext(orgId, membership);
    await this.assertVerifiedStationInScope({
      orgId,
      stationId,
      context,
      membership,
      httpMethod,
    });
  }

  private buildBypassContext(orgId: string): StationScopeContext {
    return {
      orgId,
      mode: STATION_SCOPE_MODE.ALL_STATIONS,
      allowedStationIds: null,
      bypassScope: true,
    };
  }

  private async enforceForMasterAdmin(
    request: StationScopeRequestLike,
    orgId: string,
    resource: NonNullable<StationScopeOptions['resource']>,
    options: StationScopeOptions,
  ): Promise<StationScopeContext> {
    const context = this.buildMasterAdminScopeContext(orgId);

    if (resource === 'list' || resource === 'none' || resource === 'create') {
      return context;
    }

    const stationIds = await this.resolveTargetStationIds(request, orgId, resource, options);
    for (const stationId of stationIds) {
      await this.assertStationBelongsToOrg(orgId, stationId);
      await this.assertArchivedPolicy({
        orgId,
        stationId,
        httpMethod: request.method,
        permissionsRaw: null,
        hasScope: true,
      });
    }

    return context;
  }

  private async resolveTargetStationIds(
    request: StationScopeRequestLike,
    orgId: string,
    resource: NonNullable<StationScopeOptions['resource']>,
    options: StationScopeOptions,
  ): Promise<string[]> {
    if (resource === 'vehicle' || resource === 'vehicle_location') {
      const field = options.resourceIdField ?? 'vehicleId';
      const vehicleId = resolveNestedResourceIdFromRequest(request, field);
      const stationIds = new Set<string>();

      if (vehicleId) {
        for (const id of await this.resolveStationIdsForVehicle(orgId, vehicleId)) {
          stationIds.add(id);
        }
      }

      if (resource === 'vehicle_location') {
        for (const key of ['currentStationId', 'expectedStationId'] as const) {
          const value = request.body?.[key];
          if (typeof value === 'string' && value.trim()) {
            stationIds.add(value.trim());
          }
        }
      }

      return [...stationIds];
    }

    if (resource === 'booking') {
      const field = options.resourceIdField ?? 'bookingId';
      const bookingId = resolveNestedResourceIdFromRequest(request, field);
      if (!bookingId) return [];
      return this.resolveStationIdsForBooking(orgId, bookingId);
    }

    const stationId = resolveStationIdFromRequest(request);
    if (!stationId) return [];

    if (!isUuidLike(stationId)) {
      throwStationScopeForbidden(
        StationScopeErrorCode.INVALID_STATION_ID,
        'Invalid station id',
        { stationId },
      );
    }

    return [stationId];
  }

  private async resolveStationIdsForVehicle(orgId: string, vehicleId: string): Promise<string[]> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
      },
    });

    if (!vehicle) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_NOT_FOUND,
        'Vehicle not found in this organization',
      );
    }

    return [vehicle.homeStationId, vehicle.currentStationId, vehicle.expectedStationId].filter(
      (id): id is string => typeof id === 'string' && !!id,
    );
  }

  private async resolveStationIdsForBooking(orgId: string, bookingId: string): Promise<string[]> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        pickupStationId: true,
        returnStationId: true,
      },
    });

    if (!booking) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_NOT_FOUND,
        'Booking not found in this organization',
      );
    }

    return [booking.pickupStationId, booking.returnStationId].filter(
      (id): id is string => typeof id === 'string' && !!id,
    );
  }

  private async assertNestedResourceStationsInScope(args: {
    orgId: string;
    stationIds: string[];
    context: StationScopeContext;
    membership: StationScopeMembershipRecord;
    httpMethod: string;
  }): Promise<void> {
    const { orgId, stationIds, context, membership, httpMethod } = args;

    if (stationIds.length === 0) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_OUT_OF_SCOPE,
        'Nested resource has no station linkage',
        { mode: context.mode },
      );
    }

    if (
      !stationIdsIntersectScope(stationIds, context.mode, context.allowedStationIds)
    ) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_OUT_OF_SCOPE,
        'Nested resource is outside your assigned station scope',
        { mode: context.mode },
      );
    }

    const inScopeStationIds = stationIds.filter((stationId) =>
      isStationIdAllowed(stationId, context.mode, context.allowedStationIds),
    );

    for (const stationId of inScopeStationIds) {
      await this.assertVerifiedStationInScope({
        orgId,
        stationId,
        context,
        membership,
        httpMethod,
      });
    }
  }

  private async assertVerifiedStationInScope(args: {
    orgId: string;
    stationId: string;
    context: StationScopeContext;
    membership: StationScopeMembershipRecord;
    httpMethod: string;
  }): Promise<void> {
    const { orgId, stationId, context, membership, httpMethod } = args;

    if (!isUuidLike(stationId)) {
      throwStationScopeForbidden(
        StationScopeErrorCode.INVALID_STATION_ID,
        'Invalid station id',
        { stationId },
      );
    }

    const station = await this.assertStationBelongsToOrg(orgId, stationId);

    const inScope = isStationIdAllowed(
      stationId,
      context.mode,
      context.allowedStationIds,
    );

    if (!inScope) {
      throwStationScopeForbidden(
        StationScopeErrorCode.STATION_NOT_IN_SCOPE,
        'Station is outside your assigned station scope',
        { stationId, mode: context.mode },
      );
    }

    await this.assertArchivedPolicy({
      orgId,
      stationId,
      httpMethod,
      permissionsRaw: membership.permissions,
      hasScope: true,
      stationStatus: station.status,
    });
  }

  private async assertStationBelongsToOrg(
    orgId: string,
    stationId: string,
  ): Promise<{ status: StationStatus }> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId: orgId },
      select: { status: true },
    });

    if (!station) {
      const foreign = await this.prisma.station.findFirst({
        where: { id: stationId },
        select: { id: true },
      });

      if (foreign) {
        throwStationScopeForbidden(
          StationScopeErrorCode.CROSS_ORGANIZATION,
          'Station does not belong to this organization',
          { stationId },
        );
      }

      throwStationScopeForbidden(
        StationScopeErrorCode.STATION_NOT_FOUND,
        'Station not found in this organization',
        { stationId },
      );
    }

    return station;
  }

  private async assertArchivedPolicy(args: {
    orgId: string;
    stationId: string;
    httpMethod: string;
    permissionsRaw: unknown;
    hasScope: boolean;
    stationStatus?: StationStatus;
  }): Promise<void> {
    const status =
      args.stationStatus ??
      (
        await this.prisma.station.findFirst({
          where: { id: args.stationId, organizationId: args.orgId },
          select: { status: true },
        })
      )?.status;

    if (status !== StationStatus.ARCHIVED) return;

    if (!args.hasScope) return;

    if (isHistoricalReadHttpMethod(args.httpMethod)) {
      const resolved = resolveStationsV2Permissions(args.permissionsRaw);
      if (!evaluateStationsV2Permission(resolved, 'stations.read')) {
        throwStationScopeForbidden(
          StationScopeErrorCode.ARCHIVED_READ_PERMISSION_REQUIRED,
          'Read permission required for archived station access',
          { stationId: args.stationId },
        );
      }
      return;
    }

    throwStationScopeForbidden(
      StationScopeErrorCode.ARCHIVED_WRITE_FORBIDDEN,
      'Archived stations only allow historical reads',
      { stationId: args.stationId },
    );
  }

  async assertNestedVehicleInScope(
    orgId: string,
    membership: StationScopeMembershipRecord,
    vehicleId: string,
    httpMethod: string,
  ): Promise<void> {
    const context = this.buildMembershipScopeContext(orgId, membership);

    if (context.mode === STATION_SCOPE_MODE.NO_STATIONS) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NO_STATIONS,
        'Station access is not allowed for this membership',
        { mode: context.mode },
      );
    }

    const stationIds = await this.resolveStationIdsForVehicle(orgId, vehicleId);
    if (stationIds.length === 0) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_OUT_OF_SCOPE,
        'Vehicle has no station linkage in scope',
      );
    }

    if (
      !stationIdsIntersectScope(stationIds, context.mode, context.allowedStationIds)
    ) {
      throwStationScopeForbidden(
        StationScopeErrorCode.NESTED_RESOURCE_OUT_OF_SCOPE,
        'Vehicle is outside your assigned station scope',
        { mode: context.mode },
      );
    }

    for (const stationId of stationIds) {
      if (!isStationIdAllowed(stationId, context.mode, context.allowedStationIds)) {
        continue;
      }
      await this.assertArchivedPolicy({
        orgId,
        stationId,
        httpMethod,
        permissionsRaw: membership.permissions,
        hasScope: true,
      });
    }
  }

  private attachContext(request: StationScopeRequestLike, context: StationScopeContext): void {
    request[STATION_SCOPE_CONTEXT_KEY] = context;
  }
}
