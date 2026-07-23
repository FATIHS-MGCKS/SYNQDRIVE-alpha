import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';

export type BookingAccessRow = {
  id: string;
  customerId: string;
  assignedDriverId: string | null;
  vehicleId: string;
};

@Injectable()
export class BookingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a booking strictly within the tenant. Returns 404 when the booking
   * does not exist in the organization (no cross-tenant existence leak).
   */
  async assertBookingInOrg(
    orgId: string,
    bookingId: string,
  ): Promise<BookingAccessRow> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        vehicleId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  /**
   * Drivers without `booking.read_sensitive` may only access bookings where
   * their linked customer record is contract holder, assigned driver, or
   * allowed additional driver. Uses email match user ↔ customer within org.
   * Returns 404 when out of scope (same as missing booking).
   */
  async assertDriverScopedBookingAccess(options: {
    orgId: string;
    bookingId: string;
    userId: string;
    membershipRole: MembershipRole | undefined;
    permissions: MembershipPermissionsMap | null | undefined;
  }): Promise<void> {
    const perms = normalizeMembershipPermissions(options.permissions);
    const hasSensitive = evaluateModulePermission(perms, 'bookings-sensitive', 'read');
    if (options.membershipRole !== 'DRIVER' || hasSensitive) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: options.userId },
      select: { email: true },
    });
    if (!user?.email?.trim()) {
      throw new NotFoundException('Booking not found');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: options.orgId,
        email: { equals: user.email.trim(), mode: 'insensitive' },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Booking not found');
    }

    const allowed = await this.prisma.booking.findFirst({
      where: {
        id: options.bookingId,
        organizationId: options.orgId,
        OR: [
          { customerId: customer.id },
          { assignedDriverId: customer.id },
          { allowedDrivers: { some: { customerId: customer.id } } },
        ],
      },
      select: { id: true },
    });
    if (!allowed) {
      throw new NotFoundException('Booking not found');
    }
  }

  /** Driver list scope — restrict findAll to own bookings when DRIVER w/o sensitive read. */
  driverScopedWhereClause(options: {
    orgId: string;
    userId: string;
    membershipRole: MembershipRole | undefined;
    permissions: MembershipPermissionsMap | null | undefined;
  }): Promise<Prisma.BookingWhereInput | null> {
    return this.resolveDriverScopeFilter(options);
  }

  private async resolveDriverScopeFilter(options: {
    orgId: string;
    userId: string;
    membershipRole: MembershipRole | undefined;
    permissions: MembershipPermissionsMap | null | undefined;
  }): Promise<Prisma.BookingWhereInput | null> {
    const perms = normalizeMembershipPermissions(options.permissions);
    const hasSensitive = evaluateModulePermission(perms, 'bookings-sensitive', 'read');
    if (options.membershipRole !== 'DRIVER' || hasSensitive) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: options.userId },
      select: { email: true },
    });
    if (!user?.email?.trim()) {
      throw new ForbiddenException('Access denied');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: options.orgId,
        email: { equals: user.email.trim(), mode: 'insensitive' },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!customer) {
      throw new ForbiddenException('Access denied');
    }

    return {
      OR: [
        { customerId: customer.id },
        { assignedDriverId: customer.id },
        { allowedDrivers: { some: { customerId: customer.id } } },
      ],
    };
  }

  async assertSecondaryResourceInOrg(
    orgId: string,
    resource: {
      customerId?: string;
      vehicleId?: string;
      stationId?: string;
    },
  ): Promise<void> {
    if (resource.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: resource.customerId, organizationId: orgId },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }
    if (resource.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: resource.vehicleId, organizationId: orgId },
        select: { id: true },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }
    }
    if (resource.stationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: resource.stationId, organizationId: orgId },
        select: { id: true },
      });
      if (!station) {
        throw new NotFoundException('Station not found');
      }
    }
  }
}
