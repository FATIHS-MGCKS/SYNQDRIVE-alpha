import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VBH_DIAGNOSTIC_CHECK_META } from './vehicle-booking-handover-diagnostic-check-meta';
import { maskDiagnosticId } from './vehicle-booking-handover-diagnostic.safety.util';
import {
  activeBookingsForVehicle,
  buildDiagnosticBookingContext,
  DEFAULT_DIAGNOSTIC_SAMPLE_LIMIT,
  hasCurrentReservationWindow,
  isValidIanaTimezone,
  mapRawVehicleStatusToFleetLabel,
  reservationWindowBookings,
  resolveOrgTimezone,
  wouldCanonicalLogicReserveBooking,
  wouldLegacyLogicReserveBooking,
  type DiagnosticBookingRow,
  type DiagnosticHandoverRow,
  type DiagnosticVehicleRow,
} from './vehicle-booking-handover-diagnostic.util';
import type {
  VbhDiagnosticCategory,
  VbhDiagnosticCheckId,
  VbhDiagnosticFinding,
  VbhDiagnosticOrgSummary,
  VbhDiagnosticReport,
  VbhDiagnosticRunOptions,
} from './vehicle-booking-handover-diagnostic.types';
import {
  FLEET_STATUS_DERIVATION,
  type FleetStatusDerivationPort,
} from './fleet-status-derivation.port';

