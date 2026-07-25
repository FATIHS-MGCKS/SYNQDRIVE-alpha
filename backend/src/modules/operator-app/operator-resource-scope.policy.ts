import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import type { StationAccessContext } from '@shared/stations/station-access.types';
import type {
  BookingStationRef,
  OperatorScopeContext,
  OperatorScopeOverrideInput,
  TaskScopeRef,
  VehicleStationRef,
} from './operator-resource-scope.types';

export const OPERATOR_SCOPE_DENIED = 'OPERATOR_SCOPE_DENIED';
export const OPERATOR_SCOPE_OVERRIDE_REASON_REQUIRED = 'OPERATOR_SCOPE_OVERRIDE_REASON_REQUIRED';

export const OPERATOR_SUPERVISOR_OVERRIDE_MODULE = 'tasks' as const;
export const OPERATOR_SUPERVISOR_OVERRIDE_LEVEL = 'manage' as const;

export function collectBookingStationIds(booking: BookingStationRef): string[] {
  const ids = [
    booking.pickupStationId,
    booking.returnStationId,
    booking.actualPickupStationId,
    booking.actualReturnStationId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

export function collectVehicleStationIds(vehicle?: VehicleStationRef | null): string[] {
  if (!vehicle) return [];
  const ids = [vehicle.homeStationId, vehicle.currentStationId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  return [...new Set(ids)];
}

export function resolveTaskStationId(task: TaskScopeRef): string | undefined {
  const meta =
    task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : {};
  const direct = meta.stationId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const pickup = meta.pickupStationId;
  if (typeof pickup === 'string' && pickup.trim()) return pickup.trim();
  const ret = meta.returnStationId;
  if (typeof ret === 'string' && ret.trim()) return ret.trim();
  return undefined;
}

export function isStationAllowed(
  access: StationAccessContext,
  stationId: string | null | undefined,
): boolean {
  if (!stationId) return false;
  if (access.bypassScope || access.allowedStationIds === null) return true;
  return (access.allowedStationIds ?? []).includes(stationId);
}

export function anyStationAllowed(
  access: StationAccessContext,
  stationIds: string[],
): boolean {
  if (access.bypassScope || access.allowedStationIds === null) return true;
  if (stationIds.length === 0) return false;
  const allowed = new Set(access.allowedStationIds ?? []);
  return stationIds.some((id) => allowed.has(id));
}

export function bookingMatchesStationScope(
  access: StationAccessContext,
  booking: BookingStationRef,
  vehicle?: VehicleStationRef | null,
): boolean {
  if (access.bypassScope || access.allowedStationIds === null) return true;
  const stationIds = [
    ...collectBookingStationIds(booking),
    ...collectVehicleStationIds(vehicle),
  ];
  return anyStationAllowed(access, stationIds);
}

export function taskMatchesStationScope(
  access: StationAccessContext,
  task: TaskScopeRef,
  vehicle?: VehicleStationRef | null,
): boolean {
  if (access.bypassScope || access.allowedStationIds === null) return true;
  const stationIds = [
    resolveTaskStationId(task),
    ...collectVehicleStationIds(vehicle),
  ].filter((id): id is string => Boolean(id));
  return anyStationAllowed(access, stationIds);
}

export function vehicleMatchesStationScope(
  access: StationAccessContext,
  vehicle: VehicleStationRef,
): boolean {
  if (access.bypassScope || access.allowedStationIds === null) return true;
  return anyStationAllowed(access, collectVehicleStationIds(vehicle));
}

export function taskAssignedToActor(task: TaskScopeRef, actorUserId?: string | null): boolean {
  return Boolean(actorUserId && task.assignedUserId && task.assignedUserId === actorUserId);
}

export function canSupervisorOverrideStationScope(
  access: OperatorScopeContext,
): boolean {
  if (access.bypassScope) return true;
  const role = (access.membershipRole ?? '').toString().toUpperCase();
  if (role === 'ORG_ADMIN') return true;
  return evaluateModulePermission(
    access.permissions,
    OPERATOR_SUPERVISOR_OVERRIDE_MODULE,
    OPERATOR_SUPERVISOR_OVERRIDE_LEVEL,
  );
}

export function assertScopeOverrideReason(reason?: string | null): string {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new BadRequestException({
      statusCode: 400,
      code: OPERATOR_SCOPE_OVERRIDE_REASON_REQUIRED,
      message: 'Eine Begründung ist für den Stations-Scope-Override erforderlich.',
    });
  }
  return trimmed;
}

export function assertFieldAgentAccess(access: OperatorScopeContext): void {
  if (access.bypassScope) return;
  if (!access.fieldAgentAccess) {
    throw new ForbiddenException({
      statusCode: 403,
      code: OPERATOR_SCOPE_DENIED,
      message: 'Field-agent access is required for this operation.',
    });
  }
}

export function assertBookingStationReadable(
  access: OperatorScopeContext,
  booking: BookingStationRef,
  vehicle?: VehicleStationRef | null,
): void {
  if (bookingMatchesStationScope(access, booking, vehicle)) return;
  throw new NotFoundException('Booking not found');
}

export function assertBookingStationWritable(
  access: OperatorScopeContext,
  booking: BookingStationRef,
  vehicle: VehicleStationRef | null | undefined,
  options?: {
    requireFieldAgent?: boolean;
    handoverKind?: 'PICKUP' | 'RETURN';
    override?: OperatorScopeOverrideInput;
  },
): void {
  if (options?.requireFieldAgent) {
    assertFieldAgentAccess(access);
  }

  if (bookingMatchesStationScope(access, booking, vehicle)) {
    return;
  }

  if (canSupervisorOverrideStationScope(access)) {
    assertScopeOverrideReason(options?.override?.scopeOverrideReason);
    return;
  }

  throw new ForbiddenException({
    statusCode: 403,
    code: OPERATOR_SCOPE_DENIED,
    message: 'You do not have access to bookings at this station.',
  });
}

export function assertTaskReadable(
  access: OperatorScopeContext,
  task: TaskScopeRef,
  actorUserId?: string,
  vehicle?: VehicleStationRef | null,
): void {
  if (access.bypassScope || access.allowedStationIds === null) return;
  if (taskAssignedToActor(task, actorUserId)) return;
  if (taskMatchesStationScope(access, task, vehicle)) return;
  throw new NotFoundException('Task not found');
}

export function assertTaskCompletable(
  access: OperatorScopeContext,
  task: TaskScopeRef,
  actorUserId: string,
  override?: OperatorScopeOverrideInput,
  vehicle?: VehicleStationRef | null,
): { overrideApplied: boolean; overrideReason?: string } {
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    throw new BadRequestException('A completed or cancelled task can no longer be completed');
  }

  if (access.bypassScope || access.allowedStationIds === null) {
    return { overrideApplied: false };
  }

  if (taskAssignedToActor(task, actorUserId)) {
    return { overrideApplied: false };
  }

  if (taskMatchesStationScope(access, task, vehicle)) {
    return { overrideApplied: false };
  }

  if (canSupervisorOverrideStationScope(access)) {
    const overrideReason = assertScopeOverrideReason(override?.scopeOverrideReason);
    return { overrideApplied: true, overrideReason };
  }

  throw new ForbiddenException({
    statusCode: 403,
    code: OPERATOR_SCOPE_DENIED,
    message: 'You can only complete tasks assigned to you or within your station scope.',
  });
}

export function assertVehicleStationReadable(
  access: OperatorScopeContext,
  vehicle: VehicleStationRef,
  override?: OperatorScopeOverrideInput,
): { overrideApplied: boolean; overrideReason?: string } {
  if (vehicleMatchesStationScope(access, vehicle)) {
    return { overrideApplied: false };
  }

  if (canSupervisorOverrideStationScope(access)) {
    const overrideReason = assertScopeOverrideReason(override?.scopeOverrideReason);
    return { overrideApplied: true, overrideReason };
  }

  throw new NotFoundException('Vehicle not found');
}

export type StationFilterResolution =
  | { mode: 'bypass' }
  | { mode: 'none' }
  | { mode: 'filter'; stationIds: string[] };

/** Never expands scope beyond membership — ignores foreign stationId from client. */
export function resolveEffectiveStationFilter(
  access: StationAccessContext,
  requestedStationId?: string | null,
): StationFilterResolution {
  const requested = requestedStationId?.trim() || undefined;

  if (access.bypassScope || access.allowedStationIds === null) {
    if (requested) return { mode: 'filter', stationIds: [requested] };
    return { mode: 'bypass' };
  }

  const allowed = access.allowedStationIds ?? [];
  if (allowed.length === 0) return { mode: 'none' };

  if (requested) {
    if (!allowed.includes(requested)) return { mode: 'none' };
    return { mode: 'filter', stationIds: [requested] };
  }

  return { mode: 'filter', stationIds: allowed };
}

export function buildBookingStationScopeWhere(
  stationIds: string[],
): Prisma.BookingWhereInput {
  if (stationIds.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { pickupStationId: { in: stationIds } },
      { returnStationId: { in: stationIds } },
      { actualPickupStationId: { in: stationIds } },
      { actualReturnStationId: { in: stationIds } },
      {
        vehicle: {
          OR: [
            { homeStationId: { in: stationIds } },
            { currentStationId: { in: stationIds } },
          ],
        },
      },
    ],
  };
}

