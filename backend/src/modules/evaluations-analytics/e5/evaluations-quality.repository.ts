import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface E5SourceWindow {
  readonly start: Date;
  readonly endExclusive: Date;
}

export interface E5FreshnessRange {
  readonly newestMs: number | null;
  readonly oldestMs: number | null;
}

/**
 * Tenant-scoped freshness ranges per source class. Every query is filtered by an
 * explicit `organizationId` (or a nested `vehicle.is.organizationId` tenant
 * proof). It returns only min/max business timestamps — never raw record
 * contents, ids, or PII — so it cannot leak cross-tenant lineage.
 */
@Injectable()
export class EvaluationsQualityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async financeFreshness(organizationId: string, window: E5SourceWindow): Promise<E5FreshnessRange> {
    const agg = await this.prisma.orgInvoice.aggregate({
      where: {
        organizationId,
        invoiceDate: { gte: window.start, lt: window.endExclusive },
      },
      _max: { invoiceDate: true },
      _min: { invoiceDate: true },
    });
    return toRange(agg._max.invoiceDate, agg._min.invoiceDate);
  }

  async paymentsFreshness(organizationId: string, window: E5SourceWindow): Promise<E5FreshnessRange> {
    const agg = await this.prisma.orgInvoicePayment.aggregate({
      where: {
        organizationId,
        // Defense-in-depth: the parent invoice must be same-tenant.
        invoice: { is: { organizationId } },
        paidAt: { gte: window.start, lt: window.endExclusive },
      },
      _max: { paidAt: true },
      _min: { paidAt: true },
    });
    return toRange(agg._max.paidAt, agg._min.paidAt);
  }

  async bookingsFreshness(organizationId: string, window: E5SourceWindow): Promise<E5FreshnessRange> {
    const agg = await this.prisma.booking.aggregate({
      where: {
        organizationId,
        startDate: { gte: window.start, lt: window.endExclusive },
      },
      _max: { startDate: true },
      _min: { startDate: true },
    });
    return toRange(agg._max.startDate, agg._min.startDate);
  }

  async maintenanceFreshness(organizationId: string, window: E5SourceWindow): Promise<E5FreshnessRange> {
    const agg = await this.prisma.serviceCase.aggregate({
      where: {
        organizationId,
        completedAt: { gte: window.start, lt: window.endExclusive },
      },
      _max: { completedAt: true },
      _min: { completedAt: true },
    });
    return toRange(agg._max.completedAt, agg._min.completedAt);
  }

  async damageFreshness(organizationId: string, window: E5SourceWindow): Promise<E5FreshnessRange> {
    const agg = await this.prisma.vehicleDamage.aggregate({
      where: {
        organizationId,
        repairedAt: { gte: window.start, lt: window.endExclusive },
      },
      _max: { repairedAt: true },
      _min: { repairedAt: true },
    });
    return toRange(agg._max.repairedAt, agg._min.repairedAt);
  }

  /**
   * Telemetry is a CURRENT snapshot (latest state). It is only meaningful for a
   * live period and must never be presented as a historical period fact — the
   * caller enforces that; this method just reports the snapshot's newest seen-at.
   */
  async telemetrySnapshotNewest(organizationId: string): Promise<number | null> {
    const agg = await this.prisma.vehicleLatestState.aggregate({
      where: { vehicle: { is: { organizationId } } },
      _max: { lastSeenAt: true },
    });
    return agg._max.lastSeenAt ? agg._max.lastSeenAt.getTime() : null;
  }
}

function toRange(newest: Date | null, oldest: Date | null): E5FreshnessRange {
  return {
    newestMs: newest ? newest.getTime() : null,
    oldestMs: oldest ? oldest.getTime() : null,
  };
}
