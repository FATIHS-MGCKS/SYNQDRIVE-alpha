import { Injectable, Logger } from '@nestjs/common';
import { TripDetectionState } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { LvRestWindowEventType } from '../battery-v2-domain';
import type { BatteryObservationSnapshotContext } from '../jobs/battery-v2-snapshot-context.types';
import {
  buildLvRestWindowPolicyContext,
  isChargingContext,
  isWakeVoltage,
} from './lv-rest-window.policy';
import { LvRestWindowStateMachineService } from './lv-rest-window.service';
import type { LvRestWindowSignalContext } from './lv-rest-window.types';

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isPlausibleLvVoltage(v: number | null | undefined): boolean {
  return v != null && v >= 9.0 && v <= 16.0;
}

/**
 * Battery-internal bridge: observation classify → canonical LV REST FSM.
 * Reads trip detection + latest state only; never mutates Trip Detection.
 */
@Injectable()
export class LvRestWindowIngestionBridgeService {
  private readonly logger = new Logger(LvRestWindowIngestionBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fsm: LvRestWindowStateMachineService,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async processObservationCycle(
    organizationId: string,
    vehicleId: string,
    ctx: BatteryObservationSnapshotContext,
  ): Promise<void> {
    if (!isBatteryV2RestShadowEnabled()) {
      return;
    }

    const overrides = this.buildOverridesFromSnapshotContext(ctx);
    const signal = await this.fsm.buildSignalFromLatestState(vehicleId, overrides);
    if (!signal) {
      return;
    }

    const detState = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { state: true, lastActivityAt: true, activeTripId: true },
    });

    const policy = buildLvRestWindowPolicyContext(
      await this.policyProfiles.resolveForVehicle(vehicleId),
    );
    const at = signal.observedAt;

    if (signal.hasActiveTrip) {
      await this.fsm.processEvent(organizationId, vehicleId, {
        type: LvRestWindowEventType.NEW_TRIP_STARTED,
        at,
        signal,
      });
    }

    if (isChargingContext(signal)) {
      await this.fsm.processEvent(organizationId, vehicleId, {
        type: LvRestWindowEventType.CHARGING_DETECTED,
        at,
        signal,
      });
    }

    if (isWakeVoltage(signal.lvVoltage, policy.wakeVoltageThreshold)) {
      await this.fsm.processEvent(organizationId, vehicleId, {
        type: LvRestWindowEventType.WAKE_DETECTED,
        at,
        signal,
      });
    }

    if (
      detState?.state === TripDetectionState.RESTING &&
      detState.lastActivityAt &&
      !detState.activeTripId
    ) {
      const tripEndedSignal: LvRestWindowSignalContext = {
        ...signal,
        hasActiveTrip: false,
        lastActivityAt: detState.lastActivityAt,
        tripEndAt: detState.lastActivityAt,
        tripId: null,
      };
      await this.fsm.processEvent(organizationId, vehicleId, {
        type: LvRestWindowEventType.TRIP_ENDED,
        at,
        signal: tripEndedSignal,
      });
    }

    if (isPlausibleLvVoltage(ctx.lvBatteryVoltage)) {
      const snapshotSignal = await this.fsm.buildSignalFromLatestState(
        vehicleId,
        overrides,
      );
      if (snapshotSignal) {
        await this.fsm.processEvent(organizationId, vehicleId, {
          type: LvRestWindowEventType.REST_SNAPSHOT,
          at: snapshotSignal.observedAt,
          signal: snapshotSignal,
        });
      }
    }

    this.logger.debug(
      `LV REST FSM observation cycle processed vehicle=${vehicleId}`,
    );
  }

  private buildOverridesFromSnapshotContext(
    ctx: BatteryObservationSnapshotContext,
  ): Partial<LvRestWindowSignalContext> {
    const observedAt =
      parseIso(ctx.lvBatteryObservedAt) ??
      parseIso(ctx.collectionObservedAt) ??
      parseIso(ctx.providerFetchedAt);
    const providerObservedAt =
      parseIso(ctx.lvBatteryObservedAt) ??
      parseIso(ctx.collectionObservedAt) ??
      null;

    const overrides: Partial<LvRestWindowSignalContext> = {};

    if (observedAt) {
      overrides.observedAt = observedAt;
    }
    if (providerObservedAt) {
      overrides.providerObservedAt = providerObservedAt;
    }
    if (ctx.lvBatteryVoltage != null) {
      overrides.lvVoltage = ctx.lvBatteryVoltage;
    }
    if (ctx.tractionBatteryIsCharging != null) {
      overrides.isHvCharging = ctx.tractionBatteryIsCharging;
    } else if (ctx.tractionBatteryChargingPowerKw != null) {
      overrides.isHvCharging = ctx.tractionBatteryChargingPowerKw > 0;
    }

    return overrides;
  }
}
