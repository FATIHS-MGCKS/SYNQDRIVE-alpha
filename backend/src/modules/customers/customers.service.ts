import { Injectable } from '@nestjs/common';
import { Customer, Prisma, TripAssignmentSubjectType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { DriverScoreService } from '../vehicle-intelligence/trips/driver-score.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driverScoreService: DriverScoreService,
  ) {}

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
    const [scoreMap, bookingAggMap] = await Promise.all([
      this.buildCustomerScoreMap(orgId, customerIds),
      this.buildBookingAggregateMap(orgId, customerIds),
    ]);

    const mapped = data.map((c) => {
      const score = scoreMap.get(c.id);
      return {
        ...c,
        bookingCount: c._count.bookings,
        drivingStyleScore: score?.drivingStyleScore ?? null,
        safetyScore: score?.safetyScore ?? null,
        scoreEligibleTripCount: score?.tripCount ?? 0,
        // V4.6.95 — confidence metadata derived by the unified
        // `DriverScoreService` aggregator. Frontend renders "—" /
        // "Not enough data" when these are low / not enough trips.
        scoredTripCount: score?.scoredTripCount ?? 0,
        safetyScoredTripCount: score?.safetyScoredTripCount ?? 0,
        totalDistanceKm: score?.totalDistanceKm ?? 0,
        hasEnoughData: score?.hasEnoughData ?? false,
        dataConfidence: score?.dataConfidence ?? 'none',
        // V4.6.66 — derived booking aggregates (null when the customer has no
        // completed or active bookings yet; UI renders an em-dash placeholder).
        totalRevenueCents: bookingAggMap.get(c.id)?.totalRevenueCents ?? 0,
        lastBookingDate: bookingAggMap.get(c.id)?.lastBookingDate ?? null,
        _count: undefined,
      };
    });

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

    const [scoreMap, bookingAggMap] = await Promise.all([
      this.buildCustomerScoreMap(orgId, [id]),
      this.buildBookingAggregateMap(orgId, [id]),
    ]);
    const score = scoreMap.get(id);
    const agg = bookingAggMap.get(id);
    return {
      ...customer,
      drivingStyleScore: score?.drivingStyleScore ?? null,
      safetyScore: score?.safetyScore ?? null,
      scoreEligibleTripCount: score?.tripCount ?? 0,
      // V4.6.95 — same confidence metadata that the list endpoint returns.
      scoredTripCount: score?.scoredTripCount ?? 0,
      safetyScoredTripCount: score?.safetyScoredTripCount ?? 0,
      totalDistanceKm: score?.totalDistanceKm ?? 0,
      hasEnoughData: score?.hasEnoughData ?? false,
      dataConfidence: score?.dataConfidence ?? 'none',
      totalRevenueCents: agg?.totalRevenueCents ?? 0,
      lastBookingDate: agg?.lastBookingDate ?? null,
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

  /**
   * V4.6.66 — aggregate bookings per customer to surface real revenue +
   * last-booking date on the customer list and detail endpoints. We skip
   * CANCELLED / NO_SHOW bookings so the revenue reflects actually billed
   * rentals. Uses `totalPriceCents` when present, otherwise falls back to
   * `dailyRateCents * durationDays` so the row still shows a plausible value
   * for legacy rentals that skipped the total computation.
   */
  private async buildBookingAggregateMap(
    orgId: string,
    customerIds: string[],
  ): Promise<Map<string, { totalRevenueCents: number; lastBookingDate: Date | null }>> {
    const map = new Map<string, { totalRevenueCents: number; lastBookingDate: Date | null }>();
    if (customerIds.length === 0) return map;

    const rows = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        customerId: { in: customerIds },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: {
        customerId: true,
        startDate: true,
        endDate: true,
        totalPriceCents: true,
        dailyRateCents: true,
      },
    });

    for (const row of rows) {
      const entry = map.get(row.customerId) ?? {
        totalRevenueCents: 0,
        lastBookingDate: null as Date | null,
      };
      let price = row.totalPriceCents ?? 0;
      if (!price && row.dailyRateCents && row.startDate && row.endDate) {
        const ms = row.endDate.getTime() - row.startDate.getTime();
        const days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
        price = row.dailyRateCents * days;
      }
      entry.totalRevenueCents += price;
      if (
        row.startDate &&
        (!entry.lastBookingDate || row.startDate > entry.lastBookingDate)
      ) {
        entry.lastBookingDate = row.startDate;
      }
      map.set(row.customerId, entry);
    }
    return map;
  }

  /**
   * V4.6.83 — subject-level score aggregation is consolidated onto the central
   * `DriverScoreService.getScoresForSubjects` path.
   *
   * Preserves the original filter rules:
   *   - completed trips only
   *   - `assignmentSubjectType = BOOKING_CUSTOMER` and `assignmentSubjectId IN (customerIds)`
   *   - `isPrivateTrip = false`
   *   - averages only over trips that have a persisted `TripDrivingImpact` row
   *     (matches prior behavior, where missing impact → null field in the mean)
   *
   * No second parallel score formula lives in this service anymore.
   */
  private async buildCustomerScoreMap(
    orgId: string,
    customerIds: string[],
  ): Promise<
    Map<
      string,
      {
        tripCount: number;
        scoredTripCount: number;
        safetyScoredTripCount: number;
        totalDistanceKm: number;
        drivingStyleScore: number | null;
        safetyScore: number | null;
        hasEnoughData: boolean;
        dataConfidence: 'none' | 'low' | 'medium' | 'high';
      }
    >
  > {
    const map = new Map<
      string,
      {
        tripCount: number;
        scoredTripCount: number;
        safetyScoredTripCount: number;
        totalDistanceKm: number;
        drivingStyleScore: number | null;
        safetyScore: number | null;
        hasEnoughData: boolean;
        dataConfidence: 'none' | 'low' | 'medium' | 'high';
      }
    >();
    if (customerIds.length === 0) return map;

    const orgCustomerIds = await this.prisma.customer
      .findMany({
        where: { organizationId: orgId, id: { in: customerIds } },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    if (orgCustomerIds.length === 0) return map;

    const scores = await this.driverScoreService.getScoresForSubjects(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
      orgCustomerIds,
    );

    for (const customerId of customerIds) {
      const summary = scores.get(customerId);
      map.set(customerId, {
        tripCount: summary?.tripCount ?? 0,
        scoredTripCount: summary?.scoredTripCount ?? 0,
        safetyScoredTripCount: summary?.safetyScoredTripCount ?? 0,
        totalDistanceKm: summary?.totalDistanceKm ?? 0,
        drivingStyleScore: summary?.drivingStyleScore ?? null,
        safetyScore: summary?.safetyScore ?? null,
        hasEnoughData: summary?.hasEnoughData ?? false,
        dataConfidence: summary?.dataConfidence ?? 'none',
      });
    }
    return map;
  }
}
