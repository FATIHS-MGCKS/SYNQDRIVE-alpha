import { Injectable, Logger } from '@nestjs/common';
import { TripDetectionState, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { LvRestWindowEventType } from '../battery-v2-domain';
import type { BatteryObservationSnapshotContext } from '../jobs/battery-v2-snapshot-context.types';
import {
  buildLvRestWindowPolicyContext,
  isChargingContext,
  isPlausibleLvVoltage,
  isWakeVoltage,
} from './lv-rest-window.policy';
import { LvRestWindowStateMachineService } from './lv-rest-window.service';
import { LvRestWindowSessionArmingService } from './lv-rest-window-session-arming.service';
import type { LvRestWindowSignalContext } from './lv-rest-window.types';

/** Anchor tolerance between det-state lastActivityAt and trip.endTime. */
const TRIP_END_ANCHOR_TOLERANCE_MS = 120_000;

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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
    private readonly sessionArming: LvRestWindowSessionArmingService,
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
      // Converge on the canonical finalized-trip session opener: the anchor
      // authority is the COMPLETED trip's endTime, and the session gets trip
      // linkage. Anchors without a canonical finalized trip (e.g. discarded
      // low-quality trips still leave lastActivityAt behind) keep the legacy
      // direct TRIP_ENDED emission into the same FSM.
      const finalizedTrip = await this.resolveFinalizedTripForAnchor(
        vehicleId,
        detState.lastActivityAt,
      );

      if (finalizedTrip) {
        await this.sessionArming.ensureLvRestWindowForFinalizedTrip({
          organizationId,
          vehicleId,
          tripId: finalizedTrip.id,
        });
      } else {
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

  /**
   * Resolves the authoritative COMPLETED trip whose endTime matches the
   * detection-state rest anchor (same ±120s consistency tolerance the FSM
   * gate applies between tripEndAt and lastActivityAt). Read-only — Trip
   * Detection remains the sole trip lifecycle authority.
   */
  private async resolveFinalizedTripForAnchor(
    vehicleId: string,
    lastActivityAt: Date,
  ): Promise<{ id: string } | null> {
    const anchorMs = lastActivityAt.getTime();
    const candidates = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: TripStatus.COMPLETED,
        endTime: {
          gte: new Date(anchorMs - TRIP_END_ANCHOR_TOLERANCE_MS),
          lte: new Date(anchorMs + TRIP_END_ANCHOR_TOLERANCE_MS),
        },
      },
      select: { id: true, endTime: true },
      orderBy: { endTime: 'desc' },
      take: 10,
    });
    if (candidates.length === 0) return null;
    const exact = candidates.find(
      (trip) =>
        trip.endTime &&
        Math.abs(trip.endTime.getTime() - anchorMs) < 1_000,
    );
    if (exact?.endTime) {
      return { id: exact.id };
    }
    if (candidates.length === 1) {
      return { id: candidates[0].id };
    }
    // When multiple trips fall inside the tolerance window, bind the anchor
    // to the trip whose endTime is closest to lastActivityAt — not merely
    // the latest endTime, which can belong to a different rest period.
    let best = candidates[0];
    let bestDelta = Math.abs(best.endTime!.getTime() - anchorMs);
    for (const trip of candidates.slice(1)) {
      if (!trip.endTime) continue;
      const delta = Math.abs(trip.endTime.getTime() - anchorMs);
      if (delta < bestDelta) {
        best = trip;
        bestDelta = delta;
      }
    }
    return { id: best.id };
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
