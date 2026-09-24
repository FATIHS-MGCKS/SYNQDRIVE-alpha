import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
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
import {
  shouldAttemptFallbackDetection,
  shouldPersistFallbackCandidate,
} from './hv-fallback-charge-session-activation.policy';
import { alignFallbackDraftToPersistedAnchor } from './hv-fallback-charge-session-anchor.policy';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from './hv-charge-session.types';
import { recordErdE3ConvergenceMetric } from './hv-erd-convergence.metrics';

export interface HvFallbackChargeSessionDetectResult {
  skipped: boolean;
  skipReason?:
    | 'disabled'
    | 'recharge_segments_available'
    | 'no_observations'
    | 'no_sessions'
    | 'ice_only'
    | 'insufficient_telemetry_capability';
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
    private readonly metrics: TripMetricsService,
  ) {}

  async detectAndPersistForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    from?: Date;
    to?: Date;
    correlationId?: string | null;
    evaluatedAt?: Date;
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

    const evaluatedAt = input.evaluatedAt ?? input.to ?? new Date();

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { fuelType: true },
    });

    const profile = await this.hvMethodProfile.resolveForVehicle({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      now: evaluatedAt,
    });

    const activation = shouldAttemptFallbackDetection({
      profile,
      fuelType: vehicle?.fuelType ?? null,
    });
    if (!activation.allowed) {
      const skipReason =
        activation.reason === 'ice_only' ||
        activation.reason === 'insufficient_telemetry_capability'
          ? activation.reason
          : 'insufficient_telemetry_capability';
      return {
        skipped: true,
        skipReason,
        detected: 0,
        persisted: 0,
        rejectedFalsePositives: 0,
        results: [],
      };
    }

    const to = input.to ?? evaluatedAt;
    const from =
      input.from ??
      new Date(to.getTime() - HV_RECHARGE_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const observations = await this.loadObservations(
      input.vehicleId,
      from,
      to,
      profile.isChargingAvailable,
      profile.chargingCableConnectedAvailable,
    );
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

    const detection = detectFallbackChargeSessions(observations, evaluatedAt);
    recordErdE3ConvergenceMetric(
      this.metrics,
      'fallback_detected',
      detection.sessions.length,
    );
    recordErdE3ConvergenceMetric(
      this.metrics,
      'fallback_rejected',
      detection.rejectedFalsePositives,
    );

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

    const nativeSessions = await this.prisma.hvChargeSession.findMany({
      where: {
        vehicleId: input.vehicleId,
        source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      },
    });

    const fallbackRows = await this.prisma.hvChargeSession.findMany({
      where: {
        vehicleId: input.vehicleId,
        source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
      },
    });

    const results: HvChargeSessionPersistResult[] = [];
    for (const candidate of detection.sessions) {
      const persistDecision = shouldPersistFallbackCandidate({
        vehicleId: input.vehicleId,
        candidate,
        nativeSessions,
        evaluatedAt,
      });
      if (!persistDecision.allowed) {
        continue;
      }

      let draft = mapFallbackCandidateToHvChargeSessionDraft({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        candidate,
        reconciledAt: evaluatedAt,
      });
      draft = alignFallbackDraftToPersistedAnchor({
        vehicleId: input.vehicleId,
        candidate,
        draft,
        existingFallbackRows: fallbackRows,
        evaluatedAt,
      });

      const result = await this.persist.persistSessionDraft({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft,
        correlationId:
          input.correlationId ??
          `hv-fallback:${input.vehicleId}:${draft.segmentFingerprint}`,
      });
      if (result.created) {
        recordErdE3ConvergenceMetric(this.metrics, 'fallback_created');
      } else if (result.changed) {
        recordErdE3ConvergenceMetric(this.metrics, 'fallback_updated');
      }
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
    isChargingCapabilityAvailable: boolean,
    cableCapabilityAvailable: boolean,
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
      isCharging: isChargingCapabilityAvailable ? snapshot.isCharging : null,
      cableConnected: cableCapabilityAvailable
        ? snapshot.chargingCableConnected
        : null,
      chargingPowerKw: snapshot.chargingPowerKw,
      addedEnergyKwh: resolveAddedEnergy(snapshot.recordedAt),
    }));
  }
}