@Injectable()
export class VehicleBookingHandoverDiagnosticService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FLEET_STATUS_DERIVATION)
    private readonly fleetStatusDerivation: FleetStatusDerivationPort,
  ) {}

  async runDiagnostic(options: VbhDiagnosticRunOptions = {}): Promise<VbhDiagnosticReport> {
    const sampleLimit = options.sampleLimit ?? DEFAULT_DIAGNOSTIC_SAMPLE_LIMIT;
    const referenceNow = options.referenceNow ?? new Date();
    const orgRows = options.organizationId
      ? await this.prisma.organization.findMany({
          where: { id: options.organizationId },
          select: { id: true, timezone: true },
        })
      : await this.prisma.organization.findMany({
          select: { id: true, timezone: true },
        });

    const findings: VbhDiagnosticFinding[] = [];
    const orgScanCounts = new Map<
      string,
      { vehiclesScanned: number; bookingsScanned: number; handoversScanned: number }
    >();
    let vehiclesScanned = 0;
    let bookingsScanned = 0;
    let handoversScanned = 0;

    for (const org of orgRows) {
      findings.push(...this.checkOrganizationTimezone(org.id, org.timezone));

      const vehicleWhere: {
        organizationId: string;
        id?: string;
        licensePlate?: { equals: string; mode: 'insensitive' };
      } = { organizationId: org.id };
      if (options.vehicleId) vehicleWhere.id = options.vehicleId;
      if (options.licensePlate?.trim()) {
        vehicleWhere.licensePlate = { equals: options.licensePlate.trim(), mode: 'insensitive' };
      }

      const vehicles = await this.prisma.vehicle.findMany({
        where: vehicleWhere,
        select: {
          id: true,
          organizationId: true,
          licensePlate: true,
          status: true,
          tankCapacityLiters: true,
        },
      });
      vehiclesScanned += vehicles.length;
      orgScanCounts.set(org.id, {
        vehiclesScanned: vehicles.length,
        bookingsScanned: 0,
        handoversScanned: 0,
      });
      if (vehicles.length === 0) continue;

      const vehicleIds = vehicles.map((v) => v.id);
      const bookings = await this.prisma.booking.findMany({
        where: { organizationId: org.id, vehicleId: { in: vehicleIds } },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          status: true,
          startDate: true,
          endDate: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      });
      bookingsScanned += bookings.length;
      orgScanCounts.get(org.id)!.bookingsScanned = bookings.length;

      const bookingIds = bookings.map((b) => b.id);
      const handovers =
        bookingIds.length === 0
          ? []
          : await this.prisma.bookingHandoverProtocol.findMany({
              where: { organizationId: org.id, bookingId: { in: bookingIds } },
              select: {
                id: true,
                organizationId: true,
                bookingId: true,
                vehicleId: true,
                kind: true,
                performedAt: true,
              },
            });
      handoversScanned += handovers.length;
      orgScanCounts.get(org.id)!.handoversScanned = handovers.length;

      const bookingsByVehicle = this.groupBy(bookings, (b) => b.vehicleId);
      const bookingsById = new Map(bookings.map((b) => [b.id, b]));
      const handoversByBooking = this.groupBy(handovers, (h) => h.bookingId);
      const vehicleOrgById = new Map(vehicles.map((v) => [v.id, v.organizationId]));
      const orgTimezone = resolveOrgTimezone(org.timezone);

      for (const vehicle of vehicles) {
        const vehicleBookings = bookingsByVehicle.get(vehicle.id) ?? [];
        findings.push(
          ...this.checkVehicleRawStatus(vehicle, vehicleBookings, referenceNow),
        );
      }

      for (const booking of bookings) {
        findings.push(...this.checkBookingDates(booking));
        findings.push(
          ...this.checkFutureBookingLegacyReserved(booking, referenceNow, orgTimezone),
        );

        const vehicleOrgId = vehicleOrgById.get(booking.vehicleId);
        if (vehicleOrgId && vehicleOrgId !== booking.organizationId) {
          this.push(findings, 'cross_org_booking_link', org.id, {
            vehicleId: booking.vehicleId,
            bookingId: booking.id,
            message: 'Booking vehicleId belongs to a different organization scope',
            details: {
              bookingOrganizationId: booking.organizationId,
              vehicleOrganizationId: vehicleOrgId,
            },
          });
        }
      }

      for (const handover of handovers) {
        const booking = bookingsById.get(handover.bookingId);
        if (!booking) continue;

        findings.push(...this.checkHandoverBookingStatus(handover, booking));

        if (handover.organizationId !== booking.organizationId) {
          this.push(findings, 'cross_org_booking_link', org.id, {
            vehicleId: handover.vehicleId,
            bookingId: handover.bookingId,
            message: 'Handover protocol organizationId does not match booking organizationId',
            details: {
              handoverOrganizationId: handover.organizationId,
              bookingOrganizationId: booking.organizationId,
            },
          });
        }

        const vehicleOrgId = vehicleOrgById.get(handover.vehicleId);
        if (vehicleOrgId && vehicleOrgId !== handover.organizationId) {
          this.push(findings, 'cross_org_booking_link', org.id, {
            vehicleId: handover.vehicleId,
            bookingId: handover.bookingId,
            message: 'Handover protocol vehicleId belongs to another organization',
            details: {
              handoverOrganizationId: handover.organizationId,
              vehicleOrganizationId: vehicleOrgId,
            },
          });
        }
      }

      for (const vehicle of vehicles) {
        const vehicleBookings = bookingsByVehicle.get(vehicle.id) ?? [];
        findings.push(...this.checkMultipleActiveBookings(vehicle, vehicleBookings));
        findings.push(
          ...this.checkMultipleReservationWindowBookings(vehicle, vehicleBookings, referenceNow),
        );
      }
    }

    return this.buildReport({
      findings,
      vehiclesScanned,
      bookingsScanned,
      handoversScanned,
      organizationId: options.organizationId ?? null,
      organizationCount: orgRows.length,
      referenceNow,
      sampleLimit,
      includeFindings: options.includeFindings ?? false,
      orgScanCounts,
    });
  }

  private checkOrganizationTimezone(
    organizationId: string,
    timezone: string | null,
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    const raw = timezone?.trim() ?? '';
    if (!raw) {
      this.push(out, 'organization_timezone_missing_or_invalid', organizationId, {
        message: 'Organization.timezone is null or empty (defaults to Europe/Berlin at runtime)',
        details: { timezone: null },
      });
      return out;
    }
    if (!isValidIanaTimezone(raw)) {
      this.push(out, 'organization_timezone_missing_or_invalid', organizationId, {
        message: 'Organization.timezone is not a valid IANA timezone',
        details: { timezone: raw },
      });
    }
    return out;
  }

  private checkVehicleRawStatus(
    vehicle: DiagnosticVehicleRow,
    bookings: DiagnosticBookingRow[],
    now: Date,
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    const bookingCtx = buildDiagnosticBookingContext(bookings, now);
    const derived = this.fleetStatusDerivation.deriveFleetStatusContext({
      vehicle,
      state: null,
      bookingCtx,
      pickupOdoByBooking: new Map(),
    });

    const active = activeBookingsForVehicle(bookings);
    const inReservationWindow = hasCurrentReservationWindow(bookings, now);
    const rawLabel = mapRawVehicleStatusToFleetLabel(vehicle.status);

    if (vehicle.status === 'RESERVED' && !inReservationWindow) {
      this.push(out, 'raw_reserved_without_window', vehicle.organizationId, {
        vehicleId: vehicle.id,
        message: 'Vehicle.status is RESERVED but no PENDING/CONFIRMED booking with endDate >= now exists',
        details: {
          rawStatus: vehicle.status,
          reservationWindowBookingCount: reservationWindowBookings(bookings, now).length,
        },
      });
    }

    if (vehicle.status === 'RENTED' && active.length === 0) {
      this.push(out, 'raw_rented_without_active_booking', vehicle.organizationId, {
        vehicleId: vehicle.id,
        message: 'Vehicle.status is RENTED but no ACTIVE booking exists for this vehicle',
        details: { rawStatus: vehicle.status, activeBookingCount: 0 },
      });
    }

    if (vehicle.status === 'AVAILABLE' && active.length > 0) {
      this.push(out, 'active_booking_raw_available', vehicle.organizationId, {
        vehicleId: vehicle.id,
        bookingId: active[0]?.id,
        message: 'Vehicle.status is AVAILABLE but an ACTIVE booking exists',
        details: {
          rawStatus: vehicle.status,
          activeBookingId: active[0]?.id ?? null,
        },
      });
    }

    if (rawLabel !== derived.status) {
      this.push(out, 'endpoint_canonical_derivation_divergence', vehicle.organizationId, {
        vehicleId: vehicle.id,
        bookingId: bookingCtx.activeBookingId ?? bookingCtx.reservedBookingId ?? undefined,
        message: 'Raw Vehicle.status fleet label diverges from deriveFleetStatusContext result',
        details: {
          rawFleetLabel: rawLabel,
          canonicalFleetLabel: derived.status,
          rawDbStatus: vehicle.status,
          activeBookingId: bookingCtx.activeBookingId,
          reservedBookingId: bookingCtx.reservedBookingId,
        },
      });
    }

    return out;
  }

  private checkHandoverBookingStatus(
    handover: DiagnosticHandoverRow,
    booking: DiagnosticBookingRow,
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    if (handover.kind === 'PICKUP' && booking.status !== 'ACTIVE') {
      this.push(out, 'pickup_completed_booking_not_active', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'PICKUP handover protocol exists but booking status is not ACTIVE',
        details: {
          bookingStatus: booking.status,
          handoverKind: handover.kind,
        },
      });
    }
    if (handover.kind === 'RETURN' && booking.status === 'ACTIVE') {
      this.push(out, 'return_completed_booking_still_active', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'RETURN handover protocol exists but booking status is still ACTIVE',
        details: {
          bookingStatus: booking.status,
          handoverKind: handover.kind,
        },
      });
    }
    return out;
  }

  private checkMultipleActiveBookings(
    vehicle: DiagnosticVehicleRow,
    bookings: DiagnosticBookingRow[],
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    const active = activeBookingsForVehicle(bookings);
    if (active.length <= 1) return out;
    for (const booking of active) {
      this.push(out, 'multiple_active_bookings_per_vehicle', vehicle.organizationId, {
        vehicleId: vehicle.id,
        bookingId: booking.id,
        message: 'Multiple ACTIVE bookings exist for the same vehicle',
        details: { activeBookingCount: active.length },
      });
    }
    return out;
  }

  private checkMultipleReservationWindowBookings(
    vehicle: DiagnosticVehicleRow,
    bookings: DiagnosticBookingRow[],
    now: Date,
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    const inWindow = reservationWindowBookings(bookings, now);
    if (inWindow.length <= 1) return out;
    for (const booking of inWindow) {
      this.push(out, 'multiple_reservation_window_bookings', vehicle.organizationId, {
        vehicleId: vehicle.id,
        bookingId: booking.id,
        message: 'Multiple PENDING/CONFIRMED bookings with endDate >= now overlap the reservation window',
        details: { reservationWindowBookingCount: inWindow.length },
      });
    }
    return out;
  }

  private checkFutureBookingLegacyReserved(
    booking: DiagnosticBookingRow,
    now: Date,
    orgTimezone: string,
  ): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    if (
      wouldLegacyLogicReserveBooking(booking, now) &&
      !wouldCanonicalLogicReserveBooking(booking, now, orgTimezone)
    ) {
      this.push(out, 'future_booking_legacy_reserved_trigger', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message:
          'Future booking would be treated as Reserved by legacy buildBookingContextMap but not by canonical pickup-day logic',
        details: {
          bookingStatus: booking.status,
          startDate: booking.startDate.toISOString(),
          endDate: booking.endDate.toISOString(),
        },
      });
    }
    return out;
  }

  private checkBookingDates(booking: DiagnosticBookingRow): VbhDiagnosticFinding[] {
    const out: VbhDiagnosticFinding[] = [];
    if (booking.startDate.getTime() >= booking.endDate.getTime()) {
      this.push(out, 'booking_date_inconsistency', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'Booking startDate is not before endDate',
        details: {
          startDate: booking.startDate.toISOString(),
          endDate: booking.endDate.toISOString(),
        },
      });
    }
    if (
      booking.completedAt &&
      booking.completedAt.getTime() < booking.startDate.getTime()
    ) {
      this.push(out, 'booking_date_inconsistency', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'Booking completedAt is before startDate',
        details: {
          completedAt: booking.completedAt.toISOString(),
          startDate: booking.startDate.toISOString(),
        },
      });
    }
    if (
      booking.cancelledAt &&
      booking.cancelledAt.getTime() < booking.createdAt.getTime()
    ) {
      this.push(out, 'booking_date_inconsistency', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'Booking cancelledAt is before createdAt',
        details: {
          cancelledAt: booking.cancelledAt.toISOString(),
          createdAt: booking.createdAt.toISOString(),
        },
      });
    }
    if (booking.status === 'COMPLETED' && !booking.completedAt) {
      this.push(out, 'booking_date_inconsistency', booking.organizationId, {
        vehicleId: booking.vehicleId,
        bookingId: booking.id,
        message: 'COMPLETED booking is missing completedAt',
        details: { bookingStatus: booking.status },
      });
    }
    return out;
  }

  private push(
    out: VbhDiagnosticFinding[],
    checkId: VbhDiagnosticCheckId,
    organizationId: string,
    input: {
      vehicleId?: string;
      bookingId?: string;
      message: string;
      details?: Record<string, string | number | boolean | null>;
    },
  ): void {
    const meta = VBH_DIAGNOSTIC_CHECK_META[checkId];
    out.push({
      checkId,
      category: meta.category,
      severity: meta.severity,
      organizationId,
      vehicleId: input.vehicleId,
      bookingId: input.bookingId,
      message: input.message,
      details: input.details,
    });
  }

  private groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyFn(row);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }

  private buildReport(input: {
    findings: VbhDiagnosticFinding[];
    vehiclesScanned: number;
    bookingsScanned: number;
    handoversScanned: number;
    organizationId: string | null;
    organizationCount: number;
    referenceNow: Date;
    sampleLimit: number;
    includeFindings: boolean;
    orgScanCounts: Map<
      string,
      { vehiclesScanned: number; bookingsScanned: number; handoversScanned: number }
    >;
  }): VbhDiagnosticReport {
    const byCategory = this.emptyCategoryCounts();
    const byCheck: Partial<Record<VbhDiagnosticCheckId, number>> = {};
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const finding of input.findings) {
      byCategory[finding.category] += 1;
      byCheck[finding.checkId] = (byCheck[finding.checkId] ?? 0) + 1;
      if (finding.severity === 'error') errors += 1;
      else if (finding.severity === 'warning') warnings += 1;
      else infos += 1;
    }

    const checks = (Object.keys(VBH_DIAGNOSTIC_CHECK_META) as VbhDiagnosticCheckId[])
      .map((checkId) => {
        const related = input.findings.filter((f) => f.checkId === checkId);
        if (related.length === 0) return null;
        const meta = VBH_DIAGNOSTIC_CHECK_META[checkId];
        return {
          checkId,
          category: meta.category,
          severity: meta.severity,
          label: meta.label,
          count: related.length,
          sampleVehicleIds: related
            .map((f) => f.vehicleId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskDiagnosticId),
          sampleBookingIds: related
            .map((f) => f.bookingId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskDiagnosticId),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.count - a.count);

    const byOrganization = this.buildOrgSummaries(input.findings, input.orgScanCounts);

    return {
      mode: 'diagnostic',
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      referenceNow: input.referenceNow.toISOString(),
      organizationId: input.organizationId,
      organizationCount: input.organizationCount,
      vehiclesScanned: input.vehiclesScanned,
      bookingsScanned: input.bookingsScanned,
      handoversScanned: input.handoversScanned,
      summary: {
        totalFindings: input.findings.length,
        errors,
        warnings,
        infos,
        byCategory,
        byCheck,
      },
      byOrganization,
      checks,
      findings: input.includeFindings
        ? input.findings.slice(0, input.sampleLimit * Math.max(checks.length, 1)).map((f) => ({
            ...f,
            vehicleId: f.vehicleId ? maskDiagnosticId(f.vehicleId) : undefined,
            bookingId: f.bookingId ? maskDiagnosticId(f.bookingId) : undefined,
          }))
        : undefined,
    };
  }

  private buildOrgSummaries(
    findings: VbhDiagnosticFinding[],
    orgScanCounts: Map<
      string,
      { vehiclesScanned: number; bookingsScanned: number; handoversScanned: number }
    >,
  ): VbhDiagnosticOrgSummary[] {
    const map = new Map<string, VbhDiagnosticOrgSummary>();
    for (const [organizationId, counts] of orgScanCounts) {
      map.set(organizationId, {
        organizationId,
        vehiclesScanned: counts.vehiclesScanned,
        bookingsScanned: counts.bookingsScanned,
        handoversScanned: counts.handoversScanned,
        totalFindings: 0,
        byCheck: {},
      });
    }
    for (const finding of findings) {
      const existing =
        map.get(finding.organizationId) ??
        ({
          organizationId: finding.organizationId,
          vehiclesScanned: 0,
          bookingsScanned: 0,
          handoversScanned: 0,
          totalFindings: 0,
          byCheck: {},
        } satisfies VbhDiagnosticOrgSummary);
      existing.totalFindings += 1;
      existing.byCheck[finding.checkId] = (existing.byCheck[finding.checkId] ?? 0) + 1;
      map.set(finding.organizationId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalFindings - a.totalFindings);
  }

  private emptyCategoryCounts(): Record<VbhDiagnosticCategory, number> {
    return {
      vehicle_raw_status: 0,
      booking_status: 0,
      handover_integrity: 0,
      reservation_window: 0,
      cross_org: 0,
      timing: 0,
      derivation: 0,
      organization_config: 0,
    };
  }
}
