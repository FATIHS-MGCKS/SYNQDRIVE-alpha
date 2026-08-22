import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { EvaluationsInsightsRepository } from '@modules/evaluations-analytics/e4/evaluations-insights.repository';
import { isWizardDraftBooking } from '@modules/bookings/booking-wizard-draft.util';
import type { E4UtilizationVehicleFacts } from '@modules/evaluations-analytics/e4/evaluations-insights.repository';
import type { DashboardUtilizationOverview } from './dashboard-utilization.types';
import {
  computeBookingDeltaPercent,
  computeUtilizationDeltaPp,
  computeWindowUtilizationPercent,
  dayWindow,
  daysInMonth,
  monthWindow,
  previousMonth,
  vehicleMatchesStation,
} from './dashboard-utilization.domain';

const COUNTABLE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

@Injectable()
export class DashboardUtilizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationsRepo: EvaluationsInsightsRepository,
  ) {}

  async getOverview(
    organizationId: string,
    year: number,
    month: number,
    stationId?: string | null,
  ): Promise<DashboardUtilizationOverview> {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    const isPartialMonth = year === currentYear && month === currentMonth;

    const { start: monthStart, endExclusive: monthEnd } = monthWindow(year, month);
    const prev = previousMonth(year, month);
    const { start: prevStart, endExclusive: prevEnd } = monthWindow(prev.year, prev.month);

    const combinedStart =
      prevStart.getTime() < monthStart.getTime() ? prevStart : monthStart;
    const combinedEnd =
      monthEnd.getTime() > prevEnd.getTime() ? monthEnd : prevEnd;

    const facts = await this.evaluationsRepo.loadUtilizationFacts(
      organizationId,
      {
        start: combinedStart,
        endExclusive: combinedEnd,
      },
      {
        bookingStatuses: [...COUNTABLE_BOOKING_STATUSES],
        excludeWizardDrafts: true,
      },
    );

    const vehicleStations = await this.prisma.vehicle.findMany({
      where: { organizationId, id: { in: facts.vehicles.map((v) => v.vehicleId) } },
      select: { id: true, homeStationId: true, currentStationId: true },
    });
    const stationByVehicle = new Map(
      vehicleStations.map((v) => [v.id, v]),
    );

    const scopedVehicles = facts.vehicles.filter((vehicle) => {
      const station = stationByVehicle.get(vehicle.vehicleId);
      if (!station) return !stationId;
      return vehicleMatchesStation(station, stationId ?? null);
    });

    const monthUtilization = computeWindowUtilizationPercent(
      scopedVehicles,
      monthStart.getTime(),
      monthEnd.getTime(),
    );
    const prevUtilization = computeWindowUtilizationPercent(
      scopedVehicles,
      prevStart.getTime(),
      prevEnd.getTime(),
    );

    const monthBookingCount = await this.countBookingsForMonth(
      organizationId,
      monthStart,
      monthEnd,
      stationId ?? null,
    );
    const prevBookingCount = await this.countBookingsForMonth(
      organizationId,
      prevStart,
      prevEnd,
      stationId ?? null,
    );

    const dayCount = daysInMonth(year, month);
    const days = Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const { startMs, endExclusiveMs } = dayWindow(year, month, day);
      const utilizationPercent = computeWindowUtilizationPercent(
        scopedVehicles,
        startMs,
        endExclusiveMs,
      );
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { date, utilizationPercent };
    });

    const status =
      scopedVehicles.length === 0
        ? 'UNAVAILABLE'
        : facts.vehicleCount > 0
          ? 'PARTIAL'
          : 'AVAILABLE';

    return {
      status,
      reason: scopedVehicles.length === 0 ? 'NO_ELIGIBLE_VEHICLES_IN_SCOPE' : null,
      year,
      month,
      isPartialMonth,
      stationScoped: Boolean(stationId),
      generatedAt: now.toISOString(),
      monthMetrics: {
        utilizationPercent: monthUtilization,
        bookingCount: monthBookingCount,
        utilizationDeltaPp: computeUtilizationDeltaPp(monthUtilization, prevUtilization),
        bookingDeltaPercent: computeBookingDeltaPercent(monthBookingCount, prevBookingCount),
      },
      previousMonthMetrics: {
        utilizationPercent: prevUtilization,
        bookingCount: prevBookingCount,
        utilizationDeltaPp: null,
        bookingDeltaPercent: null,
      },
      days,
    };
  }

  private async countBookingsForMonth(
    organizationId: string,
    monthStart: Date,
    monthEndExclusive: Date,
    stationId: string | null,
  ): Promise<number> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId,
        status: { in: [...COUNTABLE_BOOKING_STATUSES] },
        startDate: { gte: monthStart, lt: monthEndExclusive },
        vehicle: {
          is: {
            organizationId,
            ...(stationId
              ? {
                  OR: [
                    { homeStationId: stationId },
                    { currentStationId: stationId },
                  ],
                }
              : {}),
          },
        },
      },
      select: { id: true, status: true, notes: true },
    });

    return bookings
      .filter((booking) => !isWizardDraftBooking(booking))
      .filter((booking) => booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW')
      .length;
  }
}
