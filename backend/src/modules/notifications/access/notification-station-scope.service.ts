import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { isOrgWideNotification } from './notification-org-wide.policy';
import type { NotificationAccessContext, NotificationScopeRow } from './notification-access.types';

@Injectable()
export class NotificationStationScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  shouldApplyStationScope(role: MembershipRole, stationScope: string | null): boolean {
    const scope = stationScope?.trim();
    if (!scope || scope === 'ALL') return false;
    return role === MembershipRole.SUB_ADMIN || role === MembershipRole.WORKER;
  }

  /**
   * VW-F-031: prefer Stations V2 effective access when userId is available;
   * legacy single stationScope string remains fallback.
   */
  async buildScopeContext(
    orgId: string,
    role: MembershipRole,
    stationScope: string | null,
    userId?: string,
  ): Promise<Pick<NotificationAccessContext, 'scopedStationId' | 'scopedStationIds' | 'scopedVehicleIds' | 'scopedBookingIds' | 'bypassStationScope'>> {
    if (userId) {
      const access = await this.stationAccess.resolve(userId, orgId);
      if (!access.bypassScope && access.allowedStationIds !== null) {
        const stationIds = access.allowedStationIds;
        if (stationIds.length === 0) {
          return {
            scopedVehicleIds: [],
            scopedBookingIds: [],
            bypassStationScope: false,
            scopedStationId: undefined,
            scopedStationIds: [],
          };
        }
        const [vehicles, bookings] = await Promise.all([
          this.prisma.vehicle.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { homeStationId: { in: stationIds } },
                { currentStationId: { in: stationIds } },
                { expectedStationId: { in: stationIds } },
              ],
            },
            select: { id: true },
          }),
          this.prisma.booking.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { pickupStationId: { in: stationIds } },
                { returnStationId: { in: stationIds } },
              ],
            },
            select: { id: true },
          }),
        ]);
        return {
          scopedStationId: stationIds.length === 1 ? stationIds[0] : undefined,
          scopedStationIds: stationIds,
          scopedVehicleIds: vehicles.map((v) => v.id),
          scopedBookingIds: bookings.map((b) => b.id),
          bypassStationScope: false,
        };
      }
      if (access.bypassScope) {
        return {
          scopedVehicleIds: [],
          scopedBookingIds: [],
          bypassStationScope: true,
        };
      }
    }

    if (!this.shouldApplyStationScope(role, stationScope)) {
      return {
        scopedVehicleIds: [],
        scopedBookingIds: [],
        bypassStationScope: true,
      };
    }

    const scopedStationId = stationScope!.trim();

    const [vehicles, bookings] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { homeStationId: scopedStationId },
            { currentStationId: scopedStationId },
            { expectedStationId: scopedStationId },
          ],
        },
        select: { id: true },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { pickupStationId: scopedStationId },
            { returnStationId: scopedStationId },
          ],
        },
        select: { id: true },
      }),
    ]);

    return {
      scopedStationId,
      scopedStationIds: [scopedStationId],
      scopedVehicleIds: vehicles.map((v) => v.id),
      scopedBookingIds: bookings.map((b) => b.id),
      bypassStationScope: false,
    };
  }

  isNotificationInScope(row: NotificationScopeRow, ctx: NotificationAccessContext): boolean {
    if (ctx.bypassStationScope || ctx.platformRole === 'MASTER_ADMIN') {
      return true;
    }

    if (isOrgWideNotification(row)) {
      return true;
    }

    const stationIds = ctx.scopedStationIds?.length
      ? ctx.scopedStationIds
      : ctx.scopedStationId
        ? [ctx.scopedStationId]
        : [];

    const hasScope =
      stationIds.length > 0
      || ctx.scopedVehicleIds.length > 0
      || ctx.scopedBookingIds.length > 0;

    if (!hasScope) {
      return false;
    }

    const target = (row.actionTarget ?? {}) as Record<string, string | undefined>;
    const stationId =
      row.entityType === 'STATION' ? row.entityId : target.stationId;
    const vehicleId =
      row.entityType === 'VEHICLE' ? row.entityId : target.vehicleId;
    const bookingId =
      row.entityType === 'BOOKING' ? row.entityId : target.bookingId;

    if (stationId && stationIds.includes(stationId)) {
      return true;
    }
    if (vehicleId && ctx.scopedVehicleIds.includes(vehicleId)) return true;
    if (bookingId && ctx.scopedBookingIds.includes(bookingId)) return true;

    return false;
  }

  async recheckVehicleStationScope(
    orgId: string,
    vehicleId: string,
    scopedStationId: string,
  ): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { currentStationId: true, homeStationId: true, expectedStationId: true },
    });
    if (!vehicle) return false;
    return [vehicle.currentStationId, vehicle.homeStationId, vehicle.expectedStationId]
      .includes(scopedStationId);
  }
}
