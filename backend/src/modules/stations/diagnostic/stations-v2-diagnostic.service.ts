import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { STATIONS_V2_DIAGNOSTIC_CHECK_META } from './stations-v2-diagnostic-check-meta';
import { maskStationsV2DiagnosticId } from './stations-v2-diagnostic.safety.util';
import {
  buildDiagnosticFinding,
  collectScopeStationIdCandidates,
  DEFAULT_STATIONS_V2_BOOKING_LOOKAHEAD_DAYS,
  DEFAULT_STATIONS_V2_DIAGNOSTIC_SAMPLE_LIMIT,
  evaluateBookingRuleSides,
  evaluateExpectedStationSnapshot,
  evaluateKpiCurrentOnSiteDeviation,
  evaluateKpiHomeFleetDeviation,
  evaluateStaleExpected,
  inspectStationCoordinatePair,
  inspectStationOpeningHours,
  inspectStationTimezone,
  isExpectedContextStillValid,
  resolveBookingRuleSeverity,
  stationHasActiveCapabilities,
  toBookingRulesStationInput,
} from './stations-v2-diagnostic.util';
import type {
  StationsV2DiagnosticCategory,
  StationsV2DiagnosticCheckId,
  StationsV2DiagnosticFinding,
  StationsV2DiagnosticOrgSummary,
  StationsV2DiagnosticReport,
  StationsV2DiagnosticRunOptions,
} from './stations-v2-diagnostic.types';

const ACTIVE_TRANSFER_STATUSES = ['PLANNED', 'READY', 'IN_TRANSIT', 'ARRIVED', 'OVERDUE'] as const;
const BOOKING_RULE_SCAN_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
];

type StationRow = {
  id: string;
  organizationId: string;
  name: string;
  status: StationStatus;
  isPrimary: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  capacity: number | null;
  openingHours: unknown;
  holidayRules: unknown;
};

type VehicleRow = {
  id: string;
  organizationId: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  currentStationSource: string | null;
  expectedStationSource: string | null;
  expectedStationSetAt: Date | null;
};

@Injectable()
export class StationsV2DiagnosticService {
  constructor(private readonly prisma: PrismaService) {}

