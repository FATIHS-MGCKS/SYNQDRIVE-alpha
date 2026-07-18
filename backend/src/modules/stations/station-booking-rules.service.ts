import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StationCalendarExceptionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import {
  assessBookingRulesManualOverride,
  attachBookingRulesManualOverrideAudit,
  buildBookingRulesEvaluationScope,
  buildBookingRulesOverrideReference,
} from '@shared/stations/station-booking-rules-manual-override';
import {
  evaluateStationBookingRules,
  getStationBookingRulesMetadata,
} from '@shared/stations/station-booking-rules.resolver';
import { evaluatePickupBookingRules } from '@shared/stations/station-booking-pickup-rules';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  getStationBookingRulesContractMetadata,
  type StationBookingRulesInput,
  type StationBookingRulesResult,
  type StationBookingRulesStationInput,
  type StationBookingRulesVehicleInput,
  type StationBookingRulesBookingContext,
} from '@shared/stations/station-booking-rules.contract';
import { getStationBookingPickupRulesMetadata } from '@shared/stations/station-booking-pickup-rules.contract';
import { evaluateReturnBookingRules } from '@shared/stations/station-booking-return-rules';
import { getStationBookingReturnRulesMetadata } from '@shared/stations/station-booking-return-rules.contract';
import {
  loadConcurrentCapacityProjection,
  loadStationCapacityVehicles,
  type StationCapacityProjectionDb,
} from '@shared/stations/station-capacity-projection.util';
import { getStationRuleManualOverrideContractMetadata } from '@shared/stations/station-rule-manual-override.contract';
import { STATION_RULE_MANUAL_OVERRIDE_PERMISSION } from '@shared/stations/station-rule-manual-override.contract';
import type { StationRuleManualOverrideInput } from '@shared/stations/station-rule-manual-override.contract';
import { StationRuleManualOverrideReferenceType } from '@shared/stations/station-rule-manual-override.contract';
import { StationOperationalCalendarExceptionInput } from '@shared/stations/station-operational-capability.resolver';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationsAccessService } from './stations-access.service';
import type { EvaluateStationBookingRulesDto } from './dto/evaluate-station-booking-rules.dto';

type StationBookingRulesLoadRow = {
  id: string;
  organizationId: string;
  status: import('@prisma/client').StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  timezone: string | null;
  openingHours: unknown;
  holidayRules: unknown;
  capacity: number | null;
  calendarExceptions: Array<{
    id: string;
    type: import('@prisma/client').StationCalendarExceptionType;
    title: string;
    recurrenceKind: import('@prisma/client').StationCalendarRecurrenceKind;
    calendarDate: Date | null;
    monthDay: string | null;
    closedAllDay: boolean;
    slots: unknown;
    regionCode: string | null;
    priority: number;
    source: import('@prisma/client').StationCalendarExceptionSource;
  }>;
};

