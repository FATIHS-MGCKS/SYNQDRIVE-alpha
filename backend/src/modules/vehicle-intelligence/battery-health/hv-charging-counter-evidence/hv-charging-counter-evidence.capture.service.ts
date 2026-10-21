import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getBatteryV2HvChargingCounterVehicleAllowlistState,
  isBatteryV2HvChargingCounterBucketCaptureEnabled,
  isBatteryV2HvChargingCounterVehicleAllowlisted,
} from '@config/battery-health-v2.config';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvChargeSessionPersistResult } from '../hv-charge-session/hv-charge-session.types';
import { DimoChargingAddedEnergyIntervalClient } from './dimo-charging-added-energy-interval.client';
import {
  buildHvChargingCounterBatchIdempotencyKeyV1,
  computeHvChargingCounterObservationSetFingerprintV1,
} from './hv-charging-counter-evidence.fingerprint.v1';
import { mapDimoIntervalRowsToBucketInputsV1 } from './hv-charging-counter-evidence.mapper.v1';
import {
  decideHvChargingCounterProviderQueryV1,
  type HvChargingCounterRevalidationAnchorV1,
} from './hv-charging-counter-evidence.revalidation.policy.v1';
import { evaluateHvChargingCounterQualityV2 } from './hv-charging-counter-evidence.counter-quality.v2';
import { getHvChargingCounterPilotAdmissionStateV1 } from './hv-charging-counter-evidence.pilot-admission.v1';
import {
  finalizePilotProviderRequestBudgetV1,
  tryReservePilotProviderRequestBudgetV1,
} from './hv-charging-counter-evidence.pilot-provider-budget.persistence.v1';
import { HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE } from './hv-charging-counter-evidence.pilot-provider-budget.v1';
import { selectHvChargingCounterPilotSessionsV1 } from './hv-charging-counter-evidence.pilot-scope.v1';
import { runWithHvChargingCounterProviderRequestGuardV1 } from './hv-charging-counter-evidence.provider-request-guard.v1';
import { HvChargingCounterEvidenceRepository } from './hv-charging-counter-evidence.repository';
import type { HvChargingCounterCaptureResultV1 } from './hv-charging-counter-evidence.types.v1';

@Injectable()
export class HvChargingCounterEvidenceCaptureService {
  private readonly logger = new Logger(HvChargingCounterEvidenceCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: HvChargingCounterEvidenceRepository,
    private readonly intervalClient: DimoChargingAddedEnergyIntervalClient,
  ) {}

  async captureForPersistResults(input: {
    organizationId: string;
    vehicleId: string;
    results: HvChargeSessionPersistResult[];
  }): Promise<HvChargingCounterCaptureResultV1[]> {
    if (!isBatteryV2HvChargingCounterBucketCaptureEnabled()) {
      return [];
    }

    const pilotAdmission = getHvChargingCounterPilotAdmissionStateV1();
    if (pilotAdmission.kind === 'deny_all') {
      return input.results.map(() => ({
        skipped: true,
        skipReason: 'pilot_mode_invalid' as const,
      }));
    }

    const outputs: HvChargingCounterCaptureResultV1[] = [];
    let candidateResults = input.results;
    if (pilotAdmission.kind === 'active') {
      for (const row of input.results) {
        if (row.session.id !== pilotAdmission.sourceHvChargeSessionId) {
          outputs.push({ skipped: true, skipReason: 'pilot_session_not_admitted' });
        }
      }
      candidateResults = input.results.filter(
        (row) => row.session.id === pilotAdmission.sourceHvChargeSessionId,
      );
    }

    const { selected, deferredCount } = selectHvChargingCounterPilotSessionsV1(candidateResults);

    for (const row of selected) {
      outputs.push(
        await this.captureForSession({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          session: row.session,
          persistResult: row,
        }),
      );
    }

    for (let i = 0; i < deferredCount; i++) {
      outputs.push({ skipped: true, skipReason: 'pilot_session_budget_exhausted' });
    }

    return outputs;
  }