  async runDiagnostic(
    options: StationsV2DiagnosticRunOptions = {},
  ): Promise<StationsV2DiagnosticReport> {
    const sampleLimit = options.sampleLimit ?? DEFAULT_STATIONS_V2_DIAGNOSTIC_SAMPLE_LIMIT;
    const referenceNow = options.referenceNow ?? new Date();
    const bookingLookaheadDays =
      options.bookingLookaheadDays ?? DEFAULT_STATIONS_V2_BOOKING_LOOKAHEAD_DAYS;
    const bookingCutoff = new Date(referenceNow);
    bookingCutoff.setUTCDate(bookingCutoff.getUTCDate() + bookingLookaheadDays);

    const orgRows = options.organizationId
      ? await this.prisma.organization.findMany({
          where: { id: options.organizationId },
          select: { id: true },
        })
      : await this.prisma.organization.findMany({ select: { id: true } });

    const findings: StationsV2DiagnosticFinding[] = [];
    const orgScanCounts = new Map<
      string,
      {
        stationsScanned: number;
        vehiclesScanned: number;
        bookingsScanned: number;
        membershipsScanned: number;
      }
    >();

    let stationsScanned = 0;
    let vehiclesScanned = 0;
    let bookingsScanned = 0;
    let membershipsScanned = 0;

    for (const org of orgRows) {
      const stations = await this.prisma.station.findMany({
        where: { organizationId: org.id },
        select: {
          id: true,
          organizationId: true,
          name: true,
          status: true,
          isPrimary: true,
          latitude: true,
          longitude: true,
          timezone: true,
          pickupEnabled: true,
          returnEnabled: true,
          afterHoursReturnEnabled: true,
          keyBoxAvailable: true,
          capacity: true,
          openingHours: true,
          holidayRules: true,
        },
      });
      stationsScanned += stations.length;

      const vehicles = await this.prisma.vehicle.findMany({
        where: { organizationId: org.id },
        select: {
          id: true,
          organizationId: true,
          homeStationId: true,
          currentStationId: true,
          expectedStationId: true,
          currentStationSource: true,
          expectedStationSource: true,
          expectedStationSetAt: true,
        },
      });
      vehiclesScanned += vehicles.length;

      const bookings = await this.prisma.booking.findMany({
        where: {
          organizationId: org.id,
          status: { in: BOOKING_RULE_SCAN_STATUSES },
          endDate: { gte: referenceNow, lte: bookingCutoff },
        },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          pickupStationId: true,
          returnStationId: true,
          isOneWayRental: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      });
      bookingsScanned += bookings.length;

      const [memberships, roles, userPrefs, transfers] = await Promise.all([
        this.prisma.organizationMembership.findMany({
          where: { organizationId: org.id },
          select: {
            id: true,
            stationIds: true,
            stationScope: true,
          },
        }),
        this.prisma.organizationRole.findMany({
          where: { organizationId: org.id },
          select: {
            id: true,
            defaultStationIds: true,
            stationScopeDefault: true,
          },
        }),
        this.prisma.userAccountPreference.findMany({
          where: { organizationId: org.id },
          select: {
            id: true,
            defaultStationId: true,
          },
        }),
        this.prisma.vehicleStationTransfer.findMany({
          where: {
            organizationId: org.id,
            status: { in: [...ACTIVE_TRANSFER_STATUSES] },
          },
          select: {
            vehicleId: true,
            toStationId: true,
            status: true,
          },
        }),
      ]);
      membershipsScanned += memberships.length + roles.length + userPrefs.length;

      orgScanCounts.set(org.id, {
        stationsScanned: stations.length,
        vehiclesScanned: vehicles.length,
        bookingsScanned: bookings.length,
        membershipsScanned: memberships.length + roles.length + userPrefs.length,
      });

      const stationById = new Map(stations.map((s) => [s.id, s]));
      const archivedStationIds = new Set(
        stations.filter((s) => s.status === StationStatus.ARCHIVED).map((s) => s.id),
      );
      const validStationIds = new Set(stations.map((s) => s.id));

      findings.push(...this.checkPrimaryInvariants(org.id, stations));

      for (const station of stations) {
        findings.push(...this.checkStationMasterData(org.id, station));
        findings.push(...this.checkStationKpis(org.id, station, vehicles));
      }

      const transferToByVehicle = new Map<string, string>();
      for (const transfer of transfers) {
        transferToByVehicle.set(transfer.vehicleId, transfer.toStationId);
      }

      const returnStationByVehicle = new Map<string, string>();
      for (const booking of bookings) {
        if (
          booking.status === BookingStatus.ACTIVE ||
          booking.status === BookingStatus.CONFIRMED
        ) {
          if (booking.returnStationId) {
            returnStationByVehicle.set(booking.vehicleId, booking.returnStationId);
          }
        }
      }

      for (const vehicle of vehicles) {
        findings.push(
          ...this.checkVehiclePositioning(
            org.id,
            vehicle,
            archivedStationIds,
            transferToByVehicle,
            returnStationByVehicle,
          ),
        );
      }

      for (const booking of bookings) {
        findings.push(
          ...this.checkBookingRules(org.id, booking, stationById),
        );
      }

      findings.push(
        ...this.checkStaleScopeIds(org.id, {
          memberships,
          roles,
          userPrefs,
          validStationIds,
          archivedStationIds,
        }),
      );
    }

    return this.buildReport({
      findings,
      stationsScanned,
      vehiclesScanned,
      bookingsScanned,
      membershipsScanned,
      organizationId: options.organizationId ?? null,
      organizationCount: orgRows.length,
      referenceNow,
      sampleLimit,
      includeFindings: options.includeFindings ?? false,
      orgScanCounts,
    });
  }

