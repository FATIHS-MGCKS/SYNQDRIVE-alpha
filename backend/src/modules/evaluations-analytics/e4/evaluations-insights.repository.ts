import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isWizardDraftBooking } from '@modules/bookings/booking-wizard-draft.util';
import {
  isExpenseInvoiceFact,
  resolveExpenseBusinessMs,
} from '@synq/evaluations-finance/evaluations-finance-facts';
import { isIncomingInvoiceType } from '@modules/invoices/invoice-domain.util';
import { normalizeMoneyCurrency } from '@synq/evaluations-finance/evaluations-money';
import type { EvaluationsInterval } from './domain/evaluations-interval';
import type { E4CostEventInput } from './domain/evaluations-cost.domain';
import type { E4DriverObservationInput } from './domain/evaluations-driver.domain';

export interface E4SourceWindow {
  readonly start: Date;
  readonly endExclusive: Date;
}

export type E4UtilizationBookingStatus = 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED';

export interface E4UtilizationFactsOptions {
  /** Defaults to ACTIVE + COMPLETED (realized occupancy for canonical E4 analytics). */
  readonly bookingStatuses?: readonly E4UtilizationBookingStatus[];
  /** When true, drops wizard-draft PENDING bookings from rented intervals. */
  readonly excludeWizardDrafts?: boolean;
}

const DEFAULT_UTILIZATION_BOOKING_STATUSES: readonly E4UtilizationBookingStatus[] = [
  'ACTIVE',
  'COMPLETED',
];

export interface E4UtilizationVehicleFacts {
  readonly vehicleId: string;
  readonly eligibility: EvaluationsInterval;
  readonly rented: EvaluationsInterval[];
  readonly maintenance: EvaluationsInterval[];
  readonly blocked: EvaluationsInterval[];
}

export interface E4UtilizationFacts {
  readonly vehicles: readonly E4UtilizationVehicleFacts[];
  readonly telemetryOfflineVehicles: number;
  readonly vehicleCount: number;
}

export interface E4BookingOutcomeFacts {
  readonly totalOutcomes: number;
  readonly cancelledPlusNoShow: number;
}

/**
 * Tenant-scoped access to every E4 analytics source. Every query carries an
 * explicit `organizationId` filter (no post-load tenant filtering, no trust in a
 * foreign relation). Cost facts without a per-row currency (ServiceCase/Damage)
 * are NOT assigned the organization's current reporting currency — they are
 * reported as unsupported (see `loadUnsupportedCostSources`); only explicit-
 * currency invoices are authoritative Money (E4.1B).
 */
@Injectable()
export class EvaluationsInsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async resolveReportingCurrency(organizationId: string): Promise<string | null> {
    const account = await this.prisma.organizationPaymentAccount.findFirst({
      where: { organizationId, status: 'ACTIVE', chargesEnabled: true },
      select: { defaultCurrency: true },
      orderBy: [{ lastSyncedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!account?.defaultCurrency) return null;
    try {
      return normalizeMoneyCurrency(account.defaultCurrency);
    } catch {
      return null;
    }
  }

  async loadUtilizationFacts(
    organizationId: string,
    window: E4SourceWindow,
    options?: E4UtilizationFactsOptions,
  ): Promise<E4UtilizationFacts> {
    const bookingStatuses = options?.bookingStatuses ?? DEFAULT_UTILIZATION_BOOKING_STATUSES;
    const excludeWizardDrafts = options?.excludeWizardDrafts ?? false;

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, createdAt: { lt: window.endExclusive } },
      select: { id: true, createdAt: true, latestState: { select: { online: true } } },
    });

