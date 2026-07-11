import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isOrgWideNotification } from './notification-org-wide.policy';
import type { NotificationAccessContext, NotificationScopeRow } from './notification-access.types';

@Injectable()
export class NotificationStationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  shouldApplyStationScope(role: MembershipRole, stationScope: string | null): boolean {
    const scope = stationScope?.trim();
    if (!scope || scope === 'ALL') return false;
    return role === MembershipRole.SUB_ADMIN || role === MembershipRole.WORKER;
  }

  async buildScopeContext(
    orgId: string,
    role: MembershipRole,
    stationScope: string | null,
  ): Promise<Pick<NotificationAccessContext, 'scopedStationId' | 'scopedVehicleIds' | 'scopedBookingIds' | 'bypassStationScope'>> {
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

    if (!ctx.scopedStationId) {
      return true;
    }

    const target = (row.actionTarget ?? {}) as Record<string, string | undefined>;
    const stationId =
      row.entityType === 'STATION' ? row.entityId : target.stationId;
    const vehicleId =
      row.entityType === 'VEHICLE' ? row.entityId : target.vehicleId;
    const bookingId =
      row.entityType === 'BOOKING' ? row.entityId : target.bookingId;

    if (stationId === ctx.scopedStationId) return true;
    if (vehicleId && ctx.scopedVehicleIds.includes(vehicleId)) return true;
    if (bookingId && ctx.scopedBookingIds.includes(bookingId)) return true;

    return false;
  }

  /**
   * Re-resolve vehicle station at read time — handles vehicle station moves.
   * If vehicle left scoped station after notification creation, hide unless booking-linked.
   */
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
