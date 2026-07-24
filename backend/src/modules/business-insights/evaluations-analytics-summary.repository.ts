import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  resolveZonedCalendarDayWindow,
  zonedLookbackStart,
} from '@modules/bookings/booking-day-window.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import {
  EXPENSE_EXCLUDED_STATUSES,
  isIncomingInvoiceType,
  isOutgoingInvoiceType,
  REVENUE_EXCLUDED_STATUSES,
} from '@modules/invoices/invoice-domain.util';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import {
  resolveStationBookingScope,
  resolveVehicleScopeConstraint,
} from '@synq/evaluations-insights/evaluations-analytics-filters';
import type {
  EvaluationsBookingSnapshot,
  EvaluationsFinancialSnapshot,
  EvaluationsFleetSnapshot,
} from '@synq/evaluations-insights/evaluations-analytics-summary.contract';

interface InvoiceRow {
  type: string;
  status: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number | null;
  dueDate: Date | null;
  invoiceDate: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  currency: string | null;
  vehicleId: string | null;
}

@Injectable()
export class EvaluationsAnalyticsSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrgTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  async resolveStationVehicleIds(
    organizationId: string,
    stationId: string,
  ): Promise<string[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: [{ homeStationId: stationId }, { currentStationId: stationId }],
      },
      select: { id: true },
    });
    return vehicles.map((v) => v.id);
  }

  async loadFinancialSnapshot(
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<EvaluationsFinancialSnapshot> {
    const now = new Date();
    const vehicleScope = resolveVehicleScopeConstraint(resolved);
    const vehicleFilter =
      vehicleScope.mode === 'scoped'
        ? { vehicleId: { in: vehicleScope.vehicleIds } }
        : vehicleScope.mode === 'empty'
          ? { vehicleId: { in: [] as string[] } }
          : {};

    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId: resolved.organizationId,
        ...vehicleFilter,
      },
      select: {
        type: true,
        status: true,
        totalCents: true,
        paidCents: true,
        outstandingCents: true,
        dueDate: true,
        invoiceDate: true,
        paidAt: true,
        createdAt: true,
        currency: true,
        vehicleId: true,
      },
    });

    const currentFrom = new Date(resolved.period.from);
    const currentTo = new Date(resolved.period.to);
    const previousFrom = new Date(resolved.comparisonPeriod.from);
    const previousTo = new Date(resolved.comparisonPeriod.to);

    let revenueMtdMinor = 0;
    let revenuePreviousMinor = 0;
    let expensesMtdMinor = 0;
    let expensesPreviousMinor = 0;
    let paidRevenueMtdMinor = 0;
    let openReceivablesMinor = 0;
    let overdueReceivablesMinor = 0;
    let openReceivablesCount = 0;
    let overdueReceivablesCount = 0;

    const openExcluded = new Set([
      'DRAFT',
      'CANCELLED',
      'VOID',
      'CREDITED',
      'REJECTED',
      'UPLOADED',
      'NEEDS_REVIEW',
    ]);

    for (const inv of invoices as InvoiceRow[]) {
      const currency = (inv.currency ?? 'EUR').toUpperCase();
      if (currency !== 'EUR' && currency !== '€') continue;

      const effectiveDate = inv.invoiceDate ?? inv.createdAt;
      const isOut = isOutgoingInvoiceType(inv.type);
      const isIn = isIncomingInvoiceType(inv.type);

      if (isOut && !REVENUE_EXCLUDED_STATUSES.includes(inv.status as never)) {
        if (effectiveDate >= currentFrom && effectiveDate <= currentTo) {
          revenueMtdMinor += inv.totalCents;
        }
        if (effectiveDate >= previousFrom && effectiveDate <= previousTo) {
          revenuePreviousMinor += inv.totalCents;
        }
      }

      if (isOut && inv.status === 'PAID' && inv.paidAt) {
        if (inv.paidAt >= currentFrom && inv.paidAt <= currentTo) {
          paidRevenueMtdMinor += inv.paidCents || inv.totalCents;
        }
      }

      if (isIn && !EXPENSE_EXCLUDED_STATUSES.includes(inv.status as never)) {
        if (effectiveDate >= currentFrom && effectiveDate <= currentTo) {
          expensesMtdMinor += inv.totalCents;
        }
        if (effectiveDate >= previousFrom && effectiveDate <= previousTo) {
          expensesPreviousMinor += inv.totalCents;
        }
      }

      const outstanding =
        inv.outstandingCents ?? Math.max(0, inv.totalCents - inv.paidCents);
      if (isOut && outstanding > 0 && !openExcluded.has(inv.status)) {
        openReceivablesMinor += outstanding;
        openReceivablesCount += 1;
        if (
          inv.dueDate &&
          inv.dueDate < now &&
          !['PAID', 'CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(inv.status)
        ) {
          overdueReceivablesMinor += outstanding;
          overdueReceivablesCount += 1;
        }
      }
    }

    return {
      revenueMtdMinor,
      revenuePreviousMinor,
      expensesMtdMinor,
      expensesPreviousMinor,
      paidRevenueMtdMinor,
      openReceivablesMinor,
      overdueReceivablesMinor,
      openReceivablesCount,
      overdueReceivablesCount,
      currency: 'EUR',
    };
  }

  async loadBookingSnapshot(
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<EvaluationsBookingSnapshot> {
    const timezone = resolved.period.timezone;
    const now = new Date();
    const { todayStart, todayEnd } = resolveZonedCalendarDayWindow(now, timezone);
    const currentFrom = new Date(resolved.period.from);
    const currentTo = new Date(resolved.period.to);
    const previousFrom = new Date(resolved.comparisonPeriod.from);
    const previousTo = new Date(resolved.comparisonPeriod.to);

    const andFilters: Array<Record<string, unknown>> = [{ organizationId: resolved.organizationId }];
    if (resolved.bookingStatus) {
      andFilters.push({ status: resolved.bookingStatus });
    }
    const stationScope = resolveStationBookingScope(resolved);
    if (stationScope.mode === 'scoped') {
      andFilters.push({
        OR: [
          { pickupStationId: { in: stationScope.stationIds } },
          { returnStationId: { in: stationScope.stationIds } },
        ],
      });
    } else if (stationScope.mode === 'empty') {
      andFilters.push({ id: { in: [] as string[] } });
    }
    const vehicleScope = resolveVehicleScopeConstraint(resolved);
    if (vehicleScope.mode === 'scoped') {
      andFilters.push({ vehicleId: { in: vehicleScope.vehicleIds } });
    } else if (vehicleScope.mode === 'empty') {
      andFilters.push({ vehicleId: { in: [] as string[] } });
    }
    if (resolved.customerSegment) {
      andFilters.push({ customer: { customerType: resolved.customerSegment } });
    }
    const baseWhere = { AND: andFilters };

    const [active, pending, completed, completedToday, completedMtd, completedPrevious] =
      await Promise.all([
        this.prisma.booking.count({
          where: { ...baseWhere, status: 'ACTIVE' },
        }),
        this.prisma.booking.count({
          where: { ...baseWhere, status: 'PENDING' },
        }),
        this.prisma.booking.count({
          where: { ...baseWhere, status: 'COMPLETED' },
        }),
        this.prisma.booking.findMany({
          where: {
            ...baseWhere,
            status: 'COMPLETED',
            completedAt: { gte: todayStart, lte: todayEnd },
          },
          select: { totalPriceCents: true },
        }),
        this.prisma.booking.findMany({
          where: {
            ...baseWhere,
            status: 'COMPLETED',
            completedAt: { gte: currentFrom, lte: currentTo },
          },
          select: { totalPriceCents: true },
        }),
        this.prisma.booking.findMany({
          where: {
            ...baseWhere,
            status: 'COMPLETED',
            completedAt: { gte: previousFrom, lte: previousTo },
          },
          select: { totalPriceCents: true },
        }),
      ]);

    const sumMinor = (rows: Array<{ totalPriceCents: number | null }>) =>
      rows.reduce((acc, row) => acc + (row.totalPriceCents ?? 0), 0);

    return {
      active,
      pending,
      completed,
      revenueTodayMinor: sumMinor(completedToday),
      revenueMtdMinor: sumMinor(completedMtd),
      revenuePreviousMinor: sumMinor(completedPrevious),
      currency: 'EUR',
    };
  }

  async loadFleetSnapshot(
    resolved: ResolvedEvaluationsAnalyticsFilters,
    lookbackDays = 7,
  ): Promise<EvaluationsFleetSnapshot> {
    const timezone = resolved.period.timezone;
    const andFilters: Array<Record<string, unknown>> = [
      { organizationId: resolved.organizationId },
    ];
    const stationScope = resolveStationBookingScope(resolved);
    if (stationScope.mode === 'scoped') {
      andFilters.push({
        OR: [
          { homeStationId: { in: stationScope.stationIds } },
          { currentStationId: { in: stationScope.stationIds } },
        ],
      });
    } else if (stationScope.mode === 'empty') {
      andFilters.push({ id: { in: [] as string[] } });
    }
    if (resolved.vehicleClassId) {
      andFilters.push({ rentalCategoryId: resolved.vehicleClassId });
    }
    if (resolved.vehicleStatus) {
      andFilters.push({ status: resolved.vehicleStatus });
    }
    const vehicleScope = resolveVehicleScopeConstraint(resolved);
    if (vehicleScope.mode === 'scoped') {
      andFilters.push({ id: { in: vehicleScope.vehicleIds } });
    } else if (vehicleScope.mode === 'empty') {
      andFilters.push({ id: { in: [] as string[] } });
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { AND: andFilters },
      select: { id: true, status: true, cleaningStatus: true },
    });

    const counts = {
      total: vehicles.length,
      available: 0,
      rented: 0,
      reserved: 0,
      maintenance: 0,
      blocked: 0,
      other: 0,
      cleaningRequired: 0,
    };

    for (const v of vehicles) {
      switch (v.status) {
        case 'AVAILABLE':
          counts.available += 1;
          break;
        case 'RENTED':
          counts.rented += 1;
          break;
        case 'RESERVED':
          counts.reserved += 1;
          break;
        case 'IN_SERVICE':
          counts.maintenance += 1;
          break;
        case 'OUT_OF_SERVICE':
          counts.blocked += 1;
          break;
        default:
          counts.other += 1;
          break;
      }
      if (v.cleaningStatus && v.cleaningStatus !== 'CLEAN') {
        counts.cleaningRequired += 1;
      }
    }

    const vehicleIds = vehicles.map((v) => v.id);
    let underutilized = 0;
    if (vehicleIds.length > 0) {
      const { dateOnly } = resolveZonedCalendarDayWindow(new Date(), timezone);
      const lookbackStart = zonedLookbackStart(dateOnly, lookbackDays, timezone);
      const lookAhead = new Date(Date.now() + 7 * 86400_000);

      const [recentBookings, upcomingBookings] = await Promise.all([
        this.prisma.booking.groupBy({
          by: ['vehicleId'],
          where: {
            organizationId: resolved.organizationId,
            vehicleId: { in: vehicleIds },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            endDate: { gte: lookbackStart },
            startDate: { lte: new Date() },
          },
          _count: { id: true },
        }),
        this.prisma.booking.groupBy({
          by: ['vehicleId'],
          where: {
            organizationId: resolved.organizationId,
            vehicleId: { in: vehicleIds },
            status: { in: ['CONFIRMED', 'PENDING'] },
            startDate: { gte: new Date(), lte: lookAhead },
          },
          _count: { id: true },
        }),
      ]);

      const recentSet = new Set(recentBookings.map((r) => r.vehicleId));
      const upcomingSet = new Set(upcomingBookings.map((r) => r.vehicleId));

      for (const v of vehicles) {
        if (!['AVAILABLE', 'RENTED'].includes(v.status)) continue;
        if (!recentSet.has(v.id) && !upcomingSet.has(v.id)) {
          underutilized += 1;
        }
      }
    }

    return { ...counts, underutilized };
  }
}