    const [bookingsRaw, serviceCases] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          organizationId,
          status: { in: [...bookingStatuses] },
          startDate: { lt: window.endExclusive },
          endDate: { gt: window.start },
          // Nested tenant proof: only bookings whose vehicle is same-tenant.
          vehicle: { is: { organizationId } },
        },
        select: {
          vehicleId: true,
          startDate: true,
          endDate: true,
          status: true,
          notes: true,
        },
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId,
          blocksRental: true,
          downtimeStart: { lt: window.endExclusive },
          downtimeEnd: { gt: window.start },
          // ServiceCase exposes only a `vehicleId` scalar (no relation object);
          // its own organizationId + the vehicle map-join (foreign vehicleId is
          // dropped) provide tenant safety.
        },
        select: { vehicleId: true, downtimeStart: true, downtimeEnd: true },
      }),
    ]);

    const bookings = excludeWizardDrafts
      ? bookingsRaw.filter((booking) => !isWizardDraftBooking(booking))
      : bookingsRaw;

    const rentedByVehicle = new Map<string, EvaluationsInterval[]>();
    for (const booking of bookings) {
      const list = rentedByVehicle.get(booking.vehicleId) ?? [];
      list.push({
        startMs: booking.startDate.getTime(),
        endExclusiveMs: booking.endDate.getTime(),
      });
      rentedByVehicle.set(booking.vehicleId, list);
    }

    const maintenanceByVehicle = new Map<string, EvaluationsInterval[]>();
    for (const serviceCase of serviceCases) {
      if (!serviceCase.downtimeStart || !serviceCase.downtimeEnd) continue;
      const list = maintenanceByVehicle.get(serviceCase.vehicleId) ?? [];
      list.push({
        startMs: serviceCase.downtimeStart.getTime(),
        endExclusiveMs: serviceCase.downtimeEnd.getTime(),
      });
      maintenanceByVehicle.set(serviceCase.vehicleId, list);
    }

    const periodStartMs = window.start.getTime();
    let telemetryOfflineVehicles = 0;
    const vehicleFacts: E4UtilizationVehicleFacts[] = vehicles.map((vehicle) => {
      // Telemetry offline is informational only — never converted to downtime.
      if (vehicle.latestState && vehicle.latestState.online === false) {
        telemetryOfflineVehicles += 1;
      }
      const eligibilityStartMs = Math.max(vehicle.createdAt.getTime(), periodStartMs);
      return {
        vehicleId: vehicle.id,
        eligibility: {
          startMs: eligibilityStartMs,
          endExclusiveMs: window.endExclusive.getTime(),
        },
        rented: rentedByVehicle.get(vehicle.id) ?? [],
        maintenance: maintenanceByVehicle.get(vehicle.id) ?? [],
        blocked: [],
      };
    });

    return {
      vehicles: vehicleFacts,
      telemetryOfflineVehicles,
      vehicleCount: vehicles.length,
    };
  }

  /**
   * Authoritative cost events (E4.1B).
   *
   * Only `OrgInvoice` (incoming expense) is an authoritative Money cost source
   * because it carries an explicit per-row `currency`. Each event carries that
   * concrete currency and a real-world economic key (`extraction:*` when the
   * invoice shares a document extraction, else `invoice:*`).
   *
   * ServiceCase / VehicleDamage / per-vehicle leasing-insurance-tax are NOT
   * returned here: their currency (and, for fixed costs, periodicity + effective-
   * date) cannot be proven on current main, so they must never be denominated in
   * the organization's *current* reporting currency and folded into an
   * authoritative total. They are reported separately by
   * `loadUnsupportedCostSources` so the section degrades to PARTIAL/UNAVAILABLE
   * with an explicit reason instead of silently appearing complete.
   */
  async loadCostEvents(
    organizationId: string,
    window: E4SourceWindow,
  ): Promise<E4CostEventInput[]> {
    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId,
        OR: [
          { invoiceDate: { gte: window.start, lt: window.endExclusive } },
          { createdAt: { gte: window.start, lt: window.endExclusive } },
        ],
      },
      select: {
        id: true,
        type: true,
        status: true,
        currency: true,
        totalCents: true,
        paidCents: true,
        outstandingCents: true,
        invoiceDate: true,
        issuedAt: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
        documentExtractionId: true,
      },
    });

    const invoiceEconomicKey = (
      id: string,
      documentExtractionId: string | null,
    ): string => (documentExtractionId ? `extraction:${documentExtractionId}` : `invoice:${id}`);

    const events: E4CostEventInput[] = [];
    for (const invoice of invoices) {
      const fact = {
        id: invoice.id,
        direction: isIncomingInvoiceType(invoice.type)
          ? ('INCOMING' as const)
          : ('OUTGOING' as const),
        status: invoice.status,
        currency: (invoice.currency ?? '').trim().toUpperCase(),
        totalMinor: invoice.totalCents,
        paidMinor: invoice.paidCents,
        outstandingMinor: invoice.outstandingCents,
        issuedAt: iso(invoice.issuedAt),
        invoiceDate: iso(invoice.invoiceDate),
        dueDate: iso(invoice.dueDate),
        paidAt: iso(invoice.paidAt),
        createdAt: iso(invoice.createdAt),
      };
      if (!isExpenseInvoiceFact(fact)) continue;
      const businessAtMs = resolveExpenseBusinessMs(fact);
      if (businessAtMs === null) continue;
      let currency: string;
      try {
        currency = normalizeMoneyCurrency(fact.currency);
      } catch {
        continue; // invalid source currency → excluded (never implicit EUR)
      }
      events.push({
        category: 'OPERATING_EXPENSES',
        nature: 'ACTUAL',
        amountMinor: invoice.totalCents,
        currency,
        economicKey: invoiceEconomicKey(invoice.id, invoice.documentExtractionId),
        businessAtMs,
      });
    }

    return events;
  }

  /**
   * Counts of cost-source records that EXIST in the period but cannot be turned
   * into an authoritative Money total on current main (no proven currency and,
   * for fixed costs, no proven periodicity / effective-date). These drive the
   * cost section to PARTIAL with explicit unsupported reasons — they are never
   * fabricated into a total or a false zero. All queries are tenant-scoped; the
   * damage query also uses a nested vehicle tenant predicate (E4.1A).
   */
  async loadUnsupportedCostSources(
    organizationId: string,
    window: E4SourceWindow,
  ): Promise<{
    serviceCaseCount: number;
    damageCount: number;
    fixedConfigVehicleCount: number;
    vehicleCount: number;
  }> {
    const [serviceCaseCount, damageCount, fixedConfigVehicleCount, vehicleCount] =
      await Promise.all([
        this.prisma.serviceCase.count({
          where: {
            organizationId,
            category: { in: ['REPAIR', 'DIAGNOSTIC'] },
            status: 'COMPLETED',
            actualCostCents: { not: null },
            completedAt: { gte: window.start, lt: window.endExclusive },
          },
        }),
        this.prisma.vehicleDamage.count({
          where: {
            organizationId,
            status: 'REPAIRED',
            repairCostCents: { not: null },
            repairedAt: { gte: window.start, lt: window.endExclusive },
            vehicle: { is: { organizationId } },
          },
        }),
        this.prisma.vehicle.count({
          where: {
            organizationId,
            createdAt: { lt: window.endExclusive },
            OR: [
              { leasingRateCents: { not: null } },
              { insuranceCostCents: { not: null } },
              { taxCostCents: { not: null } },
            ],
          },
        }),
        this.prisma.vehicle.count({
          where: { organizationId, createdAt: { lt: window.endExclusive } },
        }),
      ]);

    return { serviceCaseCount, damageCount, fixedConfigVehicleCount, vehicleCount };
  }

  async loadBookingOutcomes(
    organizationId: string,
    window: E4SourceWindow,
  ): Promise<E4BookingOutcomeFacts> {
    const [completed, cancelled, noShow] = await Promise.all([
      this.prisma.booking.count({
        where: {
          organizationId,
          status: 'COMPLETED',
          completedAt: { gte: window.start, lt: window.endExclusive },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          status: 'CANCELLED',
          cancelledAt: { gte: window.start, lt: window.endExclusive },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          status: 'NO_SHOW',
          startDate: { gte: window.start, lt: window.endExclusive },
        },
      }),
    ]);
    return {
      totalOutcomes: completed + cancelled + noShow,
      cancelledPlusNoShow: cancelled + noShow,
    };
  }

  /**
   * Driver-attributed observations (org-scoped, actual/assigned driver only).
   *
   * E4.1A hardening:
   *  - The contract customer (`Booking.customerId`) is NEVER treated as the
   *    driver (no `assignedDriverId ?? customerId` fallback). A booking with no
   *    assigned driver is UNATTRIBUTED and simply produces no named observation.
   *  - The assigned driver must independently belong to the same organization.
   *    `Booking.organizationId` does not prove the assigned driver's tenant, so
   *    the nested `assignedDriver.organizationId` is validated explicitly; a
   *    foreign driver is dropped (no id/name/reference leaks).
   *  - `VehicleDamage.customerId` is the liable contract party, NOT the actual
   *    driver, so it never becomes driver attribution here. Damage still
   *    contributes to non-driver analytics (cost model) via its own path.
   *
   * The canonical actual-driver authority for trip-level attribution is
   * `DriverAttribution` (org-scoped, with `driverId` + `attributionType` +
   * confidence). Trip-level driver attribution is deferred to E4.1B; cancelled/
   * no-show bookings have no trip, so only the validated assigned driver is used.
   *
   * `unattributedCount` is reported for evidence but is NEVER redistributed to
   * named drivers.
   */
  async loadDriverObservations(
    organizationId: string,
    window: E4SourceWindow,
  ): Promise<{ observations: E4DriverObservationInput[]; unattributedCount: number }> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId,
        status: { in: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { cancelledAt: { gte: window.start, lt: window.endExclusive } },
          { startDate: { gte: window.start, lt: window.endExclusive } },
        ],
      },
      select: {
        assignedDriverId: true,
        // Nested select for explicit same-tenant proof of the assigned driver.
        assignedDriver: { select: { organizationId: true } },
      },
    });

    const observations: E4DriverObservationInput[] = [];
    let unattributedCount = 0;
    for (const booking of bookings) {
      // No assigned driver, or assigned driver is foreign / missing → UNATTRIBUTED.
      if (
        !booking.assignedDriverId ||
        !booking.assignedDriver ||
        booking.assignedDriver.organizationId !== organizationId
      ) {
        unattributedCount += 1;
        continue;
      }
      observations.push({
        driverRef: booking.assignedDriverId,
        dimension: 'BOOKING_CANCELLATIONS',
        count: 1,
      });
    }

    return { observations, unattributedCount };
  }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
