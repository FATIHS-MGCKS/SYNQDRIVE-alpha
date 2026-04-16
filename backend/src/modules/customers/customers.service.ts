import { Injectable } from '@nestjs/common';
import { Customer, Prisma, TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, data: Omit<Prisma.CustomerCreateInput, 'organization'>): Promise<Customer> {
    return this.prisma.customer.create({
      data: { ...data, organization: { connect: { id: orgId } } },
    });
  }

  async findAll(orgId: string, params?: PaginationParams) {
    const { skip, take } = parsePagination(params || {});
    const where = { organizationId: orgId };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { bookings: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const customerIds = data.map((c) => c.id);
    const scoreMap = await this.buildCustomerScoreMap(orgId, customerIds);

    const mapped = data.map((c) => ({
      ...c,
      bookingCount: c._count.bookings,
      drivingStyleScore: scoreMap.get(c.id)?.drivingStyleScore ?? null,
      safetyScore: scoreMap.get(c.id)?.safetyScore ?? null,
      scoreEligibleTripCount: scoreMap.get(c.id)?.tripCount ?? 0,
      _count: undefined,
    }));

    return buildPaginatedResult(mapped, total, params || {});
  }

  async findById(orgId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId },
      include: {
        bookings: {
          orderBy: { startDate: 'desc' },
          include: { vehicle: true },
        },
      },
    });
    if (!customer) return null;

    const scoreMap = await this.buildCustomerScoreMap(orgId, [id]);
    const score = scoreMap.get(id);
    return {
      ...customer,
      drivingStyleScore: score?.drivingStyleScore ?? null,
      safetyScore: score?.safetyScore ?? null,
      scoreEligibleTripCount: score?.tripCount ?? 0,
    };
  }

  async update(
    orgId: string,
    id: string,
    data: Prisma.CustomerUpdateInput,
  ): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });
    return this.prisma.customer.update({ where: { id }, data });
  }

  async softDelete(orgId: string, id: string): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async getCustomerStats(orgId: string) {
    const [total, active, inactive] = await Promise.all([
      this.prisma.customer.count({ where: { organizationId: orgId } }),
      this.prisma.customer.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { organizationId: orgId, status: 'INACTIVE' } }),
    ]);
    return { total, active, inactive };
  }

  private async buildCustomerScoreMap(
    orgId: string,
    customerIds: string[],
  ): Promise<Map<string, { tripCount: number; drivingStyleScore: number | null; safetyScore: number | null }>> {
    const map = new Map<string, { tripCount: number; drivingStyleScore: number | null; safetyScore: number | null }>();
    if (customerIds.length === 0) return map;

    const assignedTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId: orgId },
        tripStatus: TripStatus.COMPLETED,
        isPrivateTrip: false,
        assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
        assignmentSubjectId: { in: customerIds },
      },
      select: { id: true, assignmentSubjectId: true },
    });
    if (assignedTrips.length === 0) return map;

    const impacts = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: assignedTrips.map((trip) => trip.id) } },
      select: { tripId: true, drivingStyleScore: true, safetyScore: true },
    });
    const impactByTripId = new Map(impacts.map((row) => [row.tripId, row]));
    const grouped = new Map<string, Array<{ drivingStyleScore: number | null; safetyScore: number | null }>>();

    for (const trip of assignedTrips) {
      const customerId = trip.assignmentSubjectId ?? '';
      if (!customerId) continue;
      const rows = grouped.get(customerId) ?? [];
      rows.push({
        drivingStyleScore: impactByTripId.get(trip.id)?.drivingStyleScore ?? null,
        safetyScore: impactByTripId.get(trip.id)?.safetyScore ?? null,
      });
      grouped.set(customerId, rows);
    }

    for (const customerId of customerIds) {
      const rows = grouped.get(customerId) ?? [];
      const styleValues = rows
        .map((row) => row.drivingStyleScore)
        .filter((value): value is number => value != null);
      const safetyValues = rows
        .map((row) => row.safetyScore)
        .filter((value): value is number => value != null);
      map.set(customerId, {
        tripCount: rows.length,
        drivingStyleScore:
          styleValues.length > 0
            ? Math.round((styleValues.reduce((sum, value) => sum + value, 0) / styleValues.length) * 100) / 100
            : null,
        safetyScore:
          safetyValues.length > 0
            ? Math.round((safetyValues.reduce((sum, value) => sum + value, 0) / safetyValues.length) * 100) / 100
            : null,
      });
    }
    return map;
  }
}