@Injectable()
export class StationBookingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
    private readonly stationsAccess: StationsAccessService,
    private readonly manualOverrideService: StationRuleManualOverrideService,
  ) {}

  evaluate(input: StationBookingRulesInput): StationBookingRulesResult {
    return evaluateStationBookingRules(input);
  }

  async evaluateRequest(
    organizationId: string,
    body: EvaluateStationBookingRulesDto,
    scope?: StationScopeContext,
    actor?: PermissionActor,
  ): Promise<StationBookingRulesResult> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const [pickupStation, returnStation, vehicle] = await Promise.all([
      this.loadStationInput(
        access.orgId,
        body.pickupStationId,
        access,
        new Date(body.pickupDateTime),
        body.vehicleId,
      ),
      this.loadStationInput(
        access.orgId,
        body.returnStationId,
        access,
        new Date(body.returnDateTime),
        body.vehicleId,
      ),
      body.vehicleId ? this.loadVehicleInput(access.orgId, body.vehicleId) : Promise.resolve(null),
    ]);

    const manualOverride = this.resolveManualOverride(body);
    const bookingContext = (body.bookingContext as StationBookingRulesBookingContext | null | undefined) ?? null;

    const baseResult = this.evaluate({
      organizationId: access.orgId,
      pickupStation,
      returnStation,
      pickupDateTime: body.pickupDateTime,
      returnDateTime: body.returnDateTime,
      bookingType: body.bookingType,
      vehicle,
      bookingContext,
    });

    const overrideScope = buildBookingRulesEvaluationScope({
      organizationId: access.orgId,
      pickupStationId: body.pickupStationId,
      returnStationId: body.returnStationId,
      pickupDateTime: body.pickupDateTime,
      returnDateTime: body.returnDateTime,
      bookingType: body.bookingType,
      vehicleId: body.vehicleId ?? null,
    });

    const assessment = assessBookingRulesManualOverride({
      result: baseResult,
      manualOverride,
      actorUserId: actor?.id ?? null,
      scope: overrideScope,
      reference: buildBookingRulesOverrideReference({
        bookingId: bookingContext?.bookingId ?? null,
      }),
    });

    if (!manualOverride) {
      return assessment.result;
    }

    if (!actor?.id) {
      throw new ForbiddenException('Authentication is required to apply a manual override.');
    }

    await this.stationsAccess.assertStationsPermission(
      access.orgId,
      actor,
      STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
    );

    if (!assessment.manualOverrideApplied) {
      throw new BadRequestException({
        message: 'Manual override could not be applied.',
        issues: assessment.validation.issues,
      });
    }

    const audit = await this.manualOverrideService.persistAppliedOverride({
      organizationId: access.orgId,
      referenceType: StationRuleManualOverrideReferenceType.BOOKING_RULES,
      reference: buildBookingRulesOverrideReference({
        bookingId: bookingContext?.bookingId ?? null,
      }),
      scope: overrideScope,
      actorUserId: actor.id,
      manualOverride,
      evaluations: [...baseResult.pickup.evaluations, ...baseResult.return.evaluations],
    });

    return attachBookingRulesManualOverrideAudit(assessment.result, audit);
  }

  private resolveManualOverride(
    body: EvaluateStationBookingRulesDto,
  ): StationRuleManualOverrideInput | null {
    const context = body.bookingContext;
    if (context?.manualOverride?.reason?.trim()) {
      return {
        reason: context.manualOverride.reason.trim(),
        expiresAt: context.manualOverride.expiresAt ?? null,
      };
    }

    const legacy = context?.adminOverride;
    if (legacy?.enabled && legacy.reason?.trim()) {
      return { reason: legacy.reason.trim() };
    }

    return null;
  }

  evaluateReturn(
    input: Omit<StationBookingRulesInput, 'pickupStation' | 'pickupDateTime'> & {
      returnAt?: Date | string;
    },
  ) {
    const policy = {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...input.organizationPolicy,
    };
    const returnAt =
      input.returnAt instanceof Date
        ? input.returnAt
        : new Date(input.returnAt ?? input.returnDateTime);

    return evaluateReturnBookingRules({
      organizationId: input.organizationId,
      station: input.returnStation,
      returnAt,
      vehicle: input.vehicle,
      policy,
      bookingContext: input.bookingContext,
    });
  }

  evaluatePickup(
    input: Omit<StationBookingRulesInput, 'returnStation' | 'returnDateTime'> & {
      pickupAt?: Date | string;
    },
  ) {
    const policy = {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...input.organizationPolicy,
    };
    const pickupAt =
      input.pickupAt instanceof Date
        ? input.pickupAt
        : new Date(input.pickupAt ?? input.pickupDateTime);

    return evaluatePickupBookingRules({
      organizationId: input.organizationId,
      station: input.pickupStation,
      pickupAt,
      vehicle: input.vehicle,
      policy,
      bookingContext: input.bookingContext,
    });
  }

  getContractMetadata() {
    return getStationBookingRulesContractMetadata();
  }

  getPickupRulesMetadata() {
    return getStationBookingPickupRulesMetadata();
  }

  getReturnRulesMetadata() {
    return getStationBookingReturnRulesMetadata();
  }

  getMetadata() {
    return getStationBookingRulesMetadata();
  }

  getManualOverrideMetadata() {
    return getStationRuleManualOverrideContractMetadata();
  }

  async linkOverrideAuditToBooking(
    organizationId: string,
    overrideId: string,
    bookingId: string,
  ): Promise<void> {
    await this.manualOverrideService.linkBookingReference(organizationId, overrideId, bookingId);
  }

  private async loadStationInput(
    organizationId: string,
    stationId: string,
    access: ReturnType<StationAccessScopeService['resolveFromContextOrEmpty']>,
    evaluatedAt: Date,
    vehicleId?: string | null,
  ): Promise<StationBookingRulesStationInput> {
    const station = (await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        status: true,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        timezone: true,
        openingHours: true,
        holidayRules: true,
        capacity: true,
        calendarExceptions: {
          where: { status: StationCalendarExceptionStatus.ACTIVE },
          orderBy: [{ priority: 'desc' }, { calendarDate: 'asc' }],
        },
      },
    })) as unknown as StationBookingRulesLoadRow;

    const mapped = this.mapStationRow(station);

    if (station.capacity == null) {
      return mapped;
    }

    const [capacityVehicles, capacityBookingProjection] = await Promise.all([
      loadStationCapacityVehicles(
        this.prisma as unknown as StationCapacityProjectionDb,
        organizationId,
        stationId,
      ),
      loadConcurrentCapacityProjection(
        this.prisma as unknown as StationCapacityProjectionDb,
        organizationId,
        stationId,
        evaluatedAt,
        {
          excludeVehicleId: vehicleId ?? undefined,
        },
      ),
    ]);

    return {
      ...mapped,
      capacityVehicles,
      capacityBookingProjection,
    };
  }

  private mapStationRow(station: StationBookingRulesLoadRow): StationBookingRulesStationInput {
    const calendarExceptions: StationOperationalCalendarExceptionInput[] =
      station.calendarExceptions.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        recurrenceKind: row.recurrenceKind,
        calendarDate: row.calendarDate?.toISOString().slice(0, 10) ?? null,
        monthDay: row.monthDay,
        closedAllDay: row.closedAllDay,
        slots: (row.slots as StationOperationalCalendarExceptionInput['slots']) ?? null,
        regionCode: row.regionCode,
        priority: row.priority,
        source: row.source,
      }));

    return {
      id: station.id,
      organizationId: station.organizationId,
      stationId: station.id,
      status: station.status,
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      afterHoursReturnEnabled: station.afterHoursReturnEnabled,
      keyBoxAvailable: station.keyBoxAvailable,
      timezone: station.timezone,
      openingHours: station.openingHours,
      legacyHolidayRules: station.holidayRules,
      calendarExceptions,
      temporaryOperationalRules: [],
      capacity: station.capacity,
    };
  }

  private async loadVehicleInput(
    organizationId: string,
    vehicleId: string,
  ): Promise<StationBookingRulesVehicleInput> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        status: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }

    return vehicle;
  }
}