  private checkPrimaryInvariants(
    organizationId: string,
    stations: StationRow[],
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];
    const nonArchivedPrimaries = stations.filter(
      (s) => s.isPrimary && s.status !== StationStatus.ARCHIVED,
    );

    if (stations.some((s) => s.status !== StationStatus.ARCHIVED) && nonArchivedPrimaries.length === 0) {
      out.push(
        buildDiagnosticFinding('primary_none', {
          organizationId,
          message: 'Organization has stations but no non-archived primary station',
        }),
      );
    }

    if (nonArchivedPrimaries.length > 1) {
      for (const station of nonArchivedPrimaries) {
        out.push(
          buildDiagnosticFinding('primary_multiple', {
            organizationId,
            stationId: station.id,
            message: `Multiple primary stations detected (${nonArchivedPrimaries.length} total)`,
            details: { primaryCount: nonArchivedPrimaries.length },
          }),
        );
      }
    }

    for (const station of stations) {
      if (
        station.isPrimary &&
        (station.status === StationStatus.ARCHIVED || station.status === StationStatus.INACTIVE)
      ) {
        out.push(
          buildDiagnosticFinding('primary_on_archived_or_inactive', {
            organizationId,
            stationId: station.id,
            message: `Primary flag on ${station.status} station`,
            details: { status: station.status },
          }),
        );
      }
    }

