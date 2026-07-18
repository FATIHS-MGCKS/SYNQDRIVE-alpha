import { BadRequestException, Injectable } from '@nestjs/common';
import { Station } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationsV2ConfigService } from '../stations-v2-config.service';
import {
  assessBookingStationRulesWithEnforcementMode,
  resolveStationsV2BookingRulesGate,
} from '@shared/stations/stations-v2-booking-rules-enforcement.util';
import { isOpenAt } from './station-opening-calendar.util';
import {
  StationBookingRulesInput,
  StationBookingRulesResult,
  StationRuleEvaluation,
  StationRuleOutcome,
} from './station-rule.types';

@Injectable()
export class StationRuleEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationsV2Config: StationsV2ConfigService,
  ) {}

  async evaluate(
    input: StationBookingRulesInput,
  ): Promise<StationBookingRulesResult> {
    const flags = this.stationsV2Config.resolve(input.organizationId);
    const gate = resolveStationsV2BookingRulesGate({
      enabled: flags.stationBookingRulesEnabled,
      enforcement: flags.bookingRulesEnforcement,
      capacityWarningsEnabled: flags.stationCapacityWarningsEnabled,
    });

    if (!gate.evaluate) {
      return { evaluations: [], overallOutcome: 'ALLOWED' };
    }

    const stationIds = [
      input.pickupStationId,
      input.returnStationId,
      input.actualPickupStationId,
      input.actualReturnStationId,
    ].filter(Boolean) as string[];

    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({
            where: { organizationId: input.organizationId, id: { in: stationIds } },
          })
        : [];
    const byId = new Map(stations.map((s) => [s.id, s]));

    const evaluations: StationRuleEvaluation[] = [];

    if (input.pickupStationId) {
      evaluations.push(
        ...this.evaluateStationUse(
          byId.get(input.pickupStationId),
          'pickup',
          input.pickupStationId,
          input.pickupAt,
        ),
      );
    }
    if (input.returnStationId) {
      evaluations.push(
        ...this.evaluateStationUse(
          byId.get(input.returnStationId),
          'return',
          input.returnStationId,
          input.returnAt,
        ),
      );
    }

    if (input.isOneWayRental && input.pickupStationId && input.returnStationId) {
      if (input.pickupStationId === input.returnStationId) {
        evaluations.push({
          outcome: 'BLOCKED',
          ruleId: 'ONE_WAY_MISMATCH',
          message: 'One-way rental requires different pickup and return stations',
          field: 'return',
        });
      }
    }

    if (input.pickupStationId && flags.stationCapacityWarningsEnabled) {
      const capEval = await this.evaluateCapacity(input.organizationId, input.pickupStationId);
      if (capEval) evaluations.push(capEval);
    }

    const overallOutcome = this.maxOutcome(evaluations.map((e) => e.outcome));
    return { evaluations, overallOutcome };
  }

  async assertBookingPersistenceAllowed(
    organizationId: string,
    input: StationBookingRulesInput,
  ): Promise<StationBookingRulesResult> {
    const result = await this.evaluate({ ...input, organizationId });
    const flags = this.stationsV2Config.resolve(organizationId);
    const gate = resolveStationsV2BookingRulesGate({
      enabled: flags.stationBookingRulesEnabled,
      enforcement: flags.bookingRulesEnforcement,
      capacityWarningsEnabled: flags.stationCapacityWarningsEnabled,
    });

    const assessment = assessBookingStationRulesWithEnforcementMode(
      {
        allowed: result.overallOutcome === 'ALLOWED' || result.overallOutcome === 'WARNING',
        blocked: result.overallOutcome === 'BLOCKED',
        manualOverrideRequired: result.overallOutcome === 'MANUAL_CONFIRMATION_REQUIRED',
      },
      flags.bookingRulesEnforcement,
    );

    if (!gate.enforcePersistenceBlock) return result;

    if (assessment.blocked) {
      const blocked = result.evaluations.find((e) => e.outcome === 'BLOCKED');
      throw new BadRequestException(blocked?.message ?? 'Booking blocked by station rules');
    }
    if (assessment.manualOverrideRequired) {
      throw new BadRequestException('Manual confirmation required for station rule override');
    }
    return result;
  }

  private evaluateStationUse(
    station: Station | undefined,
    field: 'pickup' | 'return',
    stationId: string,
    at?: Date | null,
  ): StationRuleEvaluation[] {
    if (!station) {
      return [
        {
          outcome: 'BLOCKED',
          ruleId: 'STATION_NOT_FOUND',
          message: `Station ${stationId} not found`,
          stationId,
          field,
        },
      ];
    }

    const out: StationRuleEvaluation[] = [];
    if (station.status === 'ARCHIVED') {
      out.push({
        outcome: 'BLOCKED',
        ruleId: 'STATION_ARCHIVED',
        message: `Station "${station.name}" is archived`,
        stationId,
        field,
      });
    } else if (station.status !== 'ACTIVE') {
      out.push({
        outcome: 'WARNING',
        ruleId: 'STATION_INACTIVE',
        message: `Station "${station.name}" is not active`,
        stationId,
        field,
      });
    }

    if (field === 'pickup' && !station.pickupEnabled) {
      out.push({
        outcome: 'BLOCKED',
        ruleId: 'PICKUP_DISABLED',
        message: `Station "${station.name}" does not allow pickups`,
        stationId,
        field,
      });
    }
    if (field === 'return' && !station.returnEnabled) {
      out.push({
        outcome: 'BLOCKED',
        ruleId: 'RETURN_DISABLED',
        message: `Station "${station.name}" does not allow returns`,
        stationId,
        field,
      });
    }

    if (at) {
      const open = isOpenAt(station, at, field);
      if (!open.open) {
        const outcome: StationRuleOutcome =
          open.reason === 'HOLIDAY_CLOSED' ? 'WARNING' : 'WARNING';
        out.push({
          outcome,
          ruleId: open.reason ?? 'OUTSIDE_OPENING_HOURS',
          message: `Station "${station.name}" may be closed at selected time`,
          stationId,
          field,
        });
      }
    }

    return out;
  }

  private async evaluateCapacity(
    organizationId: string,
    stationId: string,
  ): Promise<StationRuleEvaluation | null> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true, name: true, capacity: true },
    });
    if (!station?.capacity) return null;

    const homeCount = await this.prisma.vehicle.count({
      where: { organizationId, homeStationId: stationId },
    });
    if (homeCount >= station.capacity) {
      return {
        outcome: 'MANUAL_CONFIRMATION_REQUIRED',
        ruleId: 'CAPACITY_EXCEEDED',
        message: `Station "${station.name}" is at or over capacity (${homeCount}/${station.capacity})`,
        stationId,
        field: 'pickup',
      };
    }
    return null;
  }

  private maxOutcome(outcomes: StationRuleOutcome[]): StationRuleOutcome {
    const rank: Record<StationRuleOutcome, number> = {
      ALLOWED: 0,
      WARNING: 1,
      MANUAL_CONFIRMATION_REQUIRED: 2,
      BLOCKED: 3,
    };
    return outcomes.reduce<StationRuleOutcome>(
      (max, o) => (rank[o] > rank[max] ? o : max),
      'ALLOWED',
    );
  }
}
