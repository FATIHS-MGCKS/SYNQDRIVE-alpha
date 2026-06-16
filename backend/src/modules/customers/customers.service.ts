import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Customer,
  CustomerRiskSource,
  CustomerStatus,
  Prisma,
  TripAssignmentSubjectType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginatedResult,
} from '@shared/utils/pagination';
import { DriverScoreService } from '../vehicle-intelligence/trips/driver-score.service';
import {
  ArchiveCustomerDto,
  CheckCustomerDuplicatesQueryDto,
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
  UpdateCustomerRiskDto,
  UpdateCustomerStatusDto,
} from './dto';
import { buildCustomerNormalizedFields } from './utils/customer-normalizer.util';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerEligibilityService } from './customer-eligibility.service';

export type DuplicateMatch = {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  matchType: 'hard' | 'soft';
  matchReason: string;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driverScoreService: DriverScoreService,
    private readonly timeline: CustomerTimelineService,
    private readonly eligibility: CustomerEligibilityService,
  ) {}

  async create(orgId: string, dto: CreateCustomerDto, userId?: string): Promise<Customer> {
    const duplicates = await this.findPotentialDuplicates(orgId, dto);
    const hard = duplicates.filter((d) => d.matchType === 'hard');
    if (hard.length > 0 && !dto.allowDuplicateOverride) {
      throw new ConflictException({
        code: 'CUSTOMER_DUPLICATE_DETECTED',
        message: 'A customer with matching identity data already exists',
        duplicates: hard,
      });
    }

    const normalized = buildCustomerNormalizedFields({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      licenseNumber: dto.licenseNumber,
      idNumber: dto.idNumber,
    });

    const customer = await this.prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        zip: dto.postalCode?.trim() || null,
        country: dto.country?.trim() || null,
        company: dto.companyName?.trim() || null,
        taxId: dto.taxId?.trim() || null,
        customerType: dto.customerType ?? 'INDIVIDUAL',
        licenseNumber: dto.licenseNumber?.trim() || null,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        idNumber: dto.idNumber?.trim() || null,
        idExpiry: dto.idExpiry ? new Date(dto.idExpiry) : null,
        notes: dto.notes?.trim() || null,
        ...normalized,
        // Risk is never client-set on create.
        riskLevel: 'NOT_ASSESSED',
        riskSource: 'NONE',
      },
    });

    await this.timeline.addEvent(
      orgId,
      customer.id,
      'CREATED',
      'Customer created',
      { customerId: customer.id },
      userId,
    );

    return customer;
  }

  async findAll(
    orgId: string,
    params?: ListCustomersQueryDto,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { skip, take } = parsePagination(params || {});
    const where: Prisma.CustomerWhereInput = { organizationId: orgId };

    if (!params?.includeArchived) {
      where.archivedAt = null;
    }

    if (params?.status) where.status = params.status;
    if (params?.riskLevel) where.riskLevel = params.riskLevel;
    if (params?.customerType) where.customerType = params.customerType;

    if (params?.verificationStatus) {
      if (params.verificationTarget === 'license') {
        where.licenseVerificationStatus = params.verificationStatus;
      } else {
        where.idVerificationStatus = params.verificationStatus;
      }
    }

    if (params?.licenseExpiringBefore) {
      where.licenseExpiry = {
        lte: new Date(params.licenseExpiringBefore),
      };
    }

    if (params?.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { fullNameNormalized: { contains: q.toLowerCase(), mode: 'insensitive' } },
        { emailNormalized: { contains: q.toLowerCase(), mode: 'insensitive' } },
        { phoneNormalized: { contains: q.replace(/\D/g, '') } },
        { licenseNumberNormalized: { contains: q.replace(/\s+/g, '').toUpperCase() } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { licenseNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

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
        drivingStressScore: score?.drivingStressScore ?? null,
        stressLevel: score?.stressLevel ?? null,
        /** @deprecated Use drivingStressScore */
        drivingStyleScore: score?.drivingStressScore ?? null,
        scoreEligibleTripCount: score?.tripCount ?? 0,
        scoredTripCount: score?.scoredTripCount ?? 0,
        totalDistanceKm: score?.totalDistanceKm ?? 0,
        hasEnoughData: score?.hasEnoughData ?? false,
        dataConfidence: score?.dataConfidence ?? 'none',
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
        documents: { orderBy: { createdAt: 'desc' } },
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
      drivingStressScore: score?.drivingStressScore ?? null,
      stressLevel: score?.stressLevel ?? null,
      drivingStyleScore: score?.drivingStressScore ?? null,
      scoreEligibleTripCount: score?.tripCount ?? 0,
      scoredTripCount: score?.scoredTripCount ?? 0,
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
    dto: UpdateCustomerDto,
    userId?: string,
  ): Promise<Customer> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    const duplicates = await this.findPotentialDuplicates(orgId, dto, id);
    const hard = duplicates.filter((d) => d.matchType === 'hard');
    if (hard.length > 0 && !dto.allowDuplicateOverride) {
      throw new ConflictException({
        code: 'CUSTOMER_DUPLICATE_DETECTED',
        message: 'A customer with matching identity data already exists',
        duplicates: hard,
      });
    }

    const firstName = dto.firstName?.trim() ?? existing.firstName;
    const lastName = dto.lastName?.trim() ?? existing.lastName;
    const normalized = buildCustomerNormalizedFields({
      firstName,
      lastName,
      email: dto.email !== undefined ? dto.email : existing.email,
      phone: dto.phone !== undefined ? dto.phone : existing.phone,
      licenseNumber:
        dto.licenseNumber !== undefined
          ? dto.licenseNumber
          : existing.licenseNumber,
      idNumber: dto.idNumber !== undefined ? dto.idNumber : existing.idNumber,
    });

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName.trim() }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        }),
        ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
        ...(dto.city !== undefined && { city: dto.city?.trim() || null }),
        ...(dto.postalCode !== undefined && { zip: dto.postalCode?.trim() || null }),
        ...(dto.country !== undefined && { country: dto.country?.trim() || null }),
        ...(dto.companyName !== undefined && {
          company: dto.companyName?.trim() || null,
        }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId?.trim() || null }),
        ...(dto.customerType !== undefined && { customerType: dto.customerType }),
        ...(dto.licenseNumber !== undefined && {
          licenseNumber: dto.licenseNumber?.trim() || null,
        }),
        ...(dto.licenseExpiry !== undefined && {
          licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : null,
        }),
        ...(dto.idNumber !== undefined && {
          idNumber: dto.idNumber?.trim() || null,
        }),
        ...(dto.idExpiry !== undefined && {
          idExpiry: dto.idExpiry ? new Date(dto.idExpiry) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        ...normalized,
      },
    });

    await this.timeline.addEvent(
      orgId,
      id,
      'UPDATED',
      'Customer updated',
      undefined,
      userId,
    );

    return customer;
  }

  async updateStatus(
    orgId: string,
    id: string,
    dto: UpdateCustomerStatusDto,
    userId?: string,
  ): Promise<Customer> {
    const existing = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.timeline.addEvent(
      orgId,
      id,
      'STATUS_CHANGED',
      `Status changed to ${dto.status}`,
      {
        from: existing.status,
        to: dto.status,
        reason: dto.reason ?? null,
      },
      userId,
    );

    return customer;
  }

  async updateRisk(
    orgId: string,
    id: string,
    dto: UpdateCustomerRiskDto,
    userId?: string,
  ): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        riskLevel: dto.riskLevel,
        riskSource: CustomerRiskSource.MANUAL,
        riskReason: dto.riskReason?.trim() || null,
        riskUpdatedAt: new Date(),
        riskUpdatedByUserId: userId ?? null,
      },
    });

    await this.timeline.addEvent(
      orgId,
      id,
      'RISK_CHANGED',
      `Risk set to ${dto.riskLevel}`,
      { riskLevel: dto.riskLevel, riskReason: dto.riskReason ?? null },
      userId,
    );

    return customer;
  }

  async archiveCustomer(
    orgId: string,
    id: string,
    dto?: ArchiveCustomerDto,
    userId?: string,
  ): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archivedByUserId: userId ?? null,
        archiveReason: dto?.reason?.trim() || null,
      },
    });

    await this.timeline.addEvent(
      orgId,
      id,
      'STATUS_CHANGED',
      'Customer archived',
      { reason: dto?.reason ?? null },
      userId,
    );

    return customer;
  }

  /** @deprecated Use archiveCustomer */
  async softDelete(orgId: string, id: string, userId?: string): Promise<Customer> {
    return this.archiveCustomer(orgId, id, undefined, userId);
  }

  async getEligibility(orgId: string, id: string, startDate?: string) {
    return this.eligibility.evaluateForBooking(orgId, id, {
      startDate: startDate ? new Date(startDate) : new Date(),
    });
  }

  async findPotentialDuplicates(
    orgId: string,
    dto: CreateCustomerDto | UpdateCustomerDto | CheckCustomerDuplicatesQueryDto,
    excludeCustomerId?: string,
  ): Promise<DuplicateMatch[]> {
    const normalized = buildCustomerNormalizedFields({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      licenseNumber: dto.licenseNumber,
      idNumber: 'idNumber' in dto ? dto.idNumber : undefined,
    });

    const matches: DuplicateMatch[] = [];
    const baseWhere: Prisma.CustomerWhereInput = {
      organizationId: orgId,
      archivedAt: null,
      ...(excludeCustomerId && { id: { not: excludeCustomerId } }),
    };

    const pushMatch = (
      row: Customer,
      matchType: 'hard' | 'soft',
      matchReason: string,
    ) => {
      if (matches.some((m) => m.customerId === row.id)) return;
      matches.push({
        customerId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        matchType,
        matchReason,
      });
    };

    if (normalized.emailNormalized) {
      const rows = await this.prisma.customer.findMany({
        where: { ...baseWhere, emailNormalized: normalized.emailNormalized },
      });
      rows.forEach((r) => pushMatch(r, 'hard', 'Same email'));
    }

    if (normalized.licenseNumberNormalized) {
      const rows = await this.prisma.customer.findMany({
        where: {
          ...baseWhere,
          licenseNumberNormalized: normalized.licenseNumberNormalized,
        },
      });
      rows.forEach((r) => pushMatch(r, 'hard', 'Same license number'));
    }

    if (normalized.idNumberNormalized) {
      const rows = await this.prisma.customer.findMany({
        where: { ...baseWhere, idNumberNormalized: normalized.idNumberNormalized },
      });
      rows.forEach((r) => pushMatch(r, 'hard', 'Same ID number'));
    }

    if (
      normalized.fullNameNormalized &&
      dto.dateOfBirth &&
      'dateOfBirth' in dto &&
      dto.dateOfBirth
    ) {
      const rows = await this.prisma.customer.findMany({
        where: {
          ...baseWhere,
          fullNameNormalized: normalized.fullNameNormalized,
          dateOfBirth: new Date(dto.dateOfBirth),
        },
      });
      rows.forEach((r) =>
        pushMatch(r, 'soft', 'Same name and date of birth'),
      );
    }

    if (normalized.phoneNormalized && normalized.phoneNormalized.length >= 6) {
      const rows = await this.prisma.customer.findMany({
        where: {
          ...baseWhere,
          phoneNormalized: normalized.phoneNormalized,
        },
      });
      rows.forEach((r) => pushMatch(r, 'soft', 'Same phone number'));
    }

    return matches;
  }

  async getCustomerStats(orgId: string) {
    const now = new Date();
    const warnDays = 30;
    const licenseSoon = new Date(now);
    licenseSoon.setDate(licenseSoon.getDate() + warnDays);

    const base = { organizationId: orgId, archivedAt: null };

    const [
      total,
      active,
      underReview,
      blocked,
      suspended,
      archived,
      notAssessed,
      highRisk,
      pendingVerification,
      verified,
      licenseExpired,
      licenseExpiringSoon,
      customersWithOpenInvoices,
      customersWithOpenFines,
      repeatCustomers,
    ] = await Promise.all([
      this.prisma.customer.count({ where: base }),
      this.prisma.customer.count({
        where: { ...base, status: CustomerStatus.ACTIVE },
      }),
      this.prisma.customer.count({
        where: { ...base, status: CustomerStatus.UNDER_REVIEW },
      }),
      this.prisma.customer.count({
        where: { ...base, status: CustomerStatus.BLOCKED },
      }),
      this.prisma.customer.count({
        where: { ...base, status: CustomerStatus.SUSPENDED },
      }),
      this.prisma.customer.count({
        where: { organizationId: orgId, archivedAt: { not: null } },
      }),
      this.prisma.customer.count({
        where: { ...base, riskLevel: 'NOT_ASSESSED' },
      }),
      this.prisma.customer.count({
        where: { ...base, riskLevel: 'HIGH' },
      }),
      this.prisma.customer.count({
        where: {
          ...base,
          OR: [
            { idVerificationStatus: 'PENDING_REVIEW' },
            { licenseVerificationStatus: 'PENDING_REVIEW' },
          ],
        },
      }),
      this.prisma.customer.count({
        where: {
          ...base,
          idVerificationStatus: 'VERIFIED',
          licenseVerificationStatus: 'VERIFIED',
        },
      }),
      this.prisma.customer.count({
        where: {
          ...base,
          licenseExpiry: { lt: now },
        },
      }),
      this.prisma.customer.count({
        where: {
          ...base,
          licenseExpiry: { gte: now, lte: licenseSoon },
        },
      }),
      this.prisma.orgInvoice
        .groupBy({
          by: ['customerId'],
          where: {
            organizationId: orgId,
            customerId: { not: null },
            status: { in: ['SENT', 'OVERDUE'] },
          },
        })
        .then((g) => g.length),
      this.prisma.fine
        .groupBy({
          by: ['customerId'],
          where: {
            organizationId: orgId,
            customerId: { not: null },
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        })
        .then((g) => g.length),
      this.prisma.booking
        .groupBy({
          by: ['customerId'],
          where: {
            organizationId: orgId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          _count: { customerId: true },
        })
        .then((rows) => rows.filter((r) => r._count.customerId > 1).length),
    ]);

    return {
      total,
      active,
      underReview,
      blocked,
      suspended,
      archived,
      notAssessed,
      highRisk,
      pendingVerification,
      verified,
      licenseExpired,
      licenseExpiringSoon,
      customersWithOpenInvoices,
      customersWithOpenFines,
      repeatCustomers,
    };
  }

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

  private async buildCustomerScoreMap(
    orgId: string,
    customerIds: string[],
  ): Promise<
    Map<
      string,
      {
        tripCount: number;
        scoredTripCount: number;
        totalDistanceKm: number;
        drivingStressScore: number | null;
        stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
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
        totalDistanceKm: number;
        drivingStressScore: number | null;
        stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
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
        totalDistanceKm: summary?.totalDistanceKm ?? 0,
        drivingStressScore: summary?.drivingStressScore ?? null,
        stressLevel: summary?.stressLevel ?? null,
        hasEnoughData: summary?.hasEnoughData ?? false,
        dataConfidence: summary?.dataConfidence ?? 'none',
      });
    }
    return map;
  }
}