export function buildTaskStationScopeWhere(
  access: StationAccessContext,
  actorUserId?: string,
  bookingIdsInScope?: string[],
  vehicleIdsInScope?: string[],
): Prisma.OrgTaskWhereInput {
  if (access.bypassScope || access.allowedStationIds === null) return {};

  const stationIds = access.allowedStationIds ?? [];
  if (stationIds.length === 0) return { id: { in: [] } };

  const orClauses: Prisma.OrgTaskWhereInput[] = [];

  if (actorUserId) {
    orClauses.push({ assignedUserId: actorUserId });
  }

  for (const stationId of stationIds) {
    orClauses.push({
      metadata: { path: ['stationId'], equals: stationId },
    });
  }

  if (bookingIdsInScope && bookingIdsInScope.length > 0) {
    orClauses.push({ bookingId: { in: bookingIdsInScope } });
  }

  if (vehicleIdsInScope && vehicleIdsInScope.length > 0) {
    orClauses.push({ vehicleId: { in: vehicleIdsInScope } });
  }

  return orClauses.length > 0 ? { OR: orClauses } : { id: { in: [] } };
}

export function validateActualStationIdForHandover(
  access: OperatorScopeContext,
  booking: BookingStationRef,
  kind: 'PICKUP' | 'RETURN',
  actualStationId?: string | null,
): string | undefined {
  const trimmed = actualStationId?.trim();
  if (!trimmed) return undefined;

  const planned =
    kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId;
  const plannedIds = collectBookingStationIds(booking);
  if (!plannedIds.includes(trimmed)) {
    throw new BadRequestException(
      'actualStationId must match a planned booking station',
    );
  }

  if (!isStationAllowed(access, trimmed)) {
    if (canSupervisorOverrideStationScope(access)) {
      return trimmed;
    }
    throw new ForbiddenException({
      statusCode: 403,
      code: OPERATOR_SCOPE_DENIED,
      message: 'actualStationId is outside your station scope.',
    });
  }

  if (planned && trimmed !== planned) {
    // Different pickup/return station on same booking — allowed when in scope.
    return trimmed;
  }

  return trimmed;
}
