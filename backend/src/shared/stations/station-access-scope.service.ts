import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationScopeService } from './station-scope.service';
import type { StationScopeContext, StationScopeMembershipRecord } from './station-scope.types';
import type {
  BookingAccessWhereInput,
  ResolveStationAccessScopeOptions,
  StationAccessScope,
  StationAccessWhereInput,
  VehicleAccessWhereInput,
} from './station-access-scope.types';
import {
  buildBookingAccessWhere,
  buildEditableStationAccessWhere,
  buildFleetVehicleAccessWhere,
  buildStationAccessWhere,
  buildStationActivityWhere,
  buildStationBookingsWhere,
  buildStationFleetWhere,
  buildStationLinkedVehicleWhere,
  buildStationOpenTasksWhere,
  buildStationPickupBookingsWhere,
  buildStationReturnBookingsWhere,
  buildVehicleHomeAccessWhere,
  isStationEditableInAccessScope,
  isStationReadableInAccessScope,
  resolveEmptyStationAccessScope,
  resolveStationAccessScope,
  resolveStationAccessScopeFromContext,
  resolveStationAccessScopeFromPermissions,
} from './station-access-scope.util';

export const STATION_NOT_FOUND_MESSAGE = (stationId: string) =>
  `Station ${stationId} not found`;

@Injectable()
export class StationAccessScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationScopeService: StationScopeService,
  ) {}

  resolveFromScopeContext(
    scope: StationScopeContext,
    options?: ResolveStationAccessScopeOptions,
  ): StationAccessScope {
    return resolveStationAccessScope(scope, options);
  }

  resolveFromContextOrEmpty(
    orgId: string,
    scope: StationScopeContext | undefined,
    options?: ResolveStationAccessScopeOptions,
  ): StationAccessScope {
    return resolveStationAccessScopeFromContext(orgId, scope, options);
  }

  resolveFromMembership(
    orgId: string,
    membership: StationScopeMembershipRecord,
  ): StationAccessScope {
    const scope = this.stationScopeService.buildMembershipScopeContext(orgId, membership);
    return resolveStationAccessScopeFromPermissions(scope, membership.permissions);
  }

  emptyScope(orgId: string): StationAccessScope {
    return resolveEmptyStationAccessScope(orgId);
  }

  buildStationWhere(
    access: StationAccessScope,
    extra?: Prisma.StationWhereInput,
  ): StationAccessWhereInput {
    return buildStationAccessWhere(access, extra);
  }

  buildEditableStationWhere(
    access: StationAccessScope,
    extra?: Prisma.StationWhereInput,
  ): StationAccessWhereInput {
    return buildEditableStationAccessWhere(access, extra);
  }

  buildVehicleHomeWhere(access: StationAccessScope): VehicleAccessWhereInput {
    return buildVehicleHomeAccessWhere(access);
  }

  buildFleetVehicleWhere(access: StationAccessScope): VehicleAccessWhereInput {
    return buildFleetVehicleAccessWhere(access);
  }

  buildBookingWhere(
    access: StationAccessScope,
    extra?: Prisma.BookingWhereInput,
  ): BookingAccessWhereInput {
    return buildBookingAccessWhere(access, extra);
  }

  buildStationFleetWhere(
    access: StationAccessScope,
    stationId: string,
  ): VehicleAccessWhereInput {
    return buildStationFleetWhere(access, stationId);
  }

  buildStationLinkedVehicleWhere(
    access: StationAccessScope,
    stationId: string,
  ): VehicleAccessWhereInput {
    return buildStationLinkedVehicleWhere(access, stationId);
  }

  buildStationBookingsWhere(
    access: StationAccessScope,
    stationId: string,
    extra?: Prisma.BookingWhereInput,
  ): BookingAccessWhereInput {
    return buildStationBookingsWhere(access, stationId, extra);
  }

  buildStationPickupBookingsWhere(
    access: StationAccessScope,
    stationId: string,
    extra?: Prisma.BookingWhereInput,
  ): BookingAccessWhereInput {
    return buildStationPickupBookingsWhere(access, stationId, extra);
  }

  buildStationReturnBookingsWhere(
    access: StationAccessScope,
    stationId: string,
    extra?: Prisma.BookingWhereInput,
  ): BookingAccessWhereInput {
    return buildStationReturnBookingsWhere(access, stationId, extra);
  }

  buildStationOpenTasksWhere(
    access: StationAccessScope,
    stationId: string,
    linkedVehicleIds: string[],
    linkedBookingIds: string[],
  ): Prisma.OrgTaskWhereInput {
    return buildStationOpenTasksWhere(
      access,
      stationId,
      linkedVehicleIds,
      linkedBookingIds,
    );
  }

  buildStationActivityWhere(
    access: StationAccessScope,
    stationId: string,
  ): Prisma.ActivityLogWhereInput {
    return buildStationActivityWhere(access, stationId);
  }

  async requireReadableStation<T extends Prisma.StationFindFirstArgs>(
    access: StationAccessScope,
    stationId: string,
    args: Omit<T, 'where'> = {} as Omit<T, 'where'>,
  ): Promise<Prisma.StationGetPayload<T>> {
    const station = await this.prisma.station.findFirst({
      ...args,
      where: buildStationAccessWhere(access, { id: stationId }),
    } as T);

    if (!station) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE(stationId));
    }

    return station as Prisma.StationGetPayload<T>;
  }

  isStationReadable(access: StationAccessScope, stationId: string): boolean {
    return isStationReadableInAccessScope(access, stationId);
  }

  isStationEditable(access: StationAccessScope, stationId: string): boolean {
    return isStationEditableInAccessScope(access, stationId);
  }

  /**
   * Materializes readable station IDs when callers need an explicit list
   * (e.g. large IN-clauses). For ALL_STATIONS returns IDs from DB only.
   */
  async loadReadableStationIds(access: StationAccessScope): Promise<string[]> {
    if (!access.canRead) return [];
    if (access.readableStationIds !== null) {
      return access.readableStationIds;
    }

    const rows = await this.prisma.station.findMany({
      where: { organizationId: access.orgId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }
}