  async captureForSession(input: {
    organizationId: string;
    vehicleId: string;
    session: HvChargeSessionPersistResult['session'];
    persistResult?: Pick<HvChargeSessionPersistResult, 'changed' | 'changeKind'>;
    evaluatedAt?: Date;
  }): Promise<HvChargingCounterCaptureResultV1> {
    if (!isBatteryV2HvChargingCounterBucketCaptureEnabled()) {
      return { skipped: true, skipReason: 'disabled' };
    }

    const allowlistState = getBatteryV2HvChargingCounterVehicleAllowlistState();
    if (allowlistState.kind === 'deny_all' && allowlistState.reason === 'invalid_entries') {
      return { skipped: true, skipReason: 'allowlist_invalid' };
    }
    if (!isBatteryV2HvChargingCounterVehicleAllowlisted(input.vehicleId)) {
      return { skipped: true, skipReason: 'vehicle_not_allowlisted' };
    }

    const pilotAdmission = getHvChargingCounterPilotAdmissionStateV1();
    if (pilotAdmission.kind === 'deny_all') {
      return { skipped: true, skipReason: 'pilot_mode_invalid' };
    }
    if (
      pilotAdmission.kind === 'active' &&
      input.session.id !== pilotAdmission.sourceHvChargeSessionId
    ) {
      return { skipped: true, skipReason: 'pilot_session_not_admitted' };
    }

    const session = input.session;
    if (session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
      return { skipped: true, skipReason: 'non_native_source' };
    }
    if (session.isOngoing || !session.endAt) {
      return { skipped: true, skipReason: 'ongoing_session' };
    }

    const evaluatedAt = input.evaluatedAt ?? new Date();
    const latest = await this.repository.findLatestBatchForSegment({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
    });
    const checkpoint = await this.repository.findRevalidationCheckpoint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
    });

    const anchor: HvChargingCounterRevalidationAnchorV1 | null =
      latest || checkpoint
        ? {
            segmentStartAt: latest?.segmentStartAt ?? checkpoint!.segmentStartAt,
            segmentEndAt: latest?.segmentEndAt ?? checkpoint!.segmentEndAt,
            providerObservedAt:
              latest?.providerObservedAt ?? checkpoint!.providerObservedAt,
            lastDurableBatchCreatedAt: latest?.createdAt ?? null,
            lastProviderQueryAt: checkpoint?.lastProviderQueryAt ?? null,
          }
        : null;

    if (pilotAdmission.kind !== 'active') {
      const revalidation = decideHvChargingCounterProviderQueryV1({
        anchor,
        session: {
          startAt: session.startAt,
          endAt: session.endAt,
          providerObservedAt: session.providerObservedAt,
          updatedAt: session.updatedAt,
        },
        persistResult: input.persistResult,
        evaluatedAt,
      });

      if (!revalidation.queryProvider) {
        return {
          skipped: true,
          skipReason: 'unchanged_within_revalidation_window',
          observationSetFingerprint: latest?.observationSetFingerprint,
          batchId: latest?.id,
        };
      }
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (tokenId == null) {
      return { skipped: true, skipReason: 'no_dimo_token' };
    }

    const queryWindowFrom = session.startAt;
    const queryWindowTo = session.endAt!;

    const pilotEpoch =
      pilotAdmission.kind === 'active' ? pilotAdmission.pilotEpoch : null;
    let pilotBudgetReserved = false;

    if (pilotAdmission.kind === 'active' && pilotEpoch) {
      const reserve = await tryReservePilotProviderRequestBudgetV1(this.prisma, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        pilotEpoch,
        sourceHvChargeSessionId: session.id,
        reservedAt: evaluatedAt,
      });
      if (reserve.status === 'exhausted') {
        return { skipped: true, skipReason: 'pilot_provider_budget_exhausted' };
      }
      pilotBudgetReserved = true;
    }

    const finalizePilotBudget = async (
      lifecycleState:
        | typeof HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.COMPLETED
        | typeof HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
      outcomeDetail?: string,
    ) => {
      if (!pilotBudgetReserved || !pilotEpoch) return;
      await finalizePilotProviderRequestBudgetV1(this.prisma, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        pilotEpoch,
        sourceHvChargeSessionId: session.id,
        lifecycleState,
        outcomeDetail,
        terminalAt: evaluatedAt,
      });
    };

    let fetchResult;
    try {
      if (pilotAdmission.kind === 'active') {
        fetchResult = await this.intervalClient.fetchIntervalBuckets({
          tokenId,
          from: queryWindowFrom,
          to: queryWindowTo,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        });
      } else {
        const guarded = await runWithHvChargingCounterProviderRequestGuardV1(
          this.prisma,
          input.vehicleId,
          async () =>
            this.intervalClient.fetchIntervalBuckets({
              tokenId,
              from: queryWindowFrom,
              to: queryWindowTo,
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
            }),
        );
        if (guarded.status === 'busy') {
          return { skipped: true, skipReason: 'provider_request_guard_busy' };
        }
        fetchResult = guarded.value;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (pilotBudgetReserved) {
        await finalizePilotBudget(
          HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
          message.slice(0, 500),
        );
      }
      if (/rate|429|throttl|budget|reject/i.test(message)) {
        return { skipped: true, skipReason: 'rate_limited' };
      }
      this.logger.warn(
        `HV charging counter interval fetch failed vehicle=${input.vehicleId} segment=${session.segmentFingerprint}: ${message}`,
      );
      return { skipped: true, skipReason: 'provider_error' };
    }

    if (fetchResult.status === 'no_vehicle_jwt') {
      await finalizePilotBudget(
        HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
        fetchResult.status,
      );
      return { skipped: true, skipReason: 'no_dimo_token' };
    }
    if (fetchResult.status === 'invalid_response_shape') {
      await finalizePilotBudget(
        HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
        fetchResult.status,
      );
      return { skipped: true, skipReason: 'provider_invalid_response' };
    }
    if (fetchResult.status === 'empty_interval_series') {
      await finalizePilotBudget(
        HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
        fetchResult.status,
      );
      return { skipped: true, skipReason: 'provider_empty_intervals' };
    }

    const buckets = mapDimoIntervalRowsToBucketInputsV1(fetchResult.rows);
    if (buckets.length === 0) {
      await finalizePilotBudget(
        HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
        'mapped_buckets_empty',
      );
      return { skipped: true, skipReason: 'provider_empty_intervals' };
    }

    const counterQuality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: session.startAt.toISOString(),
      sessionEndInclusive: session.endAt!.toISOString(),
      queryFromInclusive: queryWindowFrom.toISOString(),
      queryToInclusive: queryWindowTo.toISOString(),
      rows: fetchResult.rows,
    });

    const observationSetFingerprint = computeHvChargingCounterObservationSetFingerprintV1(
      buckets,
    );

    const batchIdempotencyKey = buildHvChargingCounterBatchIdempotencyKeyV1({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
      observationSetFingerprint,
    });
    const existing = await this.repository.findBatchByIdempotency({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey: batchIdempotencyKey,
    });
    if (existing) {
      await finalizePilotBudget(HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.COMPLETED, 'duplicate_batch');
      await this.repository.recordProviderRevalidationCheckpoint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        segmentFingerprint: session.segmentFingerprint,
        segmentStartAt: session.startAt,
        segmentEndAt: session.endAt,
        providerObservedAt: session.providerObservedAt,
        queriedAt: evaluatedAt,
        observationSetFingerprint,
      });
      return {
        skipped: true,
        skipReason: 'duplicate_batch',
        batchId: existing.id,
        observationSetFingerprint,
      };
    }

    const persist = await this.repository.persistBatch({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
      sourceHvChargeSessionId: session.id,
      dimoTokenId: tokenId,
      queryWindowFrom,
      queryWindowTo,
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      observationSetFingerprint,
      buckets,
      counterQuality,
    });

    await this.repository.recordProviderRevalidationCheckpoint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      queriedAt: evaluatedAt,
      observationSetFingerprint,
    });

    if (!persist.created) {
      await finalizePilotBudget(HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.COMPLETED, 'duplicate_batch');
      return {
        skipped: true,
        skipReason: 'duplicate_batch',
        batchId: persist.batchId,
        observationSetFingerprint,
      };
    }

    await finalizePilotBudget(HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.COMPLETED, 'batch_persisted');

    return {
      skipped: false,
      batchId: persist.batchId,
      observationSetFingerprint,
      bucketsWritten: buckets.length,
      revisionsCreated: persist.revisionsCreated,
      counterQuality,
    };
  }
}
