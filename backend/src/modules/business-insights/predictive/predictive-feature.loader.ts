import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  PredictiveFeatureBookingRow,
  PredictiveFeatureFleetContext,
  PredictiveFeatureInvoiceRow,
  PredictiveFeatureServiceCaseRow,
} from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import {
  DEFAULT_FEATURE_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@synq/evaluations-insights/predictive/evaluations-feature-time';

const OUTGOING_INVOICE_TYPES = ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'] as const;

@Injectable()
export class PredictiveFeatureLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadOrganizationTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_FEATURE_TIMEZONE;
  }

  async loadFleetContext(organizationId: string, stationId?: string, vehicleClassId?: string): Promise<PredictiveFeatureFleetContext> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        ...(stationId ? { homeStationId: stationId } : {}),
        ...(vehicleClassId ? { rentalCategoryId: vehicleClassId } : {}),
      },
      select: { id: true },
    });
    return { vehicleCount: vehicles.length, vehicleIds: vehicles.map((v) => v.id) };
  }

  async loadRawData(
    organizationId: string,
    rangeStartUtc: Date,
    rangeEndUtc: Date,
    timezone: string,
  ): Promise<{
    bookings: PredictiveFeatureBookingRow[];
    serviceCases: PredictiveFeatureServiceCaseRow[];
    invoices: PredictiveFeatureInvoiceRow[];
  }> {
    const lookbackStart = new Date(rangeStartUtc.getTime() - 35 * 24 * 60 * 60 * 1000);

    const [bookings, serviceCases, invoices] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          organizationId,
          OR: [
            { startDate: { gte: lookbackStart, lte: rangeEndUtc } },
            { createdAt: { gte: lookbackStart, lte: rangeEndUtc } },
            { completedAt: { gte: lookbackStart, lte: rangeEndUtc } },
            { cancelledAt: { gte: lookbackStart, lte: rangeEndUtc } },
          ],
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          startDate: true,
          endDate: true,
          cancelledAt: true,
          completedAt: true,
          totalPriceCents: true,
          kmDriven: true,
          pickupStationId: true,
          vehicleId: true,
          vehicle: { select: { rentalCategoryId: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId,
          OR: [
            { openedAt: { gte: lookbackStart, lte: rangeEndUtc } },
            { downtimeStart: { gte: lookbackStart, lte: rangeEndUtc } },
          ],
        },
        select: {
          id: true,
          vehicleId: true,
          category: true,
          openedAt: true,
          completedAt: true,
          downtimeStart: true,
          downtimeEnd: true,
          blocksRental: true,
          actualCostCents: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.orgInvoice.findMany({
        where: {
          organizationId,
          type: { in: [...OUTGOING_INVOICE_TYPES] },
          invoiceDate: { gte: lookbackStart, lte: rangeEndUtc },
        },
        select: {
          id: true,
          type: true,
          invoiceDate: true,
          totalCents: true,
          paidAt: true,
          vehicleId: true,
          currency: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    return {
      bookings: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
        completedAt: b.completedAt?.toISOString() ?? null,
        totalPriceCents: b.totalPriceCents,
        kmDriven: b.kmDriven,
        pickupStationId: b.pickupStationId,
        vehicleId: b.vehicleId,
        vehicleRentalCategoryId: b.vehicle.rentalCategoryId,
      })),
      serviceCases: serviceCases.map((s) => ({
        id: s.id,
        vehicleId: s.vehicleId,
        category: s.category,
        openedAt: s.openedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        downtimeStart: s.downtimeStart?.toISOString() ?? null,
        downtimeEnd: s.downtimeEnd?.toISOString() ?? null,
        blocksRental: s.blocksRental,
        actualCostCents: s.actualCostCents,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        type: i.type,
        invoiceDate: i.invoiceDate.toISOString(),
        totalCents: i.totalCents,
        paidAt: i.paidAt?.toISOString() ?? null,
        vehicleId: i.vehicleId,
        currency: i.currency,
      })),
    };
  }

  retentionCutoffDate(timezone: string, retentionMonths: number): string {
    const now = new Date();
    const localToday = zonedDateOnly(now, timezone);
    const anchor = zonedStartOfDayToUtc(localToday, timezone);
    const cutoff = new Date(anchor.getTime());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
    return zonedDateOnly(cutoff, timezone);
  }
}
