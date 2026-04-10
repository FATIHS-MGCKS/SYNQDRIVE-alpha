import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Booking, Prisma, BookingStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalDrivingAnalysisService } from '../rental-driving-analysis/rental-driving-analysis.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

const BOOKING_STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Cancelled',
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalDrivingAnalysisService: RentalDrivingAnalysisService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService,
  ) {}

  async create(orgId: string, data: Omit<Prisma.BookingCreateInput, 'organization'>): Promise<Booking> {
    const booking = await this.prisma.booking.create({
      data: { ...data, organization: { connect: { id: orgId } } },
    });

    this.invoicesService.createBookingInvoice(orgId, {
      id: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      totalPriceCents: booking.totalPriceCents,
      dailyRateCents: booking.dailyRateCents,
      startDate: booking.startDate,
      endDate: booking.endDate,
      currency: booking.currency,
      kmIncluded: booking.kmIncluded,
    }).catch(() => {});

    return booking;
  }

  async findAll(orgId: string, params?: PaginationParams) {
    const { skip, take } = parsePagination(params || {});
    const where = { organizationId: orgId };
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { startDate: 'desc' },
        include: { customer: true, vehicle: true },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const stationIds = [
      ...new Set(
        data.flatMap((b) =>
          [b.pickupStationId, b.returnStationId].filter(Boolean) as string[],
        ),
      ),
    ];

    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    const mapped = data.map((b) => ({
      id: b.id,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: b.pickupStationId ? stationMap.get(b.pickupStationId) || '' : '',
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      totalPrice: (b.totalPriceCents || 0) / 100,
      kmIncluded: b.kmIncluded || 0,
      kmDriven: b.kmDriven || 0,
      insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
      extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
    }));

    return buildPaginatedResult(mapped, total, params || {});
  }

  async findById(orgId: string, id: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: true, vehicle: true },
    });

    if (!b) return null;

    let stationName = '';
    if (b.pickupStationId) {
      const station = await this.prisma.station.findUnique({
        where: { id: b.pickupStationId },
      });
      stationName = station?.name || '';
    }

    return {
      id: b.id,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: stationName,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      totalPrice: (b.totalPriceCents || 0) / 100,
      kmIncluded: b.kmIncluded || 0,
      kmDriven: b.kmDriven || 0,
      insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
      extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
    };
  }

  async findTodaysPickups(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const data = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        startDate: { gte: todayStart, lte: todayEnd },
        status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
      },
      include: { customer: true, vehicle: true },
      orderBy: { startDate: 'asc' },
    });

    const stationIds = [
      ...new Set(data.map((b) => b.pickupStationId).filter(Boolean) as string[]),
    ];
    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    return data.map((b) => ({
      id: b.id,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: b.pickupStationId ? stationMap.get(b.pickupStationId) || '' : '',
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      totalPrice: (b.totalPriceCents || 0) / 100,
    }));
  }

  async findTodaysReturns(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const data = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        endDate: { gte: todayStart, lte: todayEnd },
        status: { in: ['ACTIVE', 'CONFIRMED'] as BookingStatus[] },
      },
      include: { customer: true, vehicle: true },
      orderBy: { endDate: 'asc' },
    });

    const stationIds = [
      ...new Set(data.map((b) => b.returnStationId).filter(Boolean) as string[]),
    ];
    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    return data.map((b) => ({
      id: b.id,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: b.returnStationId ? stationMap.get(b.returnStationId) || '' : '',
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      totalPrice: (b.totalPriceCents || 0) / 100,
    }));
  }

  async getBookingStats(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [active, pending, completed, completedToday, completedMtd] = await Promise.all([
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'ACTIVE' },
      }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'PENDING' },
      }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'COMPLETED' },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        select: { totalPriceCents: true },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          completedAt: { gte: monthStart, lte: todayEnd },
        },
        select: { totalPriceCents: true },
      }),
    ]);

    const revenueToday =
      completedToday.reduce((sum, b) => sum + (b.totalPriceCents || 0), 0) / 100;
    const revenueMtd =
      completedMtd.reduce((sum, b) => sum + (b.totalPriceCents || 0), 0) / 100;

    return { active, pending, completed, revenueToday, revenueMtd };
  }

  async update(
    orgId: string,
    id: string,
    data: Prisma.BookingUpdateInput,
  ): Promise<Booking> {
    await this.prisma.booking.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });
    const updated = await this.prisma.booking.update({ where: { id }, data });
    if (updated.status === 'COMPLETED') {
      this.rentalDrivingAnalysisService.generateForBooking(orgId, id).catch(() => {});
    }
    return updated;
  }

  async cancel(orgId: string, id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id, organizationId: orgId },
      include: { vehicle: true },
    });

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED' as BookingStatus,
          cancelledAt: new Date(),
        },
      }),
      this.prisma.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'AVAILABLE' as VehicleStatus },
      }),
    ]);

    return updated;
  }
}
