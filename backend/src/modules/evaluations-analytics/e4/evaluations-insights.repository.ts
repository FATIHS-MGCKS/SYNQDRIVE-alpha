import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
 * foreign relation). Currency for cost facts without a per-row currency is taken
 * from the organization's authoritative reporting currency; a missing reporting
 * currency yields no fabricated EUR (the caller degrades to UNAVAILABLE).
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
  ): Promise<E4UtilizationFacts> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, createdAt: { lt: window.endExclusive } },
      select: { id: true, createdAt: true, latestState: { select: { online: true } } },
    });

    const [bookings, serviceCases] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          organizationId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          startDate: { lt: window.endExclusive },
          endDate: { gt: window.start },
          // Nested tenant proof: only bookings whose vehicle is same-tenant.
          vehicle: { is: { organizationId } },
        },
        select: { vehicleId: true, startDate: true, endDate: true },
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
   * Cost events across all E4 categories, each carrying an explicit currency and
   * a real-world economic key. Invoice↔damage duplicates share the document
   * extraction key; service-case↔invoice duplicates share the linked invoice key
   * (both counted once downstream). Recorded costs without a reporting currency
   * are omitted rather than assigned an implicit currency.
   */
  async loadCostEvents(
    organizationId: string,
    window: E4SourceWindow,
    reportingCurrency: string | null,
  ): Promise<E4CostEventInput[]> {
    const [invoices, serviceCases, damages, orgTaskLinks] = await Promise.all([
      this.prisma.orgInvoice.findMany({
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
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId,
          category: { in: ['REPAIR', 'DIAGNOSTIC'] },
          status: 'COMPLETED',
          actualCostCents: { not: null },
          completedAt: { gte: window.start, lt: window.endExclusive },
          // ServiceCase exposes only a `vehicleId` scalar (no relation object),
          // so tenant safety rests on its own `organizationId` plus the vehicle
          // map-join downstream (a foreign vehicleId is dropped, never attributed).
        },
        select: { id: true, actualCostCents: true, completedAt: true },
      }),
      this.prisma.vehicleDamage.findMany({
        where: {
          organizationId,
          status: 'REPAIRED',
          repairCostCents: { not: null },
          repairedAt: { gte: window.start, lt: window.endExclusive },
          // Nested tenant proof: the linked vehicle must be same-tenant.
          vehicle: { is: { organizationId } },
        },
        select: {
          id: true,
          repairCostCents: true,
          repairedAt: true,
          documentExtractionId: true,
        },
      }),
      this.prisma.orgTask.findMany({
        where: {
          organizationId,
          serviceCaseId: { not: null },
          invoiceId: { not: null },
          // E4.1A: the outer task tenant is NOT sufficient. The linked invoice
          // must independently belong to the same organization before its
          // identity may drive cost dedup/suppression (nested relational
          // predicate — no per-row validation query).
          invoice: { is: { organizationId } },
        },
        select: {
          serviceCaseId: true,
          invoice: { select: { id: true, organizationId: true, documentExtractionId: true } },
        },
      }),
    ]);

    const invoiceEconomicKey = (
      id: string,
      documentExtractionId: string | null,
    ): string => (documentExtractionId ? `extraction:${documentExtractionId}` : `invoice:${id}`);

    const serviceCaseInvoiceKey = new Map<string, string>();
    for (const link of orgTaskLinks) {
      if (!link.serviceCaseId || !link.invoice) continue;
      // Belt-and-braces: ignore any linked invoice that is not same-tenant so a
      // foreign invoice can never suppress or alter legitimate cost facts.
      if (link.invoice.organizationId !== organizationId) continue;
      serviceCaseInvoiceKey.set(
        link.serviceCaseId,
        invoiceEconomicKey(link.invoice.id, link.invoice.documentExtractionId),
      );
    }

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

    if (reportingCurrency) {
      for (const serviceCase of serviceCases) {
        if (serviceCase.actualCostCents === null || !serviceCase.completedAt) continue;
        events.push({
          category: 'UNPLANNED_MAINTENANCE',
          nature: 'ACTUAL',
          amountMinor: serviceCase.actualCostCents,
          currency: reportingCurrency,
          economicKey:
            serviceCaseInvoiceKey.get(serviceCase.id) ?? `servicecase:${serviceCase.id}`,
          businessAtMs: serviceCase.completedAt.getTime(),
        });
      }
      for (const damage of damages) {
        if (damage.repairCostCents === null || !damage.repairedAt) continue;
        events.push({
          category: 'DAMAGE_REPAIR',
          nature: 'ACTUAL',
          amountMinor: damage.repairCostCents,
          currency: reportingCurrency,
          economicKey: damage.documentExtractionId
            ? `extraction:${damage.documentExtractionId}`
            : `damage:${damage.id}`,
          businessAtMs: damage.repairedAt.getTime(),
        });
      }
    }

    return events;
  }

  /**
   * Estimated fixed costs from explicit per-vehicle tenant configuration
   * (leasing/insurance/tax). Pro-rated by the real elapsed period ms (DST-safe).
   * Requires a reporting currency; without it no estimate is fabricated.
   */
  async loadFixedCostEvents(
    organizationId: string,
    window: E4SourceWindow,
    reportingCurrency: string | null,
  ): Promise<{ events: E4CostEventInput[]; vehiclesWithConfig: number; vehicleCount: number }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, createdAt: { lt: window.endExclusive } },
      select: {
        id: true,
        leasingRateCents: true,
        insuranceCostCents: true,
        taxCostCents: true,
      },
    });

    const periodMs = window.endExclusive.getTime() - window.start.getTime();
    const proRate = periodMs / THIRTY_DAYS_MS;
    const events: E4CostEventInput[] = [];
    let vehiclesWithConfig = 0;

    if (reportingCurrency) {
      for (const vehicle of vehicles) {
        const monthlyMinor =
          (vehicle.leasingRateCents ?? 0) +
          (vehicle.insuranceCostCents ?? 0) +
          (vehicle.taxCostCents ?? 0);
        const hasConfig =
          vehicle.leasingRateCents !== null ||
          vehicle.insuranceCostCents !== null ||
          vehicle.taxCostCents !== null;
        if (!hasConfig || monthlyMinor <= 0) continue;
        vehiclesWithConfig += 1;
        events.push({
          category: 'ESTIMATED_FIXED_COSTS',
          nature: 'ESTIMATED',
          amountMinor: Math.round(monthlyMinor * proRate),
          currency: reportingCurrency,
          economicKey: `vehicle-fixed:${vehicle.id}`,
          businessAtMs: window.start.getTime(),
        });
      }
    }

    return { events, vehiclesWithConfig, vehicleCount: vehicles.length };
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
