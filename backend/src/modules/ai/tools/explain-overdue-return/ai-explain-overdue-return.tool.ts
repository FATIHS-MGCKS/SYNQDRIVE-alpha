import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildFleetBookingContextFromRows } from '@modules/vehicles/operational/fleet-booking-context.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import {
  OVERDUE_RETURN_INCONSISTENCY_FLAG,
  buildOverdueReturnExplanation,
  type OverdueReturnExplanation,
} from '@modules/bookings/overdue-return';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import {
  assertAiBookingAccess,
  assertAiLocationAccess,
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from '../../execution/ai-execution-context.access';
import type { AiVehicleScopeResolver, AiDataAuthorizationProbe } from '../../execution/ai-execution-context.types';
import type { AiDomainError, AiDomainQueryOutcome } from '../../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  createVehicleNotFoundError,
} from '../../evidence/ai-domain-error.factory';
import { createObservedAiEvidence } from '../../evidence/ai-evidence.factory';
import type { AiEvidence } from '../../evidence/ai-evidence.types';
import { buildAiVehicleDisplayName } from '../../vehicle-resolution/ai-vehicle-resolution.hints';
import { resolveTelemetryFreshness } from '@modules/vehicles/telemetry-freshness.resolver';
import type {
  AiExplainOverdueReturnData,
  AiExplainOverdueReturnInput,
  AiLatestKnownLocationRef,
} from './ai-explain-overdue-return.types';

interface LoadedBookingRow {
  id: string;
  vehicleId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  actualReturnStationId: string | null;
  customer: { firstName: string; lastName: string; company: string | null };
  vehicle: {
    id: string;
    licensePlate: string | null;
    vehicleName: string | null;
    make: string;
    model: string;
    year: number;
  };
  handoverProtocols: Array<{
    kind: 'PICKUP' | 'RETURN';
    performedAt: Date;
  }>;
  pricingQuote: { returnAt: Date } | null;
}

