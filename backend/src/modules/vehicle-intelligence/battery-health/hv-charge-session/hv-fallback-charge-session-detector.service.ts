import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isBatteryV2HvFallbackChargeSessionEnabled,
  isBatteryV2HvRechargeSessionEnabled,
} from '@config/battery-health-v2.config';
import { HvMethodProfileService } from '../hv-method-profile/hv-method-profile.service';
import { mapFallbackCandidateToHvChargeSessionDraft } from './hv-fallback-charge-session.mapper';
import { detectFallbackChargeSessions } from './hv-fallback-charge-session.policy';
import type { HvFallbackChargeObservation } from './hv-fallback-charge-session.types';
import { HvChargeSessionPersistService } from './hv-charge-session-persist.service';
import type { HvChargeSessionPersistResult } from './hv-charge-session.types';
import { HV_RECHARGE_ROLLING_WINDOW_DAYS } from './hv-recharge-session-reconcile.policy';

export interface HvFallbackChargeSessionDetectResult {
  skipped: boolean;
  skipReason?:
    | 'disabled'
    | 'recharge_segments_available'
    | 'no_observations'
    | 'no_sessions';
  detected: number;
  persisted: number;
  rejectedFalsePositives: number;
  results: HvChargeSessionPersistResult[];
}

@Injectable()
export class HvFallbackChargeSessionDetectorService {
  private readonly logger = new Logger(HvFallbackChargeSessionDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hvMethodProfile: HvMethodProfileService,
    private readonly persist: HvChargeSessionPersistService,
  ) {}

  async detectAndPersistForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    from?: Date;
    to?: Date;
    correlationId?: string | null;
  }): Promise<HvFallbackChargeSessionDetectResult> {
    if (
      !isBatteryV2HvRechargeSessionEnabled() ||
      !isBatteryV2HvFallbackChargeSessionEnabled()
    ) {
      return {
        skipped: true,
        skipReason: 'disabled',
        detected: 0,
        persisted: 0,
        rejectedFalsePositives: 0,
        results: [],
      };
    }

    const profile = await this.hvMethodProfile.resolveForVehicle({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });

    if (profile.rechargeSegmentsAvailable) {
      return {
        skipped: true,
        skipReason: 'recharge_segments_available',
        detected: 0,
        persisted: 0,
        rejectedFalsePositives: 0,
        results: [],
      };
    }

    const to = input.to ?? new Date();
    const from =
      input.from ??
      new Date(to.getTime() - HV_RECHARGE_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const observations = await this.loadObservations(input.vehicleId, from, to);
    if (observations.length < 2) {
      return {
        skipped: true,
        skipReason: 'no_observations',
        detected: 0,
        persisted: 0,
        rejectedFalsePositives: 0,
        results: [],
      };
    }

    const detection = detectFallbackChargeSessions(observations, to);
    if (detection.sessions.length === 0) {
      return {
        skipped: true,
        skipReason: 'no_sessions',
        detected: 0,
        persisted: 0,
        rejectedFalsePositives: detection.rejectedFalsePositives,
        results: [],
      };
    }

    const results: HvChargeSessionPersistResult[] = [];
    for (const candidate of detection.sessions) {
      const draft = mapFallbackCandidateToHvChargeSessionDraft({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        candidate,
      });
      const result = await this.persist.persistSessionDraft({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft,
        correlationId:
          input.correlationId ??
          `hv-fallback:${input.vehicleId}:${draft.segmentFingerprint}`,
      });
      results.push(result);
    }

    this.logger.debug(
      `HV fallback charge sessions vehicle=${input.vehicleId} detected=${detection.sessions.length} persisted=${results.length} rejected=${detection.rejectedFalsePositives}`,
    );

    return {
      skipped: false,
      detected: detection.sessions.length,
      persisted: results.length,
      rejectedFalsePositives: detection.rejectedFalsePositives,
      results,
    };
  }

  private async loadObservations(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<HvFallbackChargeObservation[]> {
    const snapshots = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: {
        vehicleId,
        recordedAt: { gte: from, lte: to },
      },
      orderBy: { recordedAt: 'asc' },
      select: {
        recordedAt: true,
        providerReceivedAt: true,
        socPercent: true,
        energyUsedKwh: true,
        isCharging: true,
        chargingCableConnected: true,
        chargingPowerKw: true,
      },
    });

    if (snapshots.length === 0) return [];

    const addedEnergyEvidence = await this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.ADDED_ENERGY_KWH,
        observedAt: { gte: from, lte: to },
      },
      orderBy: { observedAt: 'asc' },
      select: {
        observedAt: true,
        numericValue: true,
      },
    });

    const addedEnergyByTime = new Map<number, number>();
    for (const row of addedEnergyEvidence) {
      if (row.observedAt && row.numericValue != null) {
        addedEnergyByTime.set(row.observedAt.getTime(), row.numericValue);
      }
    }

    const resolveAddedEnergy = (recordedAt: Date): number | null => {
      const exact = addedEnergyByTime.get(recordedAt.getTime());
      if (exact != null) return exact;
      let closest: number | null = null;
      let closestDelta = Number.POSITIVE_INFINITY;
      for (const [time, value] of addedEnergyByTime) {
        const delta = Math.abs(time - recordedAt.getTime());
        if (delta < closestDelta && delta <= 60_000) {
          closestDelta = delta;
          closest = value;
        }
      }
      return closest;
    };

    return snapshots.map((snapshot) => ({
      recordedAt: snapshot.recordedAt,
      providerReceivedAt: snapshot.providerReceivedAt,
      socPercent: snapshot.socPercent,
      energyKwh: snapshot.energyUsedKwh,
      isCharging: snapshot.isCharging,
      cableConnected: snapshot.chargingCableConnected,
      chargingPowerKw: snapshot.chargingPowerKw,
      addedEnergyKwh: resolveAddedEnergy(snapshot.recordedAt),
    }));
  }
}
