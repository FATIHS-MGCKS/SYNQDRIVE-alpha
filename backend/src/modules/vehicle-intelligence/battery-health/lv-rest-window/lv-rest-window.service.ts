import { Injectable } from '@nestjs/common';
import {
  BatteryMeasurementSession,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mapLvRestWindowStateToSessionStatus,
  LvRestWindowState,
} from '../battery-v2-domain';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryMeasurementSessionRepository } from '../battery-measurement-session.repository';
import { buildLvRestWindowPolicyContext } from './lv-rest-window.policy';
import {
  mapSessionStatusToLvRestWindowState,
  parseLvRestWindowRecord,
  reduceLvRestWindow,
} from './lv-rest-window.state-machine';
import type { LvRestWindowEvent, LvRestWindowSignalContext } from './lv-rest-window.types';

@Injectable()
export class LvRestWindowStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: BatteryMeasurementSessionRepository,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async processEvent(
    organizationId: string,
    vehicleId: string,
    event: LvRestWindowEvent,
  ) {
    const policy = buildLvRestWindowPolicyContext(
      await this.policyProfiles.resolveForVehicle(vehicleId),
    );

    const openSession = await this.sessions.findOpenLvRestWindow(vehicleId);
    const current = openSession
      ? parseLvRestWindowRecord(
          openSession,
          mapSessionStatusToLvRestWindowState(
            openSession.status,
            this.readMetadataState(openSession.metadata),
          ) ?? LvRestWindowState.CANDIDATE,
        )
      : null;

    const transition = reduceLvRestWindow(
      vehicleId,
      current,
      event,
      policy,
    );

    if (!transition.changed || !transition.current) {
      return transition;
    }

    const next = transition.current;
    const sessionStatus = mapLvRestWindowStateToSessionStatus(next.state);
    const metadata = this.buildMetadata(next);

    if (!openSession || transition.reason === 'opened_candidate') {
      await this.sessions.createIdempotent({
        organizationId,
        vehicleId,
        scope: 'LV',
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: sessionStatus,
        startedAt: next.startedAt,
        endedAt: this.isTerminal(next.state) ? event.at : null,
        tripId: next.tripId,
        idempotencyKey: next.windowId,
        providerSource: 'DIMO',
        sourceEntityType: 'trip',
        sourceEntityId: next.tripId,
        metadata,
      });
      return transition;
    }

    await this.sessions.updateMutable({
      organizationId,
      sessionId: openSession.id,
      status: sessionStatus,
      endedAt: this.isTerminal(next.state) ? event.at : null,
      metadata,
    });

    return transition;
  }

  async buildSignalFromLatestState(
    vehicleId: string,
    overrides: Partial<LvRestWindowSignalContext> = {},
  ): Promise<LvRestWindowSignalContext | null> {
    const row = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        latestState: {
          select: {
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            lvBatteryVoltage: true,
            tractionBatteryIsCharging: true,
            tractionBatteryChargingPowerKw: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
          },
        },
        tripDetectionState: {
          select: {
            state: true,
            activeTripId: true,
            lastActivityAt: true,
          },
        },
      },
    });

    if (!row?.latestState) return null;

    const observedAt =
      row.latestState.sourceTimestamp ??
      row.latestState.providerFetchedAt ??
      new Date();

    return {
      observedAt,
      providerObservedAt: row.latestState.sourceTimestamp,
      providerError: false,
      speedKmh: row.latestState.speedKmh,
      ignitionOn: row.latestState.isIgnitionOn,
      engineRunning:
        row.latestState.engineLoad != null && row.latestState.engineLoad > 5
          ? true
          : row.latestState.engineLoad != null
            ? false
            : null,
      hasActiveTrip: row.tripDetectionState?.activeTripId != null,
      isLvCharging: false,
      isHvCharging:
        row.latestState.tractionBatteryIsCharging === true ||
        (row.latestState.tractionBatteryChargingPowerKw ?? 0) > 0,
      lvVoltage: row.latestState.lvBatteryVoltage,
      lastActivityAt: row.tripDetectionState?.lastActivityAt ?? null,
      tripEndAt: overrides.tripEndAt ?? row.tripDetectionState?.lastActivityAt ?? null,
      tripId: overrides.tripId ?? row.tripDetectionState?.activeTripId ?? null,
      ...overrides,
    };
  }

  private isTerminal(state: LvRestWindowState): boolean {
    return (
      state === LvRestWindowState.INVALIDATED ||
      state === LvRestWindowState.COMPLETED ||
      state === LvRestWindowState.EXPIRED
    );
  }

  private readMetadataState(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const value = (metadata as Record<string, unknown>).lvRestWindowState;
    return typeof value === 'string' ? value : null;
  }

  private buildMetadata(
    record: ReturnType<typeof parseLvRestWindowRecord>,
  ): Prisma.InputJsonValue {
    return {
      lvRestWindowState: record.state,
      anchorAt: record.anchorAt.toISOString(),
      lastTransitionAt: record.lastTransitionAt.toISOString(),
      confirmedRestingAt: record.confirmedRestingAt?.toISOString() ?? null,
      invalidatedReason: record.invalidatedReason,
      lastEventType: record.lastEventType,
    };
  }
}