@Injectable()
export class AiExplainOverdueReturnTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleScopeResolver: AiVehicleScopeResolver,
    private readonly dataAuthorizationProbe: AiDataAuthorizationProbe,
  ) {}

  async execute(
    context: AiExecutionContext | null | undefined,
    input: AiExplainOverdueReturnInput,
    nowMs: number = Date.now(),
  ): Promise<AiDomainQueryOutcome<AiExplainOverdueReturnData | null>> {
    const tenantId = context?.organizationId ?? 'unknown';
    const now = new Date(nowMs);

    const toolGate = assertAiToolExecutionAllowed(context);
    if (toolGate !== true) {
      return this.blockedOutcome(tenantId, toolGate);
    }

    const verifiedContext = context as AiExecutionContext;
    const bookingGate = assertAiBookingAccess(verifiedContext);
    if (bookingGate !== true) {
      return this.blockedOutcome(tenantId, bookingGate);
    }

    const vehicleAccess = await resolveAiVehicleAccess(
      verifiedContext,
      { vehicleId: input.vehicleId },
      this.vehicleScopeResolver,
    );
    if ('code' in vehicleAccess) {
      return this.blockedOutcome(tenantId, vehicleAccess);
    }

    const orgTimezone = await this.resolveOrgTimezone(verifiedContext.organizationId);
    const activeBooking = await this.loadActiveBooking(
      verifiedContext.organizationId,
      vehicleAccess.vehicleId,
    );

    let booking: LoadedBookingRow | null = null;
    if (input.bookingId) {
      booking = await this.loadBookingById(
        verifiedContext.organizationId,
        vehicleAccess.vehicleId,
        input.bookingId,
      );
    } else {
      booking = activeBooking;
    }

    if (!booking) {
      return buildAiDomainQueryOutcome({
        tenantId,
        data: null,
        errors: [createVehicleNotFoundError({ entityId: vehicleAccess.vehicleId })],
        evidence: [],
      });
    }

    const pickup = booking.handoverProtocols.find((p) => p.kind === 'PICKUP') ?? null;
    const ret = booking.handoverProtocols.find((p) => p.kind === 'RETURN') ?? null;

    const fleetActiveIsOverdue = activeBooking
      ? this.resolveFleetActiveIsOverdue(activeBooking, now, orgTimezone)
      : null;

    const explanation = buildOverdueReturnExplanation({
      booking,
      pickupProtocol: pickup,
      returnProtocol: ret,
      orgTimezone,
      now,
      originalScheduledReturnAt: booking.pricingQuote?.returnAt ?? null,
      fleetActiveIsOverdue,
    });

    const stationMap = await this.loadStationNames([
      booking.returnStationId,
      booking.actualReturnStationId,
    ]);

    let enriched = this.enrichWithStationNames(explanation, booking, stationMap);
    const isCurrentCauseBooking =
      activeBooking != null && activeBooking.id === booking.id && booking.status === 'ACTIVE';

    if (!isCurrentCauseBooking && activeBooking && booking.id !== activeBooking.id) {
      enriched = {
        ...enriched,
        inconsistencyFlags: [
          ...new Set([
            ...enriched.inconsistencyFlags,
            OVERDUE_RETURN_INCONSISTENCY_FLAG.HISTORICAL_BOOKING_NOT_CURRENT,
          ]),
        ],
      };
    }

    const locationAuthorized = await assertAiLocationAccess(
      verifiedContext,
      this.dataAuthorizationProbe,
      vehicleAccess.vehicleId,
    );
    const latestKnownLocation =
      locationAuthorized === true
        ? await this.loadLatestKnownLocation(vehicleAccess.vehicleId, nowMs)
        : null;

    const data: AiExplainOverdueReturnData = {
      ...enriched,
      displayName: buildAiVehicleDisplayName({
        vehicleName: booking.vehicle.vehicleName,
        make: booking.vehicle.make,
        model: booking.vehicle.model,
        year: booking.vehicle.year,
        licensePlate: booking.vehicle.licensePlate,
      }),
      licensePlate: booking.vehicle.licensePlate,
      latestKnownLocation,
      explanation: this.buildExplanationText(enriched, isCurrentCauseBooking),
      isCurrentCauseBooking,
    };

    const evidence = this.buildEvidence(tenantId, data);

    return buildAiDomainQueryOutcome({
      tenantId,
      data,
      evidence,
    });
  }

  private enrichWithStationNames(
    explanation: OverdueReturnExplanation,
    booking: LoadedBookingRow,
    stationMap: Map<string, string>,
  ): OverdueReturnExplanation & {
    returnStation: { stationId: string | null; stationName: string | null };
  } {
    const plannedName = booking.returnStationId
      ? stationMap.get(booking.returnStationId) ?? null
      : null;
    const actualName = booking.actualReturnStationId
      ? stationMap.get(booking.actualReturnStationId) ?? null
      : null;
    return {
      ...explanation,
      returnStation: {
        stationId: booking.actualReturnStationId ?? booking.returnStationId,
        stationName: actualName ?? plannedName,
      },
    };
  }

  private async loadActiveBooking(
    organizationId: string,
    vehicleId: string,
  ): Promise<LoadedBookingRow | null> {
    const active = await this.prisma.booking.findFirst({
      where: { organizationId, vehicleId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      include: this.bookingInclude(),
    });
    return active as LoadedBookingRow | null;
  }

  private async loadBookingById(
    organizationId: string,
    vehicleId: string,
    bookingId: string,
  ): Promise<LoadedBookingRow | null> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId, vehicleId },
      include: this.bookingInclude(),
    });
    return row as LoadedBookingRow | null;
  }

  private resolveFleetActiveIsOverdue(
    activeBooking: LoadedBookingRow,
    now: Date,
    orgTimezone: string,
  ): boolean {
    const fleetContext = buildFleetBookingContextFromRows({
      rows: [
        {
          id: activeBooking.id,
          vehicleId: activeBooking.vehicleId,
          status: activeBooking.status,
          startDate: activeBooking.startDate,
          endDate: activeBooking.endDate,
          kmIncluded: null,
          kmDriven: null,
          pickupStationId: activeBooking.pickupStationId,
          returnStationId: activeBooking.returnStationId,
          customer: activeBooking.customer,
        },
      ],
      now,
      orgTimezone,
      stationMap: new Map(),
      fmtCustomer: () => '',
    });
    return fleetContext.map.get(activeBooking.vehicleId)?.activeIsOverdue ?? false;
  }

  private bookingInclude() {
    return {
      customer: {
        select: { firstName: true, lastName: true, company: true },
      },
      vehicle: {
        select: {
          id: true,
          licensePlate: true,
          vehicleName: true,
          make: true,
          model: true,
          year: true,
        },
      },
      handoverProtocols: {
        select: { kind: true, performedAt: true },
        orderBy: { performedAt: 'asc' as const },
      },
      pricingQuote: { select: { returnAt: true } },
    };
  }

  private async loadStationNames(stationIds: Array<string | null>): Promise<Map<string, string>> {
    const ids = [...new Set(stationIds.filter((x): x is string => Boolean(x)))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.station.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async resolveOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  private async loadLatestKnownLocation(
    vehicleId: string,
    nowMs: number,
  ): Promise<AiLatestKnownLocationRef | null> {
    const row = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        latitude: true,
        longitude: true,
        lastSeenAt: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;

    const freshness = resolveTelemetryFreshness(
      {
        providerObservedAt: row.sourceTimestamp,
        lastValidTelemetryAt: row.lastSeenAt,
        latestStateUpdatedAt: row.updatedAt,
      },
      nowMs,
    );

    return {
      latitude: row.latitude,
      longitude: row.longitude,
      observedAt: freshness.observedAtIso,
      freshness: freshness.freshness,
      isLastKnownLocation: freshness.freshness !== 'live',
    };
  }

  private buildExplanationText(
    data: OverdueReturnExplanation,
    isCurrentCauseBooking: boolean,
  ): string {
    if (!isCurrentCauseBooking) {
      return 'Die angegebene Buchung ist nicht die aktuelle ACTIVE-Buchung des Fahrzeugs; sie wird nicht als aktuelle Überfälligkeitsursache verwendet.';
    }
    if (!data.isMarkedOverdue) {
      return 'Das Fahrzeug wird derzeit nicht als überfällige Rückgabe angezeigt.';
    }
    const parts = [
      `Geplante Rückgabe war ${data.scheduledReturnAt}.`,
      `Rücknahme-Handover: ${data.returnStatus}.`,
    ];
    if (data.overdueDurationMinutes != null) {
      parts.push(`Überfällig seit ${data.overdueDurationMinutes} Minuten.`);
    }
    if (data.inconsistencyFlags.length > 0) {
      parts.push(`Inkonsistenzen: ${data.inconsistencyFlags.join(', ')}.`);
    }
    return parts.join(' ');
  }

  private buildEvidence(tenantId: string, data: AiExplainOverdueReturnData): AiEvidence[] {
    return [
      createObservedAiEvidence({
        tenantId,
        entityId: data.bookingId,
        source: 'bookings_service',
        sourceEntity: { kind: 'booking', id: data.bookingId },
        observedAt: data.calculatedAt,
        freshness: 'not_applicable',
        confidence: 'high',
        availability: 'available',
        reasonCode: data.isMarkedOverdue ? 'stale_data' : 'ok',
        sensitivity: 'internal',
        value: {
          isMarkedOverdue: data.isMarkedOverdue,
          scheduledReturnAt: data.scheduledReturnAt,
          reasonCodes: [...data.reasonCodes],
          inconsistencyFlags: [...data.inconsistencyFlags],
          isCurrentCauseBooking: data.isCurrentCauseBooking,
        },
      }),
    ];
  }

  private blockedOutcome(
    tenantId: string,
    error: AiDomainError,
  ): AiDomainQueryOutcome<AiExplainOverdueReturnData | null> {
    return buildAiDomainQueryOutcome({
      tenantId,
      data: null,
      errors: [error],
    });
  }
}