    return out;
  }

  private checkStationMasterData(
    organizationId: string,
    station: StationRow,
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];

    if (stationHasActiveCapabilities(station)) {
      out.push(
        buildDiagnosticFinding('archived_active_capabilities', {
          organizationId,
          stationId: station.id,
          message: 'Archived station still has pickup or return enabled',
          details: {
            pickupEnabled: station.pickupEnabled,
            returnEnabled: station.returnEnabled,
          },
        }),
      );
    }

    const coords = inspectStationCoordinatePair(station.latitude, station.longitude);
    if (!coords.valid) {
      out.push(
        buildDiagnosticFinding('invalid_coordinates', {
          organizationId,
          stationId: station.id,
          message: coords.message ?? 'Invalid coordinates',
          details: { code: coords.code ?? null },
        }),
      );
    }

    const tz = inspectStationTimezone(station.timezone);
    if (!tz.valid) {
      out.push(
        buildDiagnosticFinding('invalid_timezone', {
          organizationId,
          stationId: station.id,
          message: tz.message ?? 'Invalid timezone',
          details: { timezone: station.timezone },
        }),
      );
    }

    if (station.openingHours != null) {
      const hours = inspectStationOpeningHours(station.openingHours);
      if (!hours.valid) {
        out.push(
          buildDiagnosticFinding('invalid_opening_hours', {
            organizationId,
            stationId: station.id,
            message: hours.message ?? 'Invalid opening hours',
            details: { code: hours.code ?? null },
          }),
        );
      }
    }

    return out;
  }

  private checkStationKpis(
    organizationId: string,
    station: StationRow,
    vehicles: VehicleRow[],
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];
    const orgVehicles = vehicles.map((v) => ({
      id: v.id,
      homeStationId: v.homeStationId,
      currentStationId: v.currentStationId,
    }));

    const countedHomeFleet = vehicles.filter((v) => v.homeStationId === station.id).length;
    const homeDeviation = evaluateKpiHomeFleetDeviation({
      stationId: station.id,
      countedHomeFleet,
      vehicles: orgVehicles,
    });
    if (homeDeviation != null) {
      out.push(
        buildDiagnosticFinding('kpi_home_fleet_deviation', {
          organizationId,
          stationId: station.id,
          message: 'Home fleet KPI resolver count differs from direct homeStationId count',
          details: { countedHomeFleet, resolvedHomeFleet: homeDeviation },
        }),
      );
    }

    const countedOnSite = vehicles.filter((v) => v.currentStationId === station.id).length;
    const onSiteDeviation = evaluateKpiCurrentOnSiteDeviation({
      stationId: station.id,
      countedOnSite,
      vehicles: orgVehicles,
    });
    if (onSiteDeviation != null) {
      out.push(
        buildDiagnosticFinding('kpi_current_on_site_deviation', {
          organizationId,
          stationId: station.id,
          message: 'Current on-site KPI resolver count differs from direct currentStationId count',
          details: { countedOnSite, resolvedOnSite: onSiteDeviation },
        }),
      );
    }

    return out;
  }

  private checkVehiclePositioning(
    organizationId: string,
    vehicle: VehicleRow,
    archivedStationIds: Set<string>,
    transferToByVehicle: Map<string, string>,
    returnStationByVehicle: Map<string, string>,
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];

    if (
      vehicle.homeStationId &&
      vehicle.currentStationId &&
      vehicle.homeStationId === vehicle.currentStationId &&
      !vehicle.currentStationSource
    ) {
      out.push(
        buildDiagnosticFinding('home_current_coupling_suspect', {
          organizationId,
          vehicleId: vehicle.id,
          stationId: vehicle.currentStationId,
          message: 'Home and current station match without position source provenance',
        }),
      );
    }

    if (vehicle.currentStationId && !vehicle.currentStationSource) {
      out.push(
        buildDiagnosticFinding('current_without_source', {
          organizationId,
          vehicleId: vehicle.id,
          stationId: vehicle.currentStationId,
          message: 'Current station is set without currentStationSource',
        }),
      );
    }

    if (vehicle.expectedStationId) {
      const expectedEval = evaluateExpectedStationSnapshot({
        expectedStationId: vehicle.expectedStationId,
        expectedStationSource: vehicle.expectedStationSource,
        expectedStationSetAt: vehicle.expectedStationSetAt,
      });

      if (expectedEval.missingProvenance) {
        out.push(
          buildDiagnosticFinding('expected_without_valid_context', {
            organizationId,
            vehicleId: vehicle.id,
            stationId: vehicle.expectedStationId,
            message: 'Expected station set without source or timestamp',
          }),
        );
      } else {
        const contextStillValid = isExpectedContextStillValid({
          expectedStationId: vehicle.expectedStationId,
          activeTransferToStationId: transferToByVehicle.get(vehicle.id) ?? null,
          activeBookingReturnStationId: returnStationByVehicle.get(vehicle.id) ?? null,
        });
        const staleEval = evaluateStaleExpected(
          {
            expectedStationId: vehicle.expectedStationId,
            expectedStationSource: vehicle.expectedStationSource,
            expectedStationSetAt: vehicle.expectedStationSetAt,
          },
          contextStillValid,
        );
        if (staleEval.stale) {
          out.push(
            buildDiagnosticFinding('expected_stale_context', {
              organizationId,
              vehicleId: vehicle.id,
              stationId: vehicle.expectedStationId,
              message: 'Expected station has no matching active transfer or booking return context',
            }),
          );
        }
      }
    }

    for (const [field, stationId] of [
      ['home', vehicle.homeStationId],
      ['current', vehicle.currentStationId],
      ['expected', vehicle.expectedStationId],
    ] as const) {
      if (stationId && archivedStationIds.has(stationId)) {
        out.push(
          buildDiagnosticFinding('vehicles_on_archived_stations', {
            organizationId,
            vehicleId: vehicle.id,
            stationId,
            message: `Vehicle ${field} station points to an archived station`,
            details: { field },
          }),
        );
      }
    }

    return out;
  }

  private checkBookingRules(
    organizationId: string,
    booking: {
      id: string;
      pickupStationId: string | null;
      returnStationId: string | null;
      isOneWayRental: boolean;
      startDate: Date;
      endDate: Date;
    },
    stationById: Map<string, StationRow>,
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];
    const pickupStation = booking.pickupStationId
      ? stationById.get(booking.pickupStationId)
      : null;
    const returnStation = booking.returnStationId
      ? stationById.get(booking.returnStationId)
      : null;

    const { pickupOutcome, returnOutcome } = evaluateBookingRuleSides({
      organizationId,
      pickupStation: pickupStation ? toBookingRulesStationInput(pickupStation) : null,
      returnStation: returnStation ? toBookingRulesStationInput(returnStation) : null,
      pickupAt: booking.startDate,
      returnAt: booking.endDate,
    });

    for (const [side, outcome, stationId] of [
      ['pickup', pickupOutcome, booking.pickupStationId],
      ['return', returnOutcome, booking.returnStationId],
    ] as const) {
      const severity = resolveBookingRuleSeverity(outcome);
      if (!severity) continue;
      out.push(
        buildDiagnosticFinding('booking_rule_violation', {
          organizationId,
          bookingId: booking.id,
          stationId: stationId ?? undefined,
          severity,
          message: `Booking ${side} evaluates to ${outcome}`,
          details: { side, outcome },
        }),
      );
    }

    return out;
  }

  private checkStaleScopeIds(
    organizationId: string,
    input: {
      memberships: Array<{ id: string; stationIds: Prisma.JsonValue; stationScope: string | null }>;
      roles: Array<{
        id: string;
        defaultStationIds: Prisma.JsonValue;
        stationScopeDefault: string | null;
      }>;
      userPrefs: Array<{ id: string; defaultStationId: string | null }>;
      validStationIds: Set<string>;
      archivedStationIds: Set<string>;
    },
  ): StationsV2DiagnosticFinding[] {
    const out: StationsV2DiagnosticFinding[] = [];

    const flagStale = (
      membershipId: string,
      stationId: string,
      source: string,
    ) => {
      const unknown = !input.validStationIds.has(stationId);
      const archived = input.archivedStationIds.has(stationId);
      if (!unknown && !archived) return;
      out.push(
        buildDiagnosticFinding('stale_scope_station_ids', {
          organizationId,
          membershipId,
          stationId,
          message: unknown
            ? `Scope references unknown station ID from ${source}`
            : `Scope references archived station ID from ${source}`,
          details: { source, unknown, archived },
        }),
      );
    };

    for (const membership of input.memberships) {
      for (const stationId of collectScopeStationIdCandidates({
        stationIds: membership.stationIds,
        stationScope: membership.stationScope,
      })) {
        flagStale(membership.id, stationId, 'organization_membership');
      }
    }

    for (const role of input.roles) {
      for (const stationId of collectScopeStationIdCandidates({
        defaultStationIds: role.defaultStationIds,
        stationScopeDefault: role.stationScopeDefault,
      })) {
        flagStale(role.id, stationId, 'organization_role');
      }
    }

    for (const pref of input.userPrefs) {
      if (!pref.defaultStationId) continue;
      flagStale(pref.id, pref.defaultStationId, 'user_account_preference');
    }

    return out;
  }

  private buildReport(input: {
    findings: StationsV2DiagnosticFinding[];
    stationsScanned: number;
    vehiclesScanned: number;
    bookingsScanned: number;
    membershipsScanned: number;
    organizationId: string | null;
    organizationCount: number;
    referenceNow: Date;
    sampleLimit: number;
    includeFindings: boolean;
    orgScanCounts: Map<
      string,
      {
        stationsScanned: number;
        vehiclesScanned: number;
        bookingsScanned: number;
        membershipsScanned: number;
      }
    >;
  }): StationsV2DiagnosticReport {
    const byCategory = this.emptyCategoryCounts();
    const byCheck: Partial<Record<StationsV2DiagnosticCheckId, number>> = {};
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

    const checks = (
      Object.keys(STATIONS_V2_DIAGNOSTIC_CHECK_META) as StationsV2DiagnosticCheckId[]
    )
      .map((checkId) => {
        const related = input.findings.filter((f) => f.checkId === checkId);
        if (related.length === 0) return null;
        const meta = STATIONS_V2_DIAGNOSTIC_CHECK_META[checkId];
        return {
          checkId,
          category: meta.category,
          severity: meta.severity,
          label: meta.label,
          remediation: meta.remediation,
          count: related.length,
          sampleStationIds: related
            .map((f) => f.stationId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskStationsV2DiagnosticId),
          sampleVehicleIds: related
            .map((f) => f.vehicleId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskStationsV2DiagnosticId),
          sampleBookingIds: related
            .map((f) => f.bookingId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskStationsV2DiagnosticId),
          sampleMembershipIds: related
            .map((f) => f.membershipId)
            .filter((id): id is string => !!id)
            .slice(0, input.sampleLimit)
            .map(maskStationsV2DiagnosticId),
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
      stationsScanned: input.stationsScanned,
      vehiclesScanned: input.vehiclesScanned,
      bookingsScanned: input.bookingsScanned,
      membershipsScanned: input.membershipsScanned,
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
        ? input.findings
            .slice(0, input.sampleLimit * Math.max(checks.length, 1))
            .map((f) => this.maskFindingIds(f))
        : undefined,
    };
  }

  private maskFindingIds(finding: StationsV2DiagnosticFinding): StationsV2DiagnosticFinding {
    return {
      ...finding,
      organizationId: maskStationsV2DiagnosticId(finding.organizationId),
      stationId: finding.stationId
        ? maskStationsV2DiagnosticId(finding.stationId)
        : undefined,
      vehicleId: finding.vehicleId
        ? maskStationsV2DiagnosticId(finding.vehicleId)
        : undefined,
      bookingId: finding.bookingId
        ? maskStationsV2DiagnosticId(finding.bookingId)
        : undefined,
      membershipId: finding.membershipId
        ? maskStationsV2DiagnosticId(finding.membershipId)
        : undefined,
    };
  }

  private buildOrgSummaries(
    findings: StationsV2DiagnosticFinding[],
    orgScanCounts: Map<
      string,
      {
        stationsScanned: number;
        vehiclesScanned: number;
        bookingsScanned: number;
        membershipsScanned: number;
      }
    >,
  ): StationsV2DiagnosticOrgSummary[] {
    const map = new Map<string, StationsV2DiagnosticOrgSummary>();
    for (const [organizationId, counts] of orgScanCounts) {
      map.set(organizationId, {
        organizationId: maskStationsV2DiagnosticId(organizationId),
        stationsScanned: counts.stationsScanned,
        vehiclesScanned: counts.vehiclesScanned,
        bookingsScanned: counts.bookingsScanned,
        membershipsScanned: counts.membershipsScanned,
        totalFindings: 0,
        byCheck: {},
      });
    }
    for (const finding of findings) {
      const maskedOrgId = maskStationsV2DiagnosticId(finding.organizationId);
      const existing =
        map.get(finding.organizationId) ??
        ({
          organizationId: maskedOrgId,
          stationsScanned: 0,
          vehiclesScanned: 0,
          bookingsScanned: 0,
          membershipsScanned: 0,
          totalFindings: 0,
          byCheck: {},
        } satisfies StationsV2DiagnosticOrgSummary);
      existing.totalFindings += 1;
      existing.byCheck[finding.checkId] = (existing.byCheck[finding.checkId] ?? 0) + 1;
      map.set(finding.organizationId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalFindings - a.totalFindings);
  }

  private emptyCategoryCounts(): Record<StationsV2DiagnosticCategory, number> {
    return {
      primary_invariant: 0,
      lifecycle_capabilities: 0,
      location_masterdata: 0,
      opening_hours: 0,
      vehicle_positioning: 0,
      expected_station: 0,
      archived_station_links: 0,
      booking_rules: 0,
      access_scope: 0,
      kpi_consistency: 0,
    };
  }
}
